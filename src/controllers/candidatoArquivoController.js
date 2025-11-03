const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const path = require('path');
const axios = require('axios');

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
  if (/[Ã�]/.test(str)) {
    try { return Buffer.from(str, 'latin1').toString('utf8'); } catch { return str; }
  }
  return str;
}

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

function slugify(s) {
  return String(s)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') 
    .replace(/[^a-zA-Z0-9._-]+/g, '-')                 
    .replace(/-+/g, '-').replace(/^-|-$/g, '')         
    .toLowerCase();
}

const sanitizeFilename = (name = 'arquivo') =>
  String(name).replace(/[/\\?%*:|"<>]/g, '').trim() || 'arquivo';

function normalizeViewUrl(u) {
  let url = String(u || '').trim();
  if (!url) return '';
  url = url
    .replace(/\/upload\/(?:[^/]*,)?fl_attachment(?:[^/]*,)?\//, '/upload/')
    .replace(/(\?|&)fl_attachment(=[^&]*)?/gi, '')
    .replace(/(\?|&)response-content-disposition=attachment/gi, '')
    .replace(/(\?|&)download=1\b/gi, '$1');
  url = url.replace(/\?dl=1\b/, '?raw=1').replace(/\?dl=0\b/, '?raw=1');
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m && m[1]) url = `https://drive.google.com/uc?export=view&id=${m[1]}`;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

exports.telaAnexos = async (req, res) => {
  return res.redirect('/candidato/editar-perfil');
};

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
      const parsed = path.parse(originalNameRaw);
      const fixedBase = fixMojibake(parsed.name);
      const finalName = fixedBase + (parsed.ext || '');

      const folder = `connect-skills/candidatos/${candidato.id}/anexos`;

      // decide o tipo
      const isImage = /^image\//i.test(file.mimetype);
      const isPDF = file.mimetype === 'application/pdf';
      const resourceType = isPDF ? 'raw' : (isImage ? 'image' : 'auto');

      const publicId = `${slugify(fixedBase)}-${Date.now()}`;

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
            public_id: publicId,
            overwrite: false,
            use_filename: true,
            unique_filename: false,
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(file.buffer);
      });

      await prisma.candidato_arquivo.create({
        data: {
          candidato_id: candidato.id,
          nome: finalName,
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

exports.abrirAnexo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send('ID inválido.');

    const file = await prisma.candidato_arquivo.findUnique({
      where: { id },
      select: { url: true }
    });
    if (!file?.url) return res.status(404).send('Anexo não encontrado.');

    const url = normalizeViewUrl(file.url);
    if (!url) return res.status(400).send('URL inválida.');

    return res.redirect(302, url);
  } catch (err) {
    console.error('[candidatoArquivoController.abrirAnexo]', err);
    return res.status(500).send('Falha ao abrir o anexo.');
  }
};


exports.abrirAnexoPublico = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send('ID inválido.');

    const file = await prisma.candidato_arquivo.findUnique({
      where: { id },
      select: { url: true, nome: true, mime: true }
    });
    if (!file?.url) return res.status(404).send('Anexo não encontrado.');

    const url = normalizeViewUrl(file.url);
    if (!url) return res.status(400).send('URL inválida.');

    const upstream = await axios.get(url, { responseType: 'stream', validateStatus: () => true });
    if (upstream.status >= 400) return res.status(502).send('Falha ao obter o arquivo.');

    const mime = file.mime || upstream.headers['content-type'] || 'application/octet-stream';
    const name = sanitizeFilename(file.nome || 'arquivo');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (upstream.headers['accept-ranges']) res.setHeader('Accept-Ranges', upstream.headers['accept-ranges']);

    upstream.data.pipe(res);
  } catch (err) {
    console.error('[candidatoArquivoController.abrirAnexoPublico]', err);
    return res.status(500).send('Falha ao abrir o anexo.');
  }
};