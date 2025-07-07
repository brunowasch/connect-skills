const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const upload = require('../config/multer');

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
router.get('/meu-perfil', empresaController.telaPerfilEmpresa);
router.get('/editar-perfil', empresaController.telaEditarPerfil);
router.post('/editar-perfil', upload.single('novaFoto'), empresaController.salvarEdicaoPerfil);

router.get('/publicar-vaga', empresaController.telaPublicarVaga);
router.post('/publicar-vaga', empresaController.salvarVaga);

router.get('/vagas', empresaController.mostrarVagas);
router.get('/detalhes-da-vaga', (req, res) => res.render('empresas/detalhes-da-vaga'));
router.get('/candidatos-encontrados', (req, res) => res.render('empresas/candidatos-encontrados'));

module.exports = router;
