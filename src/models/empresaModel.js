const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cria uma nova empresa vinculada a um usuário.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.nome_empresa
 * @param {string} dados.descricao
 * @returns {Promise<Object>}
 */
exports.criarEmpresa = async ({ usuario_id, nome_empresa, descricao, foto_perfil }) => {
  return await prisma.empresa.create({
    data: {
      usuario_id: Number(usuario_id),
      nome_empresa,
      descricao,
      telefone: '',
      pais: '',
      estado: '',
      cidade: '',
      foto_perfil: foto_perfil || ''
    }
  });
};


/**
 * Atualiza a localização da empresa.
 * @param {Object} dados
 * @param {string} dados.pais
 * @param {string} dados.estado
 * @param {string} dados.cidade
 * @param {number} dados.usuario_id
 * @returns {Promise<Object>}
 */
exports.atualizarLocalizacao = async ({ pais, estado, cidade, usuario_id }) => {
  return await prisma.empresa.update({
    where: { usuario_id: Number(usuario_id) },
    data: { pais, estado, cidade }
  });
};

/**
 * Atualiza o telefone da empresa.
 * @param {Object} dados
 * @param {string} dados.telefone
 * @param {number} dados.usuario_id
 * @returns {Promise<Object>}
 */
exports.atualizarTelefone = async ({ telefone, usuario_id }) => {
  return await prisma.empresa.update({
    where: { usuario_id: Number(usuario_id) },
    data: { telefone }
  });
};

/**
 * Atualiza a foto de perfil da empresa (com URL do Cloudinary).
 * @param {Object} dados
 * @param {string} dados.foto_perfil
 * @param {number} dados.usuario_id
 * @returns {Promise<Object>}
 */
exports.atualizarFotoPerfil = async ({ foto_perfil, usuario_id }) => {
  return await prisma.empresa.update({
    where: { usuario_id: Number(usuario_id) },
    data: { foto_perfil }
  });
};

/**
 * Busca empresa vinculada a um usuário.
 * @param {number} usuario_id
 * @returns {Promise<Object|null>}
 */
exports.obterEmpresaPorUsuarioId = async (usuario_id) => {
  return await prisma.empresa.findUnique({
    where: { usuario_id: Number(usuario_id) }
  });
};

exports.complementarCadastroGoogle = async (usuario_id, dados) => {
  const norm = (s) => (s ? String(s).trim() : '');
  const payload = {
    nome_empresa: norm(dados.nome_empresa),
    descricao: norm(dados.descricao),
    cidade: norm(dados.cidade),
    estado: norm(dados.estado),
    pais: norm(dados.pais),
    telefone: norm(dados.telefone),
    foto_perfil: norm(dados.foto_perfil || '')
  };

  return prisma.empresa.upsert({
    where: { usuario_id: Number(usuario_id) },
    update: payload,
    create: { usuario_id: Number(usuario_id), ...payload }
  });
};