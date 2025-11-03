const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const axios = require('axios');
const path = require('path');

function safeFilenameHeader(name) {
  if (!name) return 'arquivo.pdf';
  const base = String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\- ]/g, '_')
    .trim();
  const encoded = encodeURIComponent(base);
  return `${base}"; filename*=UTF-8''${encoded}`;
}

function fixMojibake(str) {
  if (!str) return str;
  if (/[Ã�]/.test(str)) {
    try { return Buffer.from(str, 'latin1').toString('utf8'); } catch { return str; }
  }
  return str;
}

exports.uploadAnexos = async (req, res) => {
  try {
    const emp = req.session?.empresa;
    if (!emp?.id) {
      if (req.flash) req.flash('erro', 'Faça login para enviar anexos.');
      return res.redirect('/login');
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      if (req.flash) req.flash('erro', 'Selecione ao menos um arquivo.');
      return res.redirect('/empresa/editar-empresa');
    }

    if (!cloudinary?.uploader) {
      if (req.flash) req.flash('erro', 'Storage não configurado (Cloudinary).');
      return res.redirect('/empresa/editar-empresa');
    }

    let enviados = 0;
    for (const f of files) {
      const dataUri = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

      const isImage = /^image\//i.test(f.mimetype);
      const isPDF   = f.mimetype === 'application/pdf';
      const resourceType = isPDF ? 'raw' : (isImage ? 'image' : 'auto');

      const up = await cloudinary.uploader.upload(dataUri, {
        folder: 'connect-skills/empresa/anexos',
        resource_type: resourceType,
        use_filename: true
      });

      const url = up?.secure_url || up?.url || null;
      if (!url) throw new Error('Falha ao obter secure_url do Cloudinary.');

      const originalNameRaw = f.originalname || 'arquivo';
      const parsed = path.parse(originalNameRaw);
      const fixedBase = fixMojibake(parsed.name);
      const finalName = (fixedBase + (parsed.ext || '')).slice(0, 255);

      await prisma.empresa_arquivo.create({
        data: {
          empresa_id: Number(emp.id),
          nome: finalName, 
          mime: String(f.mimetype || 'application/octet-stream').slice(0, 100),
          tamanho: Number(f.size || up.bytes || 0),
          url
        }
      });

      enviados++;
    }

    if (req.flash) req.flash('sucesso', `${enviados} arquivo(s) enviado(s) com sucesso.`);
    return res.redirect('/empresa/editar-empresa');
  } catch (e) {
    console.error('[empresaArquivoController.uploadAnexos] erro:', e);
    if (req.flash) req.flash('erro', 'Falha ao enviar anexos. Tente novamente.');
    return res.redirect('/empresa/editar-empresa');
  }
};

exports.abrirAnexo = async (req, res) => {
  try {
    const emp = req.session?.empresa;
    if (!emp?.id) return res.redirect('/login');

    const id = Number(req.params.id);
    const ax = await prisma.empresa_arquivo.findFirst({
      where: { id, empresa_id: Number(emp.id) },
      select: { url: true, nome: true, mime: true }
    });

    if (!ax || !ax.url) {
      req.flash?.('erro', 'Arquivo sem URL válida.');
      return res.redirect('/empresa/editar-empresa');
    }

    const url  = String(ax.url).trim();
    if (!/^https?:\/\//i.test(url)) {
      req.flash?.('erro', 'URL do anexo inválida. Reenvie o arquivo.');
      return res.redirect('/empresa/editar-empresa');
    }

    const nome = (ax.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (ax.mime || '').toLowerCase();

    const upstream = await axios.get(url, {
      responseType: 'stream',
      headers: { ...(req.headers.range ? { Range: req.headers.range } : {}), Accept: 'application/pdf,*/*' },
      maxRedirects: 5,
      decompress: false,
      validateStatus: () => true,
    });

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
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges',  upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified',  upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag',           upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control',  upstream.headers['cache-control']);

    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);
    upstream.data.on('error', (e) => { console.error('Stream upstream error:', e?.message || e); if (!res.headersSent) res.status(502); res.end(); });
    upstream.data.pipe(res);
  } catch (e) {
    console.error('[empresaArquivoController.abrirAnexo] erro:', e);
    if (!res.headersSent) {
      req.flash?.('erro', 'Falha ao abrir o anexo.');
      return res.redirect('/empresa/editar-empresa');
    }
  }
};

exports.deletarAnexo = async (req, res) => {
  try {
    const emp = req.session?.empresa;
    if (!emp?.id) return res.redirect('/login');

    const id = Number(req.params.id);
    await prisma.empresa_arquivo.delete({ where: { id } });

    if (req.flash) req.flash('sucesso', 'Anexo excluído.');
    return res.redirect('/empresa/editar-empresa');
  } catch (e) {
    console.error('[empresaArquivoController.deletarAnexo] erro:', e);
    if (req.flash) req.flash('erro', 'Falha ao excluir o anexo.');
    return res.redirect('/empresa/editar-empresa');
  }
};

exports.salvarLink = async (req, res) => {
  try {
    const emp = req.session?.empresa;
    if (!emp?.id) return res.redirect('/login');

    const { url, label } = req.body;
    const final = String(url || '').trim();
    if (!final) {
      if (req.flash) req.flash('erro', 'Informe uma URL válida.');
      return res.redirect('/empresa/editar-empresa');
    }

    await prisma.empresa_arquivo.create({
      data: {
        empresa_id: Number(emp.id),
        nome: String(label || final).slice(0, 255),
        mime: 'text/url',
        tamanho: 0,
        url: final
      }
    });

    if (req.flash) req.flash('sucesso', 'Link adicionado.');
    return res.redirect('/empresa/editar-empresa');
  } catch (e) {
    console.error('[empresaArquivoController.salvarLink] erro:', e);
    if (req.flash) req.flash('erro', 'Falha ao salvar link.');
    return res.redirect('/empresa/editar-empresa');
  }
};

exports.abrirAnexoPublico = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send('ID inválido.');

    const ax = await prisma.empresa_arquivo.findUnique({
      where: { id },
      select: { url: true, nome: true, mime: true }
    });
    if (!ax || !ax.url) return res.status(404).send('Anexo não encontrado.');

    const url  = String(ax.url).trim();
    const nome = (ax.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (ax.mime || '').toLowerCase();

    const upstream = await axios.get(url, {
      responseType: 'stream',
      headers: { ...(req.headers.range ? { Range: req.headers.range } : {}), Accept: 'application/pdf,image/*,*/*' },
      maxRedirects: 5,
      decompress: false,
      validateStatus: () => true
    });

    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');

    if (mime) res.setHeader('Content-Type', mime);
    else if (upstream.headers['content-type']) res.setHeader('Content-Type', upstream.headers['content-type']);
    else res.setHeader('Content-Type', 'application/pdf');

    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges',  upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified',  upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag',           upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control',  upstream.headers['cache-control']);

    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);
    upstream.data.on('error', () => { if (!res.headersSent) res.status(502); res.end(); });
    upstream.data.pipe(res);
  } catch (e) {
    console.error('[empresaArquivoController.abrirAnexoPublico] erro:', e?.message || e);
    if (!res.headersSent) res.status(500).send('Falha ao abrir o anexo.');
  }
};
