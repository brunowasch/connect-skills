const { v4: uuidv4 } = require('uuid');
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
      id: uuidv4(),
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
 * @param {string} usuario_id
 * @returns {Promise<void>}
 */
exports.marcarEmailComoVerificado = async (usuario_id) => {
  const idFormatado = String(usuario_id);
  
  try {
    await prisma.usuario.update({
      where: { id: idFormatado },
      data: { email_verificado: true }
    });
  } catch (error) {
    console.error(`Erro ao marcar e-mail como verificado para o ID ${usuario_id}:`, error.message);
    throw error;
  }
};

/**
 * Busca um usuário pelo ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
exports.buscarPorId = async (id) => {
  return await prisma.usuario.findUnique({
    where: { id:String(id) }
  });
};

/**
 * Atualiza os dados de um usuário existente.
 * Usado para atualizar senha ou tipo, se o e-mail ainda não foi verificado.
 * 
 * @param {string} id - ID do usuário
 * @param {Object} dados - Dados a serem atualizados
 * @returns {Promise<Object>}
 */
exports.atualizarUsuario = async (id, dados) => {
  return await prisma.usuario.update({
    where: { id: String(id) }, 
    data: dados
  });
};

