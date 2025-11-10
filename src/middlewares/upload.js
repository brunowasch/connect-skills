const multer = require('multer');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato de imagem inválido. Use JPG/PNG/WEBP.'));
  }
});

module.exports = upload;
