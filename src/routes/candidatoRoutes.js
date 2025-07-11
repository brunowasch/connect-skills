const express = require('express');
const router = express.Router();
const candidatoController = require('../controllers/candidatoController');
const upload = require('../middlewares/upload');
const { ensureCandidato } = require('../middlewares/auth');

// Cadastro passo a passo
router.get('/cadastro/nome',       candidatoController.telaNomeCandidato);
router.post('/cadastro/nome',      candidatoController.salvarNomeCandidato);

router.get('/cadastro/localizacao',       candidatoController.telaLocalizacao);
router.post('/cadastro/localizacao',      candidatoController.salvarLocalizacao);

router.get('/cadastro/telefone',       candidatoController.telaTelefone);
router.post('/cadastro/telefone',      candidatoController.salvarTelefone);

router.get('/cadastro/foto-perfil',       candidatoController.telaFotoPerfil);
router.post('/cadastro/foto-perfil', upload.single('fotoUpload'), candidatoController.salvarFotoPerfil);

router.get('/cadastro/areas',       candidatoController.telaSelecionarAreas);
router.post('/cadastro/areas',      candidatoController.salvarAreas);

// Acesso autenticado
router.get('/home',       ensureCandidato, candidatoController.telaHomeCandidato);
router.get('/meu-perfil', ensureCandidato, candidatoController.mostrarPerfil);
router.get('/vagas',      ensureCandidato, candidatoController.mostrarVagas);

// Edição de perfil do candidato
router.get('/editar-perfil',        ensureCandidato, candidatoController.telaEditarPerfil);
router.post('/editar-perfil',       ensureCandidato, upload.single('novaFoto'), candidatoController.salvarEditarPerfil);

module.exports = router;
