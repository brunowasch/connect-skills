const db = require('./src/config/db');

const User = {
  findAll: (callback) => {
    db.query('SELECT * FROM usuario', (err, results) => {
      if (err) return callback(err);
      return callback(null, results);
    });
  }
};

module.exports = User;
