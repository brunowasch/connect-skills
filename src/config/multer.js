const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Garante que a pasta 'uploads/' exista
const pastaUploads = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(pastaUploads)) {
  fs.mkdirSync(pastaUploads);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pastaUploads); // Caminho absoluto
  },
  filename: (req, file, cb) => {
    const nomeUnico = Date.now() + '-' + file.originalname;
    cb(null, nomeUnico);
  }
});

const upload = multer({ storage });

module.exports = upload;
