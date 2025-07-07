const db = require('../config/db');

/**
 * Cria um novo candidato com nome, sobrenome e data de nascimento.
 * @param {Object} candidato
 * @param {number} candidato.usuario_id
 * @param {string} candidato.nome
 * @param {string} candidato.sobrenome
 * @param {string} candidato.data_nascimento
 */
exports.criarCandidato = async ({ usuario_id, nome, sobrenome, data_nascimento }) => {
  const sql = `
    INSERT INTO candidato
    (usuario_id, nome, sobrenome, data_nascimento, pais, estado, cidade, telefone, foto_perfil)
    VALUES (?, ?, ?, ?, '', '', '', '', '')
  `;
  const [resultado] = await db.query(sql, [usuario_id, nome, sobrenome, data_nascimento]);
  return resultado;
};

/**
 * Atualiza a localização do candidato.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.pais
 * @param {string} dados.estado
 * @param {string} dados.cidade
 */
exports.atualizarLocalizacao = async ({ usuario_id, pais, estado, cidade }) => {
  const sql = `
    UPDATE candidato
    SET pais = ?, estado = ?, cidade = ?
    WHERE usuario_id = ?
  `;
  const [resultado] = await db.query(sql, [pais, estado, cidade, usuario_id]);
  return resultado;
};

/**
 * Atualiza o telefone do candidato.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.telefone
 */
exports.atualizarTelefone = async ({ usuario_id, telefone }) => {
  const sql = `
    UPDATE candidato
    SET telefone = ?
    WHERE usuario_id = ?
  `;
  const [resultado] = await db.query(sql, [telefone, usuario_id]);
  return resultado;
};

/**
 * Atualiza a foto de perfil do candidato.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.foto_perfil
 */
exports.atualizarFotoPerfil = async ({ usuario_id, foto_perfil }) => {
  const sql = `
    UPDATE candidato
    SET foto_perfil = ?
    WHERE usuario_id = ?
  `;
  const [resultado] = await db.query(sql, [foto_perfil, usuario_id]);
  return resultado;
};

/**
 * Busca candidato e suas áreas de interesse pelo ID do usuário.
 * @param {number} usuario_id
 * @returns {Promise<Object|null>}
 */
exports.obterCandidatoPorUsuarioId = async (usuario_id) => {
  const sql = `
    SELECT 
      c.id,
      c.nome,
      c.sobrenome,
      c.data_nascimento,
      c.telefone,
      c.foto_perfil,
      c.cidade,
      c.estado,
      c.pais,
      GROUP_CONCAT(ai.nome) AS areas
    FROM candidato c
    LEFT JOIN candidato_area ca ON ca.candidato_id = c.id
    LEFT JOIN area_interesse ai ON ai.id = ca.area_interesse_id
    WHERE c.usuario_id = ?
    GROUP BY c.id
  `;

  const [resultados] = await db.query(sql, [usuario_id]);
  if (resultados.length === 0) return null;

  const candidato = resultados[0];
  candidato.areas = candidato.areas ? candidato.areas.split(',') : [];
  return candidato;
};

/**
 * Salva as áreas de interesse para o candidato.
 * @param {Object} dados
 * @param {number} dados.candidato_id
 * @param {number[]} dados.areas
 */
exports.salvarAreasDeInteresse = async ({ candidato_id, areas }) => {
  const sql = `
    INSERT INTO candidato_area (candidato_id, area_interesse_id)
    VALUES ?
  `;
  const values = areas.map(areaId => [candidato_id, areaId]);
  const [resultado] = await db.query(sql, [values]);
  return resultado;
};

/**
 * Busca os IDs das áreas de interesse pelos nomes.
 * @param {Object} dados
 * @param {string[]} dados.nomes
 * @returns {Promise<number[]>}
 */
exports.buscarIdsDasAreas = async ({ nomes }) => {
  const placeholders = nomes.map(() => '?').join(',');
  const sql = `SELECT id FROM area_interesse WHERE nome IN (${placeholders})`;
  const [resultados] = await db.query(sql, nomes);
  return resultados.map(r => r.id);
};
