const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const axios = require('axios');

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
    const emp = req.session?.empresa;
    if (!emp?.id) return res.redirect('/login');

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send('ID inválido.');

    const ax = await prisma.empresa_arquivo.findUnique({
      where: { id },
      select: { url: true, nome: true, mime: true }
    });
    if (!ax || !ax.url) return res.status(404).send('Anexo não encontrado.');

    let url = String(ax.url || '').trim();
    url = url
      .replace(/\/upload\/(?:[^/]*,)?fl_attachment(?:[^/]*,)?\//, '/upload/')
      .replace(/(\?|&)fl_attachment(=[^&]*)?/gi, '')
      .replace(/(\?|&)response-content-disposition=attachment/gi, '')
      .replace(/(\?|&)download=1\b/gi, '$1')
      .replace(/(\?|&)dl=1\b/gi, '$1')
      .replace(/(\?|&)export=download\b/gi, '$1');

    if (/^https?:\/\//i.test(url) && /\.(pdf|png|jpe?g|gif|webp)(\?|$)/i.test(url)) {
      return res.redirect(302, url);
    }

    const upstream = await axios.get(url, {
      responseType: 'stream',
      headers: { ...(req.headers.range ? { Range: req.headers.range } : {}) },
      timeout: 60_000,
      maxRedirects: 5
    });

    const filename = (ax.nome && ax.nome.replace(/"/g, '')) || 'arquivo';
    const mime = (ax.mime || upstream.headers['content-type'] || 'application/octet-stream');
    const status = upstream.status || (req.headers.range ? 206 : 200);

    res.status(status);
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Accept-Ranges': 'bytes',
      ...(upstream.headers['content-length'] ? { 'Content-Length': upstream.headers['content-length'] } : {}),
    });

    upstream.data.pipe(res);
  } catch (e) {
    console.error('[empresaArquivoController.abrirAnexo] erro:', e?.message || e);
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
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).send('ID inválido.');
    }

    const ax = await prisma.empresa_arquivo.findUnique({
      where: { id },
      select: { url: true, nome: true, mime: true }
    });
    if (!ax || !ax.url) {
      return res.status(404).send('Anexo não encontrado.');
    }

    // 🔧 Normaliza a URL para visualização inline
    let url = String(ax.url || '').trim();
    url = url
      .replace(/\/upload\/(?:[^/]*,)?fl_attachment(?:[^/]*,)?\//, '/upload/')
      .replace(/(\?|&)fl_attachment(=[^&]*)?/gi, '')
      .replace(/(\?|&)response-content-disposition=attachment/gi, '')
      .replace(/(\?|&)download=1\b/gi, '$1');

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).send('URL do anexo inválida.');
    }

    // ✅ Redireciona (sem streaming) — evita crash no Vercel
    return res.redirect(302, url);
  } catch (err) {
    console.error('[empresaArquivoController.abrirAnexoPublico] erro:', err?.message || err);
    return res.status(500).send('Falha ao abrir o anexo.');
  }
};