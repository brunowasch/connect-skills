// models/empresaModel.js
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
exports.criarEmpresa = async ({ usuario_id, nome_empresa, descricao }) => {
  return await prisma.empresa.create({
    data: {
      usuario_id,
      nome_empresa,
      descricao,
      telefone: '',
      pais: '',
      estado: '',
      cidade: '',
      foto_perfil: ''
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
    where: { usuario_id },
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
    where: { usuario_id },
    data: { telefone }
  });
};

/**
 * Atualiza a foto de perfil da empresa.
 * @param {Object} dados
 * @param {string} dados.foto_perfil
 * @param {number} dados.usuario_id
 * @returns {Promise<Object>}
 */
exports.atualizarFotoPerfil = async ({ foto_perfil, usuario_id }) => {
  return await prisma.empresa.update({
    where: { usuario_id },
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
    where: { usuario_id }
  });
};
