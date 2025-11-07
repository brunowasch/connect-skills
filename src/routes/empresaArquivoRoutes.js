const express = require('express');
const router = express.Router();
const multer = require('multer');
const withEncodedParam = require('../middlewares/withEncodedParam');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function requireEmpresaSession(req, res, next) {
  if (req.session?.empresa?.id) return next();
  return res.redirect('/login');
}

const empresaController = require('../controllers/empresaController');
const empresaArquivoController = require('../controllers/empresaArquivoController');
const { ensureEmpresa } = require('../middlewares/auth');

router.get('/empresa/anexos', requireEmpresaSession, empresaController.telaAnexosEmpresa);

router.post(
  '/empresa/anexos/upload',
  requireEmpresaSession,
  upload.array('anexos'),
  empresaArquivoController.uploadAnexos
);

router.post(
  '/empresa/anexos/link',
  requireEmpresaSession,
  empresaArquivoController.salvarLink
);

router.get(
  '/empresa/anexos/:id/abrir',
  ensureEmpresa,
  requireEmpresaSession,
  empresaArquivoController.abrirAnexo
);

router.post(
  '/empresa/anexos/:id/delete',
  requireEmpresaSession,
  ensureEmpresa,
  empresaArquivoController.deletarAnexo
);

router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    if (req.flash) req.flash('erro', 'Arquivo excede o limite de 10MB.');
    return res.redirect('/empresa/anexos');
  }
  next(err);
});

router.get(
  '/public/empresa/anexos/:id/abrir', 
  empresaArquivoController.abrirAnexoPublico
);

module.exports = router;