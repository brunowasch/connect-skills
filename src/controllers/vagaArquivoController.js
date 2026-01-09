const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { cloudinary } = require('../config/cloudinary');
const { encodeId, decodeId } = require('../utils/idEncoder');
const crypto = require('crypto');

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
    try {
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
      
      // CORREÇÃO AQUI:
      await prisma.vaga_arquivo.create({
        data: {
          id: crypto.randomUUID(), // Geração manual do ID do arquivo
          vaga_id: vagaId,        // Passa a string (UUID) direto, sem Number()
          nome: String(f.originalname || 'arquivo').slice(0, 255),
          mime: String(f.mimetype || 'application/octet-stream').slice(0, 100),
          tamanho: Number(f.size || up.bytes || 0),
          url
        }
      });
    } catch (err) {
      console.error("Erro ao subir anexo para Cloudinary/Prisma:", err);
    }
  }
};

exports.abrirAnexoPublico = async (req, res) => {
  try {
    const rawId = req.params.id; // Recebe o UUID do link

    // Busca direta usando a String (UUID)
    const ax = await prisma.vaga_arquivo.findUnique({
      where: { id: rawId },
      select: { url: true, nome: true, mime: true }
    });

    // Se não encontrar, pode ser que o ID na URL esteja codificado ou seja antigo
    if (!ax?.url) {
      console.warn(`[Anexo] Arquivo não encontrado para o ID: ${rawId}`);
      return res.status(404).send('Anexo não encontrado.');
    }

    // Faz o streaming do arquivo (Cloudinary -> Browser)
    const upstream = await axios.get(ax.url, { 
      responseType: 'stream',
      timeout: 10000 
    });

    res.setHeader('Content-Type', ax.mime || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${ax.nome}"`);
    
    upstream.data.pipe(res);

  } catch (e) {
    console.error('Erro ao abrir anexo:', e.message);
    res.status(500).send('Erro ao processar o arquivo.');
  }
};

exports.abrirAnexoVaga = async (req, res) => {
  try {
    const idEncodado = req.params.id;
    const realId = decodeId(idEncodado); // Transforma U2FsdGVk... no UUID real

    if (!realId) return res.status(400).send('ID de anexo inválido.');

    // Busca direta na tabela de arquivos da vaga
    const arquivo = await prisma.vaga_arquivo.findUnique({
      where: { id: String(realId) }
    });

    if (!arquivo) return res.status(404).send('O arquivo solicitado não foi encontrado.');

    // Stream do Cloudinary
    const upstream = await axios.get(arquivo.url, { responseType: 'stream' });
    
    // Força o navegador a entender que é um PDF ou o tipo correto
    const mime = (arquivo.mime && arquivo.mime !== 'raw') ? arquivo.mime : 'application/pdf';
    
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(arquivo.nome)}"`);
    
    upstream.data.pipe(res);
  } catch (err) {
    console.error('Erro ao abrir anexo da vaga:', err);
    res.status(500).send('Erro ao processar arquivo.');
  }
};