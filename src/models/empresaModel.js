// models/empresaModel.js
const db = require('../config/db');

/**
 * Cria uma nova empresa com nome e descrição.
 * @param {Object} empresa
 * @param {number} empresa.usuario_id
 * @param {string} empresa.nome_empresa
 * @param {string} empresa.descricao
 */
exports.criarEmpresa = async ({ usuario_id, nome_empresa, descricao }) => {
  const sql = `
    INSERT INTO empresa 
    (usuario_id, nome_empresa, descricao, telefone, pais, estado, cidade, foto_perfil)
    VALUES (?, ?, ?, '', '', '', '', '')
  `;
  const [resultado] = await db.query(sql, [usuario_id, nome_empresa, descricao]);
  return resultado;
};

/**
 * Atualiza a localização da empresa.
 * @param {Object} dados
 * @param {string} dados.pais
 * @param {string} dados.estado
 * @param {string} dados.cidade
 * @param {number} dados.usuario_id
 */
exports.atualizarLocalizacao = async ({ pais, estado, cidade, usuario_id }) => {
  const sql = `
    UPDATE empresa
    SET pais = ?, estado = ?, cidade = ?
    WHERE usuario_id = ?
  `;
  const [resultado] = await db.query(sql, [pais, estado, cidade, usuario_id]);
  return resultado;
};

/**
 * Atualiza o telefone da empresa.
 * @param {Object} dados
 * @param {string} dados.telefone
 * @param {number} dados.usuario_id
 */
exports.atualizarTelefone = async ({ telefone, usuario_id }) => {
  const sql = `
    UPDATE empresa
    SET telefone = ?
    WHERE usuario_id = ?
  `;
  const [resultado] = await db.query(sql, [telefone, usuario_id]);
  return resultado;
};

/**
 * Atualiza a foto de perfil da empresa.
 * @param {Object} dados
 * @param {string} dados.foto_perfil
 * @param {number} dados.usuario_id
 */
exports.atualizarFotoPerfil = async ({ foto_perfil, usuario_id }) => {
  const sql = `
    UPDATE empresa
    SET foto_perfil = ?
    WHERE usuario_id = ?
  `;
  const [resultado] = await db.query(sql, [foto_perfil, usuario_id]);
  return resultado;
};

/**
 * Retorna os dados da empresa pelo ID de usuário.
 * @param {number} usuario_id
 * @returns {Promise<Object|null>}
 */
exports.obterEmpresaPorUsuarioId = async (usuario_id) => {
  const sql = 'SELECT * FROM empresa WHERE usuario_id = ?';
  const [resultados] = await db.query(sql, [usuario_id]);
  return resultados[0] || null;
};
