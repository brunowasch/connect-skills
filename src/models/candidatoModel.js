// candidatoModel.js
const db = require('../config/db');

exports.inserirNomeSobrenome = (candidato, callback) => {
  const sql = `
    INSERT INTO candidato
    (usuario_id, nome, sobrenome, data_nascimento, pais, estado, cidade, telefone, foto_perfil)
    VALUES (?, ?, ?, ?, '', '', '', '', '')
  `;

  db.query(sql, [
    candidato.usuario_id,
    candidato.nome,
    candidato.sobrenome,
    candidato.data_nascimento
  ], callback);
};

exports.atualizarLocalizacao = (dados, callback) => {
  const sql = `
    UPDATE candidato
    SET pais = ?, estado = ?, cidade = ?
    WHERE usuario_id = ?
  `;
  db.query(sql, [dados.pais, dados.estado, dados.cidade, dados.usuario_id], callback);
};

exports.atualizarTelefone = (dados, callback) => {
  const sql = `
    UPDATE candidato
    SET telefone = ?
    WHERE usuario_id = ?
  `;
  db.query(sql, [dados.telefone, dados.usuario_id], callback);
};

exports.atualizarFotoPerfil = (dados, callback) => {
  const sql = `
    UPDATE candidato
    SET foto_perfil = ?
    WHERE usuario_id = ?
  `;
  db.query(sql, [dados.foto_perfil, dados.usuario_id], callback);
};

exports.buscarPorUsuarioId = (usuario_id, callback) => {
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

  db.query(sql, [usuario_id], (err, resultados) => {
    if (err) return callback(err);
    if (resultados.length === 0) return callback(null, null);

    const candidato = resultados[0];
    candidato.areas = candidato.areas ? candidato.areas.split(',') : [];

    callback(null, candidato);
  });
};

exports.salvarAreasDeInteresse = (candidato_id, areas, callback) => {
  const sql = `
    INSERT INTO candidato_area (candidato_id, area_interesse_id)
    VALUES ?
  `;

  const values = areas.map(areaId => [candidato_id, areaId]);
  db.query(sql, [values], callback);
};

exports.buscarIdsDasAreas = (nomes, callback) => {
  const placeholders = nomes.map(() => '?').join(',');
  const sql = `SELECT id FROM area_interesse WHERE nome IN (${placeholders})`;

  db.query(sql, nomes, (err, resultados) => {
    if (err) return callback(err);
    const ids = resultados.map(r => r.id);
    callback(null, ids);
  });
};

