// src/routes/candidatoRoutes.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const express = require('express');
const router = express.Router();
const candidatoController = require('../controllers/candidatoController');
const uploadCandidato = require('../middlewares/upload');
const { ensureCandidato } = require('../middlewares/auth');
const withEncodedParam = require('../middlewares/withEncodedParam');

// ⬇⬇⬇ ADICIONE ESTA LINHA:
const vagaController = require('../controllers/vagaController');

// Fluxo de cadastro
router.get('/cadastro/nome', candidatoController.telaNomeCandidato);
router.post('/cadastro/nome', candidatoController.salvarNomeCandidato);

router.get('/cadastro/google/complementar', candidatoController.exibirComplementarGoogle);
router.post('/complementar', candidatoController.complementarGoogle);

// Outras etapas do cadastro padrão
router.get('/localizacao', candidatoController.telaLocalizacao);
router.post('/localizacao', candidatoController.salvarLocalizacao);

router.get('/telefone', candidatoController.telaTelefone);
router.post('/telefone', candidatoController.salvarTelefone);

router.get('/cadastro/foto-perfil', candidatoController.telaFotoPerfil);
router.post('/cadastro/foto-perfil', uploadCandidato.single('novaFoto'), candidatoController.salvarFotoPerfil);

router.get('/cadastro/areas', candidatoController.telaSelecionarAreas);
router.post('/cadastro/areas', candidatoController.salvarAreas);

router.get('/perfil/:id', withEncodedParam('id'), candidatoController.perfilPublicoCandidato);

// Rotas autenticadas
router.get('/home', ensureCandidato, candidatoController.telaHomeCandidato);
router.get('/meu-perfil', ensureCandidato, candidatoController.renderMeuPerfil);
router.get('/vagas', ensureCandidato, candidatoController.mostrarVagas);
router.get('/vagas/historico', ensureCandidato, candidatoController.historicoAplicacoes);
router.get('/vagas/:id', ensureCandidato, withEncodedParam('id'), candidatoController.vagaDetalhes);
router.get('/vagas/:id/perguntas-disc', ensureCandidato, vagaController.apiPerguntasDISC);
router.post('/vagas/:id/aplicar', ensureCandidato, withEncodedParam('id'), candidatoController.aplicarVaga);



// Edição de perfil
router.get('/editar-perfil', ensureCandidato, candidatoController.telaEditarPerfil);
router.post('/editar-perfil', ensureCandidato, uploadCandidato.single('novaFoto'), candidatoController.salvarEditarPerfil);

router.get('/editar-areas', ensureCandidato, candidatoController.telaEditarAreas);
router.post('/editar-areas', candidatoController.salvarEditarAreas);

router.post('/vaga/:id/avaliar', candidatoController.avaliarCompatibilidade);
router.post('/excluir-conta', ensureCandidato, candidatoController.excluirConta);

router.get('/pular-cadastro', candidatoController.pularCadastroCandidato);

module.exports = router;
