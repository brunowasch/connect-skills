const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');

// Cadastro PJ
router.get('/cadastro', empresaController.telaCadastro);
router.post('/cadastro', empresaController.cadastrarEmpresa);

// Nome e descrição da empresa
router.get('/nome-empresa', empresaController.telaNomeEmpresa);
router.post('/nome-empresa', empresaController.salvarNomeEmpresa);

// Localização
router.get('/localizacao', empresaController.telaLocalizacao);
router.post('/localizacao', empresaController.salvarLocalizacao);

// Telefone
router.get('/telefone', empresaController.telaTelefone);
router.post('/telefone', empresaController.salvarTelefone);

// Foto de perfil (logo da empresa)
router.get('/foto-perfil', empresaController.telaFotoPerfil);
router.post('/foto-perfil', empresaController.salvarFotoPerfil);

// Home da empresa
router.get('/home', empresaController.homeEmpresa);
router.post('/home', empresaController.homeEmpresa);

// Detalhes da vaga
router.get('/detalhes-da-vaga', (req, res) => {
  res.render('empresas/detalhes-da-vaga');
});

// Candidatos encontrados
router.get('/candidatos-encontrados', (req, res) => {
  res.render('empresas/candidatos-encontrados');
});


module.exports = router;
