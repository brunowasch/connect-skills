const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const axios = require('axios');

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

      // Igual ao candidato: PDF => raw, imagem => image, restante => auto
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

      await prisma.empresa_arquivo.create({
        data: {
          empresa_id: Number(emp.id),
          nome: String(f.originalname || 'arquivo').slice(0, 255),
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
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send('ID inválido.');

    const ax = await prisma.empresa_arquivo.findUnique({
      where: { id },
      select: { url: true }
    });
    if (!ax?.url) return res.status(404).send('Anexo não encontrado.');

    const url = normalizeViewUrl(ax.url);
    if (!url) return res.status(400).send('URL inválida.');

    return res.redirect(302, url);
  } catch (err) {
    console.error('[empresaArquivoController.abrirAnexo]', err);
    return res.status(500).send('Falha ao abrir o anexo.');
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

/** Salva um link público como “anexo” (opcional, igual candidato). */
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
    if (!ax?.url) return res.status(404).send('Anexo não encontrado.');

    const url = normalizeViewUrl(ax.url);
    if (!url) return res.status(400).send('URL inválida.');

    const upstream = await axios.get(url, { responseType: 'stream', validateStatus: () => true });
    if (upstream.status >= 400) return res.status(502).send('Falha ao obter o arquivo.');

    const mime = ax.mime || upstream.headers['content-type'] || 'application/octet-stream';
    const name = sanitizeFilename(ax.nome || 'arquivo');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (upstream.headers['accept-ranges']) res.setHeader('Accept-Ranges', upstream.headers['accept-ranges']);

    upstream.data.pipe(res);
  } catch (err) {
    console.error('[empresaArquivoController.abrirAnexoPublico]', err);
    return res.status(500).send('Falha ao abrir o anexo.');
  }
};