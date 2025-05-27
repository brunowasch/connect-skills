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

/*---------------------------
    CADASTRO E LOGIN
----------------------------*/
router.get('/cadastro', (req, res) => {
  res.render('candidatos/cadastro-pessoa-fisica');
});

router.post('/cadastro', (req, res) => {
  const { cpf, contato, senha } = req.body;
  Object.assign(req.session, { cpf, contato, senha });
  res.redirect('/candidato/nome');
});

/*---------------------------
    ETAPA NOME
----------------------------*/
router.get('/nome', (req, res) => {
  res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos');
});

router.post('/nome', (req, res) => {
  const { nome, sobrenome, dataNascimento } = req.body;
  Object.assign(req.session, { nome, sobrenome, dataNascimento, ddd: null, telefone: null });
  res.redirect('/candidato/localizacao');
});

/*---------------------------
    ETAPA LOCALIZAÇÃO
----------------------------*/
router.get('/localizacao', (req, res) => {
  res.render('candidatos/localizacao-login-candidato');
});

router.post('/localizacao', (req, res) => {
  const { localidade } = req.body;
  if (!req.session.nome || !req.session.sobrenome) return res.redirect('/candidato/nome');
  req.session.localidade = localidade;
  res.redirect('/candidato/telefone');
});

/*---------------------------
    ETAPA TELEFONE
----------------------------*/
router.get('/telefone', (req, res) => {
  res.render('candidatos/telefone');
});

router.post('/telefone', (req, res) => {
  const { ddd, telefone } = req.body;
  Object.assign(req.session, { ddd, telefone });
  res.redirect('/candidato/foto');
});

/*---------------------------
    ETAPA FOTO DE PERFIL
----------------------------*/
router.get('/foto', (req, res) => {
  res.render('candidatos/foto-perfil');
});

router.post('/foto', (req, res) => {
  const base64Data = req.body.fotoBase64;

  if (!base64Data || base64Data.trim() === '') {
    return res.redirect('/candidato/foto');
  }

  const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    return res.redirect('/candidato/foto');
  }

  const ext = matches[1]; // png, jpg, jpeg
  const data = matches[2]; // conteúdo da imagem
  const filename = Date.now() + '.' + ext;
  const filepath = path.join(__dirname, '../../public/uploads', filename);

  try {
    fs.writeFileSync(filepath, data, 'base64');
    req.session.fotoPerfil = '/uploads/' + filename;
    res.redirect('/candidato/areas');
  } catch (err) {
    console.error('Erro ao salvar imagem:', err);
    res.redirect('/candidato/foto');
  }
});


/*---------------------------
    ETAPA ÁREAS DE INTERESSE
----------------------------*/
router.get('/areas', (req, res) => {
  res.render('candidatos/selecionar-areas');
});

router.post('/areas', (req, res) => {
  const areasSelecionadas = req.body.areasSelecionadas?.split(',') || [];
  if (areasSelecionadas.length === 3) {
    req.session.areas = areasSelecionadas;
  }
  res.redirect('/candidato/home');
});

/*---------------------------
    PERFIL
----------------------------*/
router.get('/meu-perfil', (req, res) => {
  const {
    nome,
    sobrenome,
    localidade,
    ddd,
    telefone,
    dataNascimento,
    fotoPerfil,
    areas = []
  } = req.session;

  if (!nome || !sobrenome) return res.redirect('/candidato/nome');
  if (!localidade) return res.redirect('/candidato/localizacao');

  res.render('candidatos/meu-perfil', {
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

/*---------------------------
    EDITAR PERFIL
----------------------------*/
router.get('/editar-perfil', (req, res) => {
  const {
    nome,
    sobrenome,
    localidade,
    ddd,
    telefone
  } = req.session;

  res.render('candidatos/editar-perfil', {
    nome,
    sobrenome,
    localidade,
    ddd,
    telefone
  });
});

router.post('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.body;
  Object.assign(req.session, { nome, sobrenome, localidade, ddd, telefone });
  res.redirect('/candidato/meu-perfil');
});

/*---------------------------
    HOME DOS CANDIDATOS
----------------------------*/
router.get('/home', (req, res) => {
  const { nome, sobrenome, localidade } = req.session;
  res.render('candidatos/home-candidatos', { nome, sobrenome, localidade });
});

module.exports = router;
