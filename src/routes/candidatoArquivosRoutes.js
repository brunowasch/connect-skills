// routes/candidatoArquivosRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const candidatoArquivoController = require('../controllers/candidatoArquivoController');

function authCandidato(req, res, next) {
  const usuario = req.session?.usuario;
  if (usuario && usuario.tipo === 'candidato') return next();
  return res.redirect('/login');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB/arquivo
});

// (opcional) redireciona a página antiga de anexos
router.get('/candidato/anexos', authCandidato, candidatoArquivoController.telaAnexos);

// upload/link/delete -> sempre voltam para /candidato/editar-perfil
router.post('/candidato/anexos/upload', authCandidato, upload.array('arquivos', 5), candidatoArquivoController.uploadAnexos);
router.post('/candidato/anexos/link',   authCandidato, candidatoArquivoController.salvarLink);
router.post('/candidato/anexos/:id/delete', authCandidato, candidatoArquivoController.deletarAnexo);

module.exports = router;
