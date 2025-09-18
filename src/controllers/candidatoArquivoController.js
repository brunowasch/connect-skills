// controllers/candidatoArquivoController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const path = require('path');

/* =========================
 * Helpers
 * ========================= */
async function getCandidatoBySession(req) {
  const usuario = req.session?.usuario;
  const sessCand = req.session?.candidato;

  if (usuario?.tipo === 'candidato' && sessCand?.id) {
    const candidato = await prisma.candidato.findUnique({
      where: { id: Number(sessCand.id) },
    });
    if (!candidato) throw new Error('Candidato não encontrado para este usuário (sessão).');
    return candidato;
  }

  if (!usuario || usuario.tipo !== 'candidato') {
    throw new Error('Acesso negado: usuário não autenticado como candidato.');
  }

  const candidato = await prisma.candidato.findUnique({
    where: { usuario_id: Number(usuario.id) },
  });
  if (!candidato) throw new Error('Candidato não encontrado para este usuário.');
  return candidato;
}

// tamanho legível
function humanFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  do { bytes /= thresh; ++u; } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

// tenta corrigir nomes com mojibake ("CurrÃ­culo" -> "Currículo")
function fixMojibake(str) {
  if (!str) return str;
  // heurística simples: se aparecer 'Ã' ou '�', redecodifica como latin1->utf8
  if (/[Ã�]/.test(str)) {
    try { return Buffer.from(str, 'latin1').toString('utf8'); } catch { return str; }
  }
  return str;
}

// best-effort: extrair public_id Cloudinary a partir da URL
function tryExtractPublicIdFromCloudinaryUrl(url) {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('res.cloudinary.com')) return null;
    const parts = urlObj.pathname.split('/upload/');
    if (parts.length < 2) return null;
    const afterUpload = parts[1].replace(/^v[0-9]+\//, '');
    const withoutExt = afterUpload.replace(/\.[a-z0-9]+$/i, '');
    return withoutExt;
  } catch {
    return null;
  }
}

/* =========================
 * Tela (não usada mais): redireciona para editar-perfil
 * ========================= */
exports.telaAnexos = async (req, res) => {
  return res.redirect('/candidato/editar-perfil');
};

/* =========================
 * Upload de arquivos
 * ========================= */
exports.uploadAnexos = async (req, res) => {
  const back = '/candidato/editar-perfil';
  try {
    const candidato = await getCandidatoBySession(req);

    const files = req.files || [];
    if (!files.length) {
      req.flash?.('erro', 'Nenhum arquivo enviado.');
      return res.redirect(back);
    }

    let count = 0;
    for (const file of files) {
      const originalNameRaw = file.originalname || 'arquivo';
      // corrige nomes bugados e mantém a extensão
      const parsed = path.parse(originalNameRaw);
      const fixedBase = fixMojibake(parsed.name);
      const finalName = fixedBase + (parsed.ext || '');

      const folder = `connect-skills/candidatos/${candidato.id}/anexos`;

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'auto',
            // não seto public_id => evita overwrite involuntário quando o usuário sobe 2 "Currículo.pdf"
            overwrite: false,
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(file.buffer);
      });

      await prisma.candidato_arquivo.create({
        data: {
          candidato_id: candidato.id,
          nome: finalName,                   // <<< nome “bonito”
          url: uploadResult.secure_url,
          mime: file.mimetype,
          tamanho: file.size,
        },
      });

      count++;
    }

    req.flash?.('msg', `${count} arquivo(s) enviado(s) com sucesso.`);
    res.redirect(back);
  } catch (err) {
    console.error('Erro no upload de anexos:', err);
    req.flash?.('erro', 'Falha ao enviar arquivos. Tente novamente.');
    res.redirect(back);
  }
};

/* =========================
 * Salvar link
 * ========================= */
exports.salvarLink = async (req, res) => {
  const back = '/candidato/editar-perfil';
  try {
    const candidato = await getCandidatoBySession(req);
    let { label, url } = req.body;

    url = String(url || '').trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      req.flash?.('erro', 'Informe uma URL válida iniciando com http(s)://');
      return res.redirect(back);
    }

    const nome = fixMojibake(String(label || 'Link').trim());

    await prisma.candidato_arquivo.create({
      data: {
        candidato_id: candidato.id,
        nome,
        url,
        mime: 'text/uri-list',
        tamanho: 0,
      },
    });

    req.flash?.('msg', 'Link adicionado com sucesso.');
    res.redirect(back);
  } catch (err) {
    console.error('Erro ao salvar link:', err);
    req.flash?.('erro', 'Não foi possível salvar o link.');
    res.redirect(back);
  }
};

/* =========================
 * Deletar anexo
 * ========================= */
exports.deletarAnexo = async (req, res) => {
  const back = '/candidato/editar-perfil';
  try {
    const candidato = await getCandidatoBySession(req);
    const { id } = req.params;

    const anexo = await prisma.candidato_arquivo.findUnique({ where: { id: Number(id) } });
    if (!anexo || anexo.candidato_id !== candidato.id) {
      req.flash?.('erro', 'Anexo não encontrado.');
      return res.redirect(back);
    }

    const publicId = tryExtractPublicIdFromCloudinaryUrl(anexo.url);
    if (publicId) {
      try {
        // tenta nas 3 categorias possíveis
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      } catch (e) {
        console.warn('Não foi possível remover no Cloudinary:', e?.message);
      }
    }

    await prisma.candidato_arquivo.delete({ where: { id: anexo.id } });

    req.flash?.('msg', 'Anexo excluído.');
    res.redirect(back);
  } catch (err) {
    console.error('Erro ao deletar anexo:', err);
    req.flash?.('erro', 'Não foi possível excluir o anexo.');
    res.redirect(back);
  }
};
