const db = require('../config/db');

exports.cadastrar = (usuario, callback) => {
  const sql = 'INSERT INTO usuario (email, senha, tipo) VALUES (?, ?, ?)';
  db.query(sql, [usuario.email, usuario.senha, usuario.tipo], callback);
};

exports.buscarPorEmail = (email, callback) => {
  const sql = 'SELECT * FROM usuario WHERE email = ?';
  db.query(sql, [email], callback);
};
