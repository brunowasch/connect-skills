// middlewares/upload.js
const multer = require('multer');

// Armazenamento em memória para pegar o buffer diretamente
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // até 5 MB
});

module.exports = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }
});
