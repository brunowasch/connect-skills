// config/multer.js
const multer = require('multer');
const path = require('path');

// Armazenamento configurado
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve('public/uploads')); // Caminho absoluto
  },
  filename: (req, file, cb) => {
    // Gera nome seguro: timestamp + extensão
    const extensao = path.extname(file.originalname).toLowerCase();
    const nomeSeguro = `${Date.now()}-${Math.floor(Math.random() * 1E9)}${extensao}`;
    cb(null, nomeSeguro);
  }
});

const upload = multer({ storage });

module.exports = upload;
