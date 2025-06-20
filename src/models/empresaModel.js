const db = require('../config/db');

exports.inserirNomeDescricao = (empresa, callback) => {
  const sql = `
    INSERT INTO empresa 
    (usuario_id, nome_empresa, descricao, telefone, pais, estado, cidade, foto_perfil)
    VALUES (?, ?, ?, '', '', '', '', '')
  `;

  db.query(
    sql,
    [
      empresa.usuario_id,
      empresa.nome_empresa,
      empresa.descricao
    ],
    callback
  );
};

exports.atualizarLocalizacao = (dados, callback) => {
  const sql = `
    UPDATE empresa
    SET pais = ?, estado = ?, cidade = ?
    WHERE usuario_id = ?
  `;

  db.query(sql, [dados.pais, dados.estado, dados.cidade, dados.usuario_id], callback);
};

exports.atualizarTelefone = (dados, callback) => {
  const sql = `
    UPDATE empresa
    SET telefone = ?
    WHERE usuario_id = ?
  `;

  db.query(sql, [dados.telefone, dados.usuario_id], callback);
};

exports.atualizarFotoPerfil = (dados, callback) => {
  const sql = `
    UPDATE empresa
    SET foto_perfil = ?
    WHERE usuario_id = ?
  `;
  db.query(sql, [dados.foto_perfil, dados.usuario_id], callback);
};


exports.buscarPorUsuarioId = (usuario_id, callback) => {
  const sql = 'SELECT * FROM empresa WHERE usuario_id = ?';
  db.query(sql, [usuario_id], (err, resultados) => {
    if (err) return callback(err);
    callback(null, resultados[0]);
  });
};



