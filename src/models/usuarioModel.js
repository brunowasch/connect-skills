const db = require('../config/db');

exports.cadastrar = (usuario, callback) => {
  const sql = 'INSERT INTO usuario (email, senha, tipo) VALUES (?, ?, ?)';
  db.query(sql, [usuario.email, usuario.senha, usuario.tipo], callback);
};
