// models/usuarioModel.js
const db = require('../config/db');

/**
 * Cadastra um novo usuário.
 * @param {Object} dados
 * @param {string} dados.email
 * @param {string} dados.senha
 * @param {string} dados.tipo
 */
exports.cadastrar = async ({ email, senha, tipo }) => {
  const sql = 'INSERT INTO usuario (email, senha, tipo) VALUES (?, ?, ?)';
  const [resultado] = await db.query(sql, [email, senha, tipo]);
  return resultado;
};

/**
 * Busca um usuário pelo e-mail.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
exports.buscarPorEmail = async (email) => {
  const [linhas] = await db.query('SELECT * FROM usuario WHERE email = ?', [email]);
  return linhas[0] || null;
};

/**
 * Marca o e-mail como verificado para um usuário.
 * @param {number} id
 */
exports.marcarEmailComoVerificado = async (id) => {
  await db.query('UPDATE usuario SET email_verificado = 1 WHERE id = ?', [id]);
};

/**
 * Busca um usuário pelo ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
exports.buscarPorId = async (id) => {
  const [linhas] = await db.query('SELECT * FROM usuario WHERE id = ?', [id]);
  return linhas[0] || null;
};
