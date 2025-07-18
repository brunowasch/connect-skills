const express = require('express');
const router = express.Router();
const candidatoController = require('../controllers/candidatoController');
const uploadCandidato = require('../middlewares/upload');
const { ensureCandidato } = require('../middlewares/auth');

// Fluxo de cadastro
router.get('/cadastro/nome', candidatoController.telaNomeCandidato);
router.post('/cadastro/nome', candidatoController.salvarNomeCandidato);

router.get('/localizacao', candidatoController.telaLocalizacao);
router.post('/localizacao', candidatoController.salvarLocalizacao);

router.get('/telefone', candidatoController.telaTelefone);
router.post('/telefone', candidatoController.salvarTelefone);

router.get('/cadastro/foto-perfil', candidatoController.telaFotoPerfil);
router.post('/cadastro/foto-perfil', uploadCandidato.single('novaFoto'), candidatoController.salvarFotoPerfil); 

router.get('/cadastro/areas', candidatoController.telaSelecionarAreas);
router.post('/cadastro/areas', candidatoController.salvarAreas);

// Rotas autenticadas
router.get('/home', ensureCandidato, candidatoController.telaHomeCandidato);
router.get('/meu-perfil', ensureCandidato, candidatoController.renderMeuPerfil);
router.get('/vagas', ensureCandidato, candidatoController.mostrarVagas);

// Edição de perfil
router.get('/editar-perfil', ensureCandidato, candidatoController.telaEditarPerfil);
router.post('/editar-perfil', ensureCandidato, uploadCandidato.single('novaFoto'), candidatoController.salvarEditarPerfil); 

router.get('/editar-areas', candidatoController.telaEditarAreas);
router.post('/editar-areas', candidatoController.salvarEditarAreas);

module.exports = router;
