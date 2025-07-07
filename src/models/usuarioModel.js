// models/usuarioModel.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cadastra um novo usuário.
 * @param {Object} dados
 * @param {string} dados.email
 * @param {string} dados.senha
 * @param {string} dados.tipo - 'empresa' ou 'candidato'
 * @returns {Promise<Object>}
 */
exports.cadastrar = async ({ email, senha, tipo }) => {
  return await prisma.usuario.create({
    data: {
      email,
      senha,
      tipo,
      email_verificado: false
    }
  });
};

/**
 * Busca um usuário pelo e-mail.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
exports.buscarPorEmail = async (email) => {
  return await prisma.usuario.findUnique({
    where: { email }
  });
};

/**
 * Marca o e-mail como verificado.
 * @param {number} usuario_id
 * @returns {Promise<void>}
 */
exports.marcarEmailComoVerificado = async (usuario_id) => {
  await prisma.usuario.update({
    where: { id: usuario_id },
    data: { email_verificado: true }
  });
};

/**
 * Busca um usuário pelo ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
exports.buscarPorId = async (id) => {
  return await prisma.usuario.findUnique({
    where: { id }
  });
};
