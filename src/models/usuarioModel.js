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
 * Busca um usuário pelo e-mail, incluindo candidato e empresa.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
exports.buscarPorEmail = async (email) => {
  return await prisma.usuario.findUnique({
    where: { email },
    include: {
      candidato: {
        include: {
          candidato_area: {
            include: {
              area_interesse: true
            }
          }
        }
      },
      empresa: true
    }
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

/**
 * Atualiza os dados de um usuário existente.
 * Usado para atualizar senha ou tipo, se o e-mail ainda não foi verificado.
 * 
 * @param {number} id - ID do usuário
 * @param {Object} dados - Dados a serem atualizados
 * @returns {Promise<Object>}
 */
exports.atualizarUsuario = async (id, dados) => {
  return await prisma.usuario.update({
    where: { id },
    data: dados
  });
};

