const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const axios = require('axios');
const path = require('path');
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

function fixMojibake(str) {
  if (!str) return str;
  if (/[Ã]/.test(str)) {
    try { return Buffer.from(str, 'latin1').toString('utf8'); } catch { return str; }
  }
  return str;
}

exports.uploadAnexos = async (req, res) => {
  try {
    const emp = req.session?.empresa;
    // O ID aqui já deve ser a String (UUID)
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

      // --- CORREÇÃO AQUI ---
      await prisma.empresa_arquivo.create({
        data: {
          id: uuidv4(), // Gerando ID manual para o arquivo
          empresa_id: String(emp.id), // Convertendo para String para garantir UUID, nunca Number()
          nome: finalName, 
          mime: String(f.mimetype || 'application/octet-stream').slice(0, 100),
          tamanho: Number(f.size || up.bytes || 0),
          url: url
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
    const realId = String(req.params.id || '');

    // 1. Busca o arquivo sem travar pelo ID da empresa na sessão, 
    // já que o acesso ao perfil público é livre.
    const anexo = await prisma.empresa_arquivo.findUnique({
      where: { id: realId }
    });

    if (!anexo || !anexo.url) {
      return res.status(404).send('Arquivo não encontrado.');
    }

    // 2. Faz o stream do Cloudinary para o navegador (mesma lógica de antes)
    const response = await axios({
      method: 'get',
      url: anexo.url,
      responseType: 'stream'
    });

    res.setHeader('Content-Type', anexo.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${anexo.nome}"`);

    return response.data.pipe(res);

  } catch (e) {
    console.error('[abrirAnexo] erro:', e);
    return res.status(500).send('Erro ao abrir o arquivo.');
  }
};

exports.deletarAnexo = async (req, res) => {
  try {
    const emp = req.session?.empresa;
    if (!emp?.id) return res.redirect('/login');

    // 1. O ID vindo da URL agora é o UUID puro (String)
    const realId = String(req.params.id || '');

    if (!realId || realId.length < 30) {
      if (req.flash) req.flash('erro', 'ID de anexo inválido.');
      return res.redirect('/empresa/editar-empresa');
    }

    // 2. Busca o anexo para verificar a propriedade antes de deletar
    const anexo = await prisma.empresa_arquivo.findFirst({
      where: { 
          id: realId, 
          empresa_id: String(emp.id) // Usando UUID da empresa como String
      } 
    });

    if (!anexo) {
      if (req.flash) req.flash('erro', 'Anexo não encontrado ou acesso negado.');
      return res.redirect('/empresa/editar-empresa');
    }

    // 3. Exclusão no banco de dados
    await prisma.empresa_arquivo.delete({ 
      where: { id: anexo.id } // anexo.id já é o UUID correto
    });

    // Opcional: Aqui você poderia adicionar a lógica para deletar 
    // o arquivo físico no Cloudinary usando a URL salva.

    if (req.flash) req.flash('sucesso', 'Anexo excluído com sucesso.');
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
    let final = String(url || '').trim();

    if (!final) {
      if (req.flash) req.flash('erro', 'Informe uma URL válida.');
      return res.redirect('/empresa/editar-empresa');
    }

    if (!/^https?:\/\//i.test(final)) {
      final = 'https://' + final;
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
    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const realId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(realId) || realId <= 0) return res.status(400).send('ID inválido.');

    const ax = await prisma.empresa_arquivo.findUnique({
      where: { id: realId },
      select: { url: true, nome: true, mime: true }
    });
    if (!ax || !ax.url) return res.status(404).send('Anexo não encontrado.');

    const url  = String(ax.url).trim();
    const nome = (ax.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (ax.mime || '').toLowerCase();

    const upstream = await axios.get(url, {
      responseType: 'stream',
    });

    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');
    if (mime) res.setHeader('Content-Type', mime);
    else if (upstream.headers['content-type']) res.setHeader('Content-Type', upstream.headers['content-type']);
    else res.setHeader('Content-Type', 'application/pdf');
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    if (upstream.headers['accept-ranges'])  res.setHeader('Accept-Ranges',  upstream.headers['accept-ranges']);
    if (upstream.headers['last-modified'])  res.setHeader('Last-Modified',  upstream.headers['last-modified']);
    if (upstream.headers['etag'])           res.setHeader('ETag',           upstream.headers['etag']);
    if (upstream.headers['cache-control'])  res.setHeader('Cache-Control',  upstream.headers['cache-control']);

    res.setHeader('Content-Disposition', `inline; filename="${safeFilenameHeader(nome)}`);
    upstream.data.on('error', () => { if (!res.headersSent) res.status(502); res.end(); });
    upstream.data.pipe(res);
  } catch (e) {
    console.error('[empresaArquivoController.abrirAnexoPublico] erro:', e?.message || e);
    if (!res.headersSent) res.status(500).send('Falha ao abrir o anexo.');
  }
};