const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const upload = require('../config/multer');

// Cadastro inicial
router.get('/cadastro', empresaController.telaCadastro);
router.post('/cadastro', empresaController.cadastrarEmpresa);

// Etapa 1: Nome e descrição
router.get('/nome-empresa', empresaController.telaNomeEmpresa);
router.post('/nome-empresa', empresaController.salvarNomeEmpresa);

// Etapa 2: Localização
router.get('/localizacao', empresaController.telaLocalizacao);
router.post('/localizacao', empresaController.salvarLocalizacao);

// Etapa 3: Telefone
router.get('/telefone', empresaController.telaTelefone);
router.post('/telefone', empresaController.salvarTelefone);

// Etapa 4: Foto
router.get('/foto-perfil', empresaController.telaFotoPerfil);
router.post('/foto-perfil', upload.single('foto'), empresaController.salvarFotoPerfil);

// Home da empresa
router.get('/home', empresaController.homeEmpresa);

// Perfil
router.get('/meu-perfil', empresaController.telaPerfilEmpresa);

// Publicação da vaga
router.get('/publicar-vaga', empresaController.telaPublicarVaga);
router.post('/publicar-vaga', empresaController.salvarVaga);

// Detalhes da vaga
router.get('/detalhes-da-vaga', (req, res) => {
  res.render('empresas/detalhes-da-vaga');
});

// Candidatos encontrados
router.get('/candidatos-encontrados', (req, res) => {
  res.render('empresas/candidatos-encontrados');
});

// Editar perfil
router.get('/editar-empresa', empresaController.telaEditarPerfil);
router.post('/editar-empresa', upload.single('novaFoto'), empresaController.salvarEdicaoPerfil);

// Vagas criadas
router.get('/vagas', empresaController.mostrarVagas);

module.exports = router;
