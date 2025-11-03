const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const path = require('path');
const axios = require('axios');
const { encodeId, decodeId } = require('../utils/idEncoder');

function safeFilenameHeader(name) {
  if (!name) return 'arquivo.pdf';
  // remove acentos e caracteres não ASCII
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\- ]/g, '_')
    .trim();

  // codifica segundo RFC 5987 (para UTF-8)
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
    const candidato = await getCandidatoBySession(req);

    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const realId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(realId) || realId <= 0) return res.status(400).send('ID inválido.');
    const { id } = req.params;

    const anexo = await prisma.candidato_arquivo.findUnique({ where: { id: realId } });
    if (!anexo || anexo.candidato_id !== candidato.id) {
      return res.status(404).send('Anexo não encontrado.');
    }

    const url  = anexo.url;                         // URL do Cloudinary (raw)
    const nome = (anexo.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (anexo.mime || '').toLowerCase();  // usamos o MIME salvo no upload

    const upstream = await axios.get(url, {
      responseType: 'stream',
      headers: {
        ...(req.headers.range ? { Range: req.headers.range } : {}),
        Accept: 'application/pdf,*/*',
      },
      maxRedirects: 5,
      decompress: false,
      validateStatus: () => true,
    });

    // status 206 quando Range; senão 200
    res.status(upstream.status === 206 ? 206 : 200);

    // não deixe o helmet bloquear detecção do tipo
    res.removeHeader('X-Content-Type-Options');

    // Content-Type: se o banco diz que é PDF, fixamos como PDF (Cloudinary raw pode vir como octet-stream)
    if (mime === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (upstream.headers['content-type']) {
      res.setHeader('Content-Type', upstream.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }

    // repassa cabeçalhos importantes para o viewer
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges',  upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified',  upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag',           upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control',  upstream.headers['cache-control']);

    // abrir inline (sem attachment)
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
    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const realId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(realId) || realId <= 0) return res.status(400).send('ID inválido.');

    const anexo = await prisma.candidato_arquivo.findUnique({ where: { id: realId } });
    if (!anexo) return res.status(404).send('Anexo não encontrado.');

    const url  = anexo.url;
    const nome = (anexo.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (anexo.mime || '').toLowerCase();

    const upstream = await axios.get(url, {
      responseType: 'stream',
      headers: {
        ...(req.headers.range ? { Range: req.headers.range } : {}),
        Accept: 'application/pdf,image/*,*/*',
      },
      maxRedirects: 5,
      decompress: false,
      validateStatus: () => true,
    });

    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');

    if (mime) res.setHeader('Content-Type', mime);
    else if (upstream.headers['content-type']) res.setHeader('Content-Type', upstream.headers['content-type']);
    else res.setHeader('Content-Type', 'application/pdf');

    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range', upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges', upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified', upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag', upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control', upstream.headers['cache-control']);

    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);

    upstream.data.on('error', () => { if (!res.headersSent) res.status(502); res.end(); });
    upstream.data.pipe(res);
  } catch (err) {
    console.error('abrirAnexoPublico erro:', err?.message || err);
    if (!res.headersSent) res.status(500).send('Falha ao abrir o anexo.');
  }
};