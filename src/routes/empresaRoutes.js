const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const upload = require('../config/multer');
const { ensureEmpresa } = require('../middlewares/auth'); // <-- importe aqui

// Fluxo de cadastro/edição de perfil
router.get('/cadastro', empresaController.telaCadastro);
router.post('/cadastro', empresaController.cadastrarEmpresa);
router.get('/nome-empresa', empresaController.telaNomeEmpresa);
router.post('/nome-empresa', empresaController.salvarNomeEmpresa);
router.get('/localizacao', empresaController.telaLocalizacao);
router.post('/localizacao', empresaController.salvarLocalizacao);
router.get('/telefone', empresaController.telaTelefone);
router.post('/telefone', empresaController.salvarTelefone);
router.get('/foto-perfil', empresaController.telaFotoPerfil);
router.post('/foto-perfil', upload.single('foto'), empresaController.salvarFotoPerfil);

router.get('/home', empresaController.homeEmpresa);
router.get('/meu-perfil', ensureEmpresa, empresaController.telaPerfilEmpresa);
router.get('/editar-perfil', ensureEmpresa, empresaController.telaEditarPerfil);
router.post('/editar-perfil', ensureEmpresa, upload.single('novaFoto'), empresaController.salvarEdicaoPerfil);

// Publicação de vaga
router.get('/publicar-vaga',  ensureEmpresa, empresaController.telaPublicarVaga);
router.post('/publicar-vaga', ensureEmpresa, empresaController.salvarVaga);

// Listagem e detalhes
router.get('/vagas', ensureEmpresa, empresaController.mostrarVagas);
router.get('/detalhes-da-vaga', ensureEmpresa, (req, res) => res.render('empresas/detalhes-da-vaga'));
router.get('/candidatos-encontrados', ensureEmpresa, (req, res) => res.render('empresas/candidatos-encontrados'));

// Edição de vaga
router.get('/editar-vaga/:id', ensureEmpresa, empresaController.telaEditarVaga);
router.post('/editar-vaga/:id', ensureEmpresa, empresaController.salvarEditarVaga);

// Exclusão de vaga
router.post('/excluir-vaga/:id', ensureEmpresa, empresaController.excluirVaga);

module.exports = router;
