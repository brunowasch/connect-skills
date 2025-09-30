// routes/empresaArquivoRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

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

/**
 * LISTA / TELA DE ANEXOS DA EMPRESA
 * (se você preferir, pode renderizar direto na tela de editar perfil; aqui deixei a rota dedicada)
 */
router.get('/empresa/anexos', requireEmpresaSession, empresaController.telaAnexosEmpresa);

/**
 * UPLOAD DE ANEXOS (múltiplos)
 * <input type="file" name="anexos" multiple>
 */
router.post(
  '/empresa/anexos/upload',
  requireEmpresaSession,
  upload.array('anexos'),
  empresaArquivoController.uploadAnexos
);

/**
 * ADICIONAR LINK (salva um link público como "anexo")
 * body: { label, url }
 */
router.post(
  '/empresa/anexos/link',
  requireEmpresaSession,
  empresaArquivoController.salvarLink
);

/**
 * ABRIR ANEXO INLINE (PDF/Imagem) OU FORÇAR DOWNLOAD (outros)
 */
router.get(
  '/empresa/anexos/:id/abrir',
  requireEmpresaSession,
  empresaArquivoController.abrirAnexo
);

/**
 * DELETAR ANEXO
 */
router.post(
  '/empresa/anexos/:id/delete',
  requireEmpresaSession,
  empresaArquivoController.deletarAnexo
);

/**
 * TRATAMENTO DE ERRO DE TAMANHO (10MB)
 */
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    if (req.flash) req.flash('erro', 'Arquivo excede o limite de 10MB.');
    return res.redirect('/empresa/anexos');
  }
  next(err);
});

module.exports = router;
