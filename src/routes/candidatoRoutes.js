const express = require('express');
const router = express.Router();
const candidatoController = require('../controllers/candidatoController');
const upload = require('../middlewares/upload');

// Cadastro passo a passo
router.get('/cadastro/nome', candidatoController.telaNomeCandidato);
router.post('/cadastro/nome', candidatoController.salvarNomeCandidato);

router.get('/localizacao', candidatoController.telaLocalizacao);
router.post('/localizacao', candidatoController.salvarLocalizacao);

router.get('/telefone', candidatoController.telaTelefone);
router.post('/telefone', candidatoController.salvarTelefone);

router.get('/foto-perfil', candidatoController.telaFotoPerfil);
router.post('/foto-perfil', upload.single('fotoUpload'), candidatoController.salvarFotoPerfil);

router.get('/areas', candidatoController.telaSelecionarAreas);
router.post('/areas', candidatoController.salvarAreas);

// Acesso autenticado
router.get('/home', candidatoController.telaHomeCandidato);
router.get('/meu-perfil', candidatoController.mostrarPerfil);
router.get('/vagas', candidatoController.mostrarVagas);

module.exports = router;