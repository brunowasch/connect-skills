const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Pasta temporária local
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nomeArquivo = Date.now() + '-' + file.fieldname + ext;
    cb(null, nomeArquivo);
  }
});

const uploadEmpresa = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,     // até 10MB por imagem
    fieldSize: 25 * 1024 * 1024     // aumenta limite dos campos (resolve erro do base64)
  }
});

module.exports = { uploadEmpresa };
