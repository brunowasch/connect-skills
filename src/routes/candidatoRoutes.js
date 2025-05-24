// src/routes/candidatoRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Cadastro pessoa física
router.get('/cadastro', (req, res) => {
  res.render('candidatos/cadastro-pessoa-fisica');
});

router.post('/cadastro', (req, res) => {
  const { cpf, contato, senha } = req.body;
    req.session.cpf = cpf;
    req.session.contato = contato;
    req.session.senha = senha;
  res.redirect('/candidato/nome');
});

// Nome e data de nascimento
router.get('/nome', (req, res) => {
  res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos');
});

router.post('/nome', (req, res) => {
  const { nome, sobrenome, dataNascimento } = req.body;
  Object.assign(req.session, { nome, sobrenome, dataNascimento, ddd: null, telefone: null });
  res.redirect('/candidato/localizacao');
});

// Localização
router.get('/localizacao', (req, res) => {
  res.render('candidatos/localizacao-login-candidato');
});

router.post('/localizacao', (req, res) => {
  const { localidade } = req.body;
  if (!req.session.nome || !req.session.sobrenome) return res.redirect('/candidato/nome');
  req.session.localidade = localidade;
  res.redirect('/candidato/telefone');
});

// Telefone
router.get('/telefone', (req, res) => {
  res.render('candidatos/telefone');
});

router.post('/telefone', (req, res) => {
  const { ddd, telefone } = req.body;
  Object.assign(req.session, { ddd, telefone });
  res.redirect('/candidato/foto');
});

// Foto de perfil
router.get('/foto', (req, res) => {
  res.render('candidatos/foto-perfil');
});

router.post('/foto', upload.single('foto'), (req, res) => {
  if (req.body.fotoBase64) {
    const base64Data = req.body.fotoBase64.replace(/^data:image\/png;base64,/, '');
    const filename = Date.now() + '.png';
    const filepath = path.join(__dirname, '../../public/uploads', filename);
    fs.writeFileSync(filepath, base64Data, 'base64');
    req.session.fotoPerfil = '/uploads/' + filename;
  } else if (req.file) {
    req.session.fotoPerfil = '/uploads/' + req.file.filename;
  }
  res.redirect('/candidato/areas');
});

// Seleção de áreas
router.get('/areas', (req, res) => {
  res.render('candidatos/selecionar-areas');
});

router.post('/areas', (req, res) => {
  const areasSelecionadas = req.body.areasSelecionadas?.split(',') || [];
  if (areasSelecionadas.length === 3) req.session.areas = areasSelecionadas;
  res.redirect('/candidato/home');
});

// Perfil
router.get('/meu-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone, dataNascimento, fotoPerfil } = req.session;
  const areas = req.session.areas || [];
  if (!nome || !sobrenome) return res.redirect('/candidato/nome');
  if (!localidade) return res.redirect('/candidato/localizacao');
  res.render('candidatos/meu-perfil', { nome, sobrenome, localidade, ddd, telefone, dataNascimento, fotoPerfil, areas });
});

// Editar perfil
router.get('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.session;
  res.render('candidatos/editar-perfil', { nome, sobrenome, localidade, ddd, telefone });
});

router.post('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.body;
  Object.assign(req.session, { nome, sobrenome, localidade, ddd, telefone });
  res.redirect('/candidato/meu-perfil');
});

// Home dos candidatos
router.get('/home', (req, res) => {
  res.render('candidatos/home-candidatos', {
    nome: req.session.nome,
    sobrenome: req.session.sobrenome,
    localidade: req.session.localidade
  });
});

module.exports = router;
