// controllers/vagaArquivoController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { cloudinary } = require('../config/cloudinary');
const { encodeId, decodeId } = require('../utils/idEncoder');

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

exports.uploadAnexosDaPublicacao = async (req, res, vagaId) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return;

  for (const f of files) {
    const dataUri = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
    const isImage = /^image\//i.test(f.mimetype);
    const isPDF   = f.mimetype === 'application/pdf';
    const resourceType = isPDF ? 'raw' : (isImage ? 'image' : 'auto');

    const up = await cloudinary.uploader.upload(dataUri, {
      folder: 'connect-skills/vaga/anexos',
      resource_type: resourceType,
      use_filename: true
    });

    const url = up?.secure_url || up?.url;
    await prisma.vaga_arquivo.create({
      data: {
        vaga_id: Number(vagaId),
        nome: String(f.originalname || 'arquivo').slice(0, 255),
        mime: String(f.mimetype || 'application/octet-stream').slice(0, 100),
        tamanho: Number(f.size || up.bytes || 0),
        url
      }
    });
  }
};

exports.abrirAnexoPublico = async (req, res) => {
  try {
    // Aceita ID criptografado com fallback para numérico legado
    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const realId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(realId) || realId <= 0) return res.status(400).send('ID inválido.');

    const id = Number(req.params.id);
    const ax = await prisma.vaga_arquivo.findUnique({
      where: { id: realId },
      select: { url: true, nome: true, mime: true }
    });
    if (!ax?.url) return res.status(404).send('Anexo não encontrado.');

    const upstream = await axios.get(ax.url, {
      responseType: 'stream',
      headers: { ...(req.headers.range ? { Range: req.headers.range } : {}), Accept: 'application/pdf,image/*,*/*' },
      maxRedirects: 5,
      decompress: false,
      validateStatus: () => true
    });

    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');

    const mime = (ax.mime || '').toLowerCase();
    if (mime) res.setHeader('Content-Type', mime);
    else if (upstream.headers['content-type']) res.setHeader('Content-Type', upstream.headers['content-type']);
    else res.setHeader('Content-Type', 'application/pdf');

    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges',  upstream.headers['accept-ranges']);

    const nome = (ax.nome || 'arquivo').replace(/"/g,'');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);

    upstream.data.pipe(res);
  } catch (e) {
    console.error('[vagaArquivo.abrirAnexoPublico] erro:', e);
    if (!res.headersSent) res.status(500).send('Falha ao abrir anexo.');
  }
};
