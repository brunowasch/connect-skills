const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

router.use(express.urlencoded({ extended: true }));

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ===== ROTAS DE CADASTRO =====

// Cadastro pessoa física
router.get('/cadastro-pessoa-fisica', (req, res) => {
  res.render('cadastro-pessoa-fisica');
});

router.post('/cadastro-pessoa-fisica', (req, res) => {
  const { cpf, contato, senha } = req.body;
  req.session.cpf = cpf;
  req.session.contato = contato;
  req.session.senha = senha;

  res.redirect('/cadastro-nome');
});

// Cadastro nome/sobrenome/dataNascimento
router.get('/cadastro-nome', (req, res) => {
  res.render('cadastro-de-nome-e-sobrenome-candidatos');
});

router.post('/cadastro-nome', (req, res) => {
  const { nome, sobrenome, dataNascimento } = req.body;
  req.session.nome = nome;
  req.session.sobrenome = sobrenome;
  req.session.dataNascimento = dataNascimento;
  req.session.ddd = null;
  req.session.telefone = null;
  res.redirect('/localizacao-login-candidato');
});

// Localização
router.get('/localizacao-login-candidato', (req, res) => {
  res.render('localizacao-login-candidato');
});

router.post('/localizacao-login-candidato', (req, res) => {
  const { localidade } = req.body;

  if (!req.session.nome || !req.session.sobrenome) {
    return res.redirect('/cadastro-nome');
  }

  req.session.localidade = localidade;
  res.redirect('/telefone');
});

// Telefone
router.get('/telefone', (req, res) => {
  res.render('telefone');
});

router.post('/telefone', (req, res) => {
  const { ddd, telefone } = req.body;
  req.session.ddd = ddd;
  req.session.telefone = telefone;
  res.redirect('/foto-perfil');
});

// Foto de perfil
router.get('/foto-perfil', (req, res) => {
  res.render('foto-perfil');
});

router.post('/foto-perfil', upload.single('foto'), (req, res) => {
  if (req.file) {
    req.session.fotoPerfil = '/uploads/' + req.file.filename;
  }
  res.redirect('/selecionar-areas');
});

// Seleção de áreas
router.get('/selecionar-areas', (req, res) => {
  res.render('selecionar-areas');
});

router.post('/selecionar-areas', (req, res) => {
  const areasSelecionadas = req.body.areasSelecionadas?.split(',') || [];

  if (areasSelecionadas.length === 3) {
    req.session.areas = areasSelecionadas;
  }

  res.redirect('/home-candidatos');
});

// Página do perfil
router.get('/meu-perfil', (req, res) => {
  const {
    nome,
    sobrenome,
    localidade,
    ddd,
    telefone,
    dataNascimento,
    fotoPerfil
  } = req.session;
  const areas = req.session.areas || [];

  if (!nome || !sobrenome) {
    return res.redirect('/cadastro-nome');
  }

  if (!localidade) {
    return res.redirect('/localizacao-login-candidato');
  }

  res.render('meu-perfil', {
    nome,
    sobrenome,
    localidade,
    ddd,
    telefone,
    dataNascimento,
    fotoPerfil,
    areas
  });
});

// Editar perfil
router.get('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.session;
  res.render('editar-perfil', { nome, sobrenome, localidade, ddd, telefone });
});

router.post('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.body;
  req.session.nome = nome;
  req.session.sobrenome = sobrenome;
  req.session.localidade = localidade;
  req.session.ddd = ddd;
  req.session.telefone = telefone;
  res.redirect('/meu-perfil');
});

// Home dos candidatos
router.get('/home-candidatos', (req, res) => {
  res.render('home-candidatos', {
    nome: req.session.nome,
    sobrenome: req.session.sobrenome,
    localidade: req.session.localidade
  });
});

// Página inicial
router.get('/', (req, res) => {
  res.render('home', { title: 'Connect Skills - Início' });
});

// Página de cadastro geral
router.get('/cadastro', (req, res) => {
  res.render('cadastro', { title: 'Cadastro - Connect Skills' });
});

// Login
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login - Connect Skills' });
});

// Cadastro PJ
router.get('/cadastro-pessoa-juridica', (req, res) => {
  res.render('cadastro-pessoa-juridica');
});

router.post('/home-empresas', (req, res) => {
  const { cnpj, email, senha } = req.body;
  res.render('home-empresas');
});

// Vagas e candidatos
router.get('/detalhes-da-vaga', (req, res) => {
  res.render('detalhes-da-vaga');
});

router.get('/candidatos-encontrados', (req, res) => {
  res.render('candidatos-encontrados');
});

module.exports = router;
