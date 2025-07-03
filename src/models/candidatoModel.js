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
  const sql = 'SELECT * FROM candidato WHERE usuario_id = ?';
  db.query(sql, [usuario_id], (err, resultados) => {
    if (err) return callback(err);
    callback(null, resultados[0]);
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

