const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const multer = require('multer');
const path = require('path');
const upload = require('../config/multer'); 

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + file.originalname);
  }
});


// Cadastro inicial (CNPJ, email, senha)
router.get('/cadastro', empresaController.telaCadastro);
router.post('/cadastro', empresaController.cadastrarEmpresa);

// Nome e descrição
router.get('/nome-empresa', empresaController.telaNomeEmpresa);
router.post('/nome-empresa', empresaController.salvarNomeEmpresa);

// Localização
router.get('/localizacao', empresaController.telaLocalizacao);
router.post('/localizacao', empresaController.salvarLocalizacao);

// Telefone
router.get('/telefone', empresaController.telaTelefone);
router.post('/telefone', empresaController.salvarTelefone);


router.get('/foto-perfil', empresaController.telaFotoPerfil);
router.post('/foto-perfil', upload.single('fotoPerfil'), empresaController.salvarFotoPerfil);
upload.single('fotoPerfil')


// Home da empresa
router.get('/home', empresaController.homeEmpresa);
router.post('/home', empresaController.homeEmpresa); // se for necessário manter o POST

// Perfil da empresa
router.get('/meu-perfil', empresaController.telaPerfilEmpresa);

//Publicação da vaga
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

//Editar perfil empresas
router.get('/editar-empresa', empresaController.telaEditarPerfil);

router.post('/editar-empresa', upload.single('novaFoto'), empresaController.salvarEdicaoPerfil);

module.exports = router;  
