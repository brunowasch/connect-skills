const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { cloudinary } = require('../config/cloudinary');
const path = require('path');
const axios = require('axios');

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

async function getEmpresaBySession(req) {
  const sess = req.session?.empresa;
  if (!sess?.id) throw new Error('Acesso negado: empresa não autenticada.');
  const empresa = await prisma.empresa.findUnique({ where: { id: Number(sess.id) } });
  if (!empresa) throw new Error('Empresa não encontrada para este usuário.');
  return empresa;
}

exports.uploadAnexos = async (req, res) => {
  const back = '/empresa/editar-empresa';
  try {
    const empresa = await getEmpresaBySession(req);

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

      const folder = `connect-skills/empresas/${empresa.id}/anexos`;

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

      await prisma.empresa_arquivo.create({
        data: {
          empresa_id: empresa.id,
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
    console.error('Erro no upload de anexos (empresa):', err);
    req.flash?.('erro', 'Falha ao enviar arquivos. Tente novamente.');
    res.redirect('/empresa/editar-empresa');
  }
};

// ===== Salvar link =====
exports.salvarLink = async (req, res) => {
  const back = '/empresa/editar-empresa';
  try {
    const empresa = await getEmpresaBySession(req);
    let { label, url } = req.body;

    url = String(url || '').trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      req.flash?.('erro', 'Informe uma URL válida iniciando com http(s)://');
      return res.redirect(back);
    }

    const nome = fixMojibake(String(label || 'Link').trim());

    // Guarda link na tabela própria
    const ordemMax = await prisma.empresa_link.aggregate({
      where: { empresa_id: empresa.id },
      _max: { ordem: true }
    });
    const proxOrdem = (ordemMax._max.ordem ?? 0) + 1;

    await prisma.empresa_link.create({
      data: {
        empresa_id: empresa.id,
        label: nome,
        url,
        ordem: proxOrdem
      }
    });

    req.flash?.('msg', 'Link adicionado com sucesso.');
    res.redirect(back);
  } catch (err) {
    console.error('Erro ao salvar link (empresa):', err);
    req.flash?.('erro', 'Não foi possível salvar o link.');
    res.redirect('/empresa/editar-empresa');
  }
};

// ===== Deletar anexo =====
exports.deletarAnexo = async (req, res) => {
  const back = '/empresa/editar-empresa';
  try {
    const empresa = await getEmpresaBySession(req);
    const { id } = req.params;

    const anexo = await prisma.empresa_arquivo.findUnique({ where: { id: Number(id) } });
    if (!anexo || anexo.empresa_id !== empresa.id) {
      req.flash?.('erro', 'Anexo não encontrado.');
      return res.redirect(back);
    }

    const publicId = tryExtractPublicIdFromCloudinaryUrl(anexo.url);
    if (publicId) {
      const mime = (anexo.mime || '').toLowerCase();
      let primaryType = 'raw';
      if (mime.startsWith('image/')) primaryType = 'image';
      else if (mime.startsWith('video/')) primaryType = 'video';

      try {
        // tenta primeiro o tipo mais provável
        await cloudinary.uploader.destroy(publicId, { resource_type: primaryType });
      } catch (e1) {
        // fallbacks (sem 'auto', pois o Cloudinary não aceita 'auto' no destroy)
        await Promise.allSettled([
          cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }),
          cloudinary.uploader.destroy(publicId, { resource_type: 'image' }),
          cloudinary.uploader.destroy(publicId, { resource_type: 'video' }),
        ]);
      }
    }

    await prisma.empresa_arquivo.delete({ where: { id: anexo.id } });
    req.flash?.('msg', 'Anexo excluído com sucesso.');
    res.redirect(back);
  } catch (err) {
    console.error('Erro ao excluir anexo (empresa):', err);
    req.flash?.('erro', 'Não foi possível excluir o anexo.');
    res.redirect('/empresa/editar-empresa');
  }
};

// ===== Deletar link =====
exports.deletarLink = async (req, res) => {
  const back = '/empresa/editar-empresa';
  try {
    const empresa = await getEmpresaBySession(req);
    const { id } = req.params;

    const link = await prisma.empresa_link.findUnique({ where: { id: Number(id) } });
    if (!link || link.empresa_id !== empresa.id) {
      req.flash?.('erro', 'Link não encontrado.');
      return res.redirect(back);
    }

    await prisma.empresa_link.delete({ where: { id: link.id } });
    req.flash?.('msg', 'Link excluído com sucesso.');
    res.redirect(back);
  } catch (err) {
    console.error('Erro ao excluir link (empresa):', err);
    req.flash?.('erro', 'Não foi possível excluir o link.');
    res.redirect('/empresa/editar-empresa');
  }
};

exports.abrirAnexo = async (req, res) => {
  try {
    // empresa autenticada
    const sess = req.session?.empresa;
    if (!sess?.id) return res.status(401).send('Não autenticado.');

    const { id } = req.params;

    // busca anexo da empresa
    const anexo = await prisma.empresa_arquivo.findUnique({ where: { id: Number(id) } });
    if (!anexo || anexo.empresa_id !== Number(sess.id)) {
      return res.status(404).send('Anexo não encontrado.');
    }

    const url  = anexo.url;                               // secure_url do Cloudinary
    const nome = (anexo.nome || 'arquivo.pdf').replace(/"/g, '');
    const mime = (anexo.mime || '').toLowerCase();

    // baixa do Cloudinary (stream) e repassa headers adequados
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

    res.status(upstream.status === 206 ? 206 : 200);
    res.removeHeader('X-Content-Type-Options');

    // força PDF se seu banco diz que é PDF (evita "octet-stream")
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

    // abre inline no browser
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);

    upstream.data.on('error', (e) => {
      console.error('Stream upstream error (empresa):', e?.message || e);
      if (!res.headersSent) res.status(502);
      res.end();
    });

    upstream.data.pipe(res);
  } catch (err) {
    console.error('abrirAnexo (empresa) erro:', err?.message || err);
    if (!res.headersSent) res.status(500).send('Falha ao abrir o anexo.');
  }
};
