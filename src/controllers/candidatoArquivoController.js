const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const path = require('path');
const axios = require('axios');
const { encodeId, decodeId } = require('../utils/idEncoder');

function safeFilenameHeader(name) {
  if (!name) return 'arquivo.pdf';
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\- ]/g, '_')
    .trim();
  const encoded = encodeURIComponent(base);
  return `${base}"; filename*=UTF-8''${encoded}`;
}

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

function humanFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  do { bytes /= thresh; ++u; } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

function fixMojibake(str) {
  if (!str) return str;
  if (/[Ã]/.test(str)) {
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

// ================== Exports (Funções do Controller) ==================

exports.telaAnexos = async (req, res) => {
  return res.redirect('/candidato/editar-perfil');
};

exports.uploadAnexos = async (req, res) => {
  const back = '/candidato/editar-perfil';
  try {
    const candidato = await getCandidatoBySession(req); // <-- Perfeito (seguro)

    const files = req.files || [];
    if (!files.length) {
      req.flash?.('erro', 'Nenhum arquivo enviado.');
      return res.redirect(back);
    }

    let count = 0;
    for (const file of files) {
      // ... (Sua lógica de upload para o Cloudinary está ótima) ...
      const originalNameRaw = file.originalname || 'arquivo';
      const parsed = path.parse(originalNameRaw);
      const fixedBase = fixMojibake(parsed.name);
      const finalName = fixedBase + (parsed.ext || '');
      const folder = `connect-skills/candidatos/${candidato.id}/anexos`;
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
          candidato_id: candidato.id, // <-- Perfeito (seguro)
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
    const candidato = await getCandidatoBySession(req); // <-- Perfeito (seguro)
    let { label, url } = req.body;

    url = String(url || '').trim();
    
    // ================== [CORREÇÃO DE LÓGICA #3] ==================
    // Se a URL estiver vazia, avisa o usuário.
    if (!url) {
      req.flash?.('erro', 'A URL não pode estar em branco.');
      return res.redirect(back);
    }

    // Em vez de rejeitar links sem 'https://' (ex: 'www.linkedin.com'),
    // vamos adicioná-lo automaticamente.
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    // ❌ Linha Antiga:
    // if (!/^https?:\/\/.+/i.test(url)) {
    //   req.flash?.('erro', 'Informe uma URL válida iniciando com http(s)://');
    //   return res.redirect(back);
    // }
    // ================== [FIM DA CORREÇÃO] ==================

    const nome = fixMojibake(String(label || 'Link').trim());

    await prisma.candidato_arquivo.create({
      data: {
        candidato_id: candidato.id, // <-- Perfeito (seguro)
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
    const candidato = await getCandidatoBySession(req); // <-- Perfeito (seguro)
    const { id } = req.params; // <-- Recebe ID numérico (ex: 123)

    // (Sua lógica de segurança aqui é 10/10)
    const anexo = await prisma.candidato_arquivo.findUnique({ where: { id: Number(id) } });
    if (!anexo || anexo.candidato_id !== candidato.id) { // <-- Verificação de propriedade
      req.flash?.('erro', 'Anexo não encontrado.');
      return res.redirect(back);
    }

    // (Sua lógica de exclusão do Cloudinary está ótima)
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
    const candidato = await getCandidatoBySession(req); // <-- Perfeito (seguro)

    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const realId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(realId) || realId <= 0) return res.status(400).send('ID inválido.');
    // ❌ Linha desnecessária: const { id } = req.params;

    // (Sua lógica de segurança aqui é 10/10)
    const anexo = await prisma.candidato_arquivo.findUnique({ where: { id: realId } });
    if (!anexo || anexo.candidato_id !== candidato.id) { // <-- Verificação de propriedade
      return res.status(404).send('Anexo não encontrado.');
  T }

    // (Sua lógica de streaming de proxy do Cloudinary está excelente)
    const url  = anexo.url; 
    const nome = (anexo.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (anexo.mime || '').toLowerCase();

    const upstream = await axios.get(url, {
      responseType: 'stream',
      // ... (headers)
    });

    // ... (toda a lógica de streaming)
    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');
    if (mime === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (upstream.headers['content-type']) {
      res.setHeader('Content-Type', upstream.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges',  upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified',  upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag',           upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control',  upstream.headers['cache-control']);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);
    upstream.data.on('error', (e) => {
      console.error('Stream upstream error:', e?.message || e);
      if (!res.headersSent) res.status(502);
      res.end();
    });
    upstream.data.pipe(res);
  } catch (err) {
    console.error('abrirAnexo erro:', err?.message || err);
    if (!res.headersSent) res.status(500).send('Falha ao abrir o anexo.');
  }
};

exports.abrirAnexoPublico = async (req, res) => {
  try {
    // (Sua lógica de decodificação de ID aqui está perfeita)
    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const realId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(realId) || realId <= 0) return res.status(400).send('ID inválido.');

    // (Sua lógica de NÃO checar a sessão está perfeita, pois é pública)
    const anexo = await prisma.candidato_arquivo.findUnique({ where: { id: realId } });
    if (!anexo) return res.status(404).send('Anexo não encontrado.');

    // (Sua lógica de streaming de proxy do Cloudinary está excelente)
    const url  = anexo.url;
    const nome = (anexo.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (anexo.mime || '').toLowerCase();

    const upstream = await axios.get(url, {
      responseType: 'stream',
      // ... (headers)
    });

    // ... (toda a lógica de streaming)
    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');
    if (mime) res.setHeader('Content-Type', mime);
    else if (upstream.headers['content-type']) res.setHeader('Content-Type', upstream.headers['content-type']);
    else res.setHeader('Content-Type', 'application/pdf');
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range', upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges', upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified', upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag',           upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control',  upstream.headers['cache-control']);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);
    upstream.data.on('error', () => { if (!res.headersSent) res.status(502); res.end(); });
    upstream.data.pipe(res);
  } catch (err) {
    console.error('abrirAnexoPublico erro:', err?.message || err);
    if (!res.headersSent) res.status(500).send('Falha ao abrir o anexo.');
  }
};