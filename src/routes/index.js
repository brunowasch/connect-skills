// routes/index.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

router.use(express.urlencoded({ extended: true }));

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

// Exibe a tela
router.get('/foto-perfil', (req, res) => {
  res.render('foto-perfil');
});

// Recebe o upload
router.post('/foto-perfil', upload.single('foto'), (req, res) => {
  if (req.file) {
    req.session.fotoPerfil = '/uploads/' + req.file.filename;
  }

  // Redirecionar para próxima etapa: seleção de áreas
  res.redirect('/selecionar-areas');
});

router.get('/cadastro-pessoa-juridica', (req, res) => {
  res.render('cadastro-pessoa-juridica');
});

router.post('/home-empresas', (req, res) => {
  const { cnpj, email, senha } = req.body;
  console.log(`CNPJ: ${cnpj}, Email: ${email}`); // opcional
  res.render('home-empresas');
});

// Cadastro de nome e sobrenome

router.get('/cadastro-nome', (req, res) => {
  res.render('cadastro-de-nome-e-sobrenome-candidatos');
});

router.post('/cadastro-nome', (req, res) => {
  const { nome, sobrenome, dataNascimento  } = req.body;
  // Aqui você pode salvar na sessão, banco ou passar via query
  req.session.nome = nome;
  req.session.sobrenome = sobrenome;
  req.session.dataNascimento = dataNascimento;
  req.session.ddd = null;
  req.session.telefone = null;
  //console.log('Nome salvo na sessão:', req.session.nome, req.session.sobrenome);
  res.redirect('/localizacao-login-candidato');
});

router.get('/localizacao-login-candidato', (req, res) => {
  res.render('localizacao-login-candidato');
});

router.post('/localizacao-login-candidato', (req, res) => {
  const { localidade } = req.body;

  // VERIFICAÇÃO: Se nome/sobrenome não estão definidos na sessão
  if (!req.session.nome || !req.session.sobrenome) {
    console.log('Nome ou sobrenome ausente ao salvar localidade');
    return res.redirect('/cadastro-nome');
  }

  req.session.localidade = localidade;

  //console.log('Sessão final:', req.session);
  res.redirect('/telefone'); 
});

//FIM DO CADASTRO DE NOME E SOBRENOME

router.get('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.session;
  res.render('editar-perfil', { nome, sobrenome, localidade, ddd, telefone });
});

// POST
router.post('/editar-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone } = req.body;
  req.session.nome = nome;
  req.session.sobrenome = sobrenome;
  req.session.localidade = localidade;
  req.session.ddd = ddd;
  req.session.telefone = telefone;

  //console.log('Perfil atualizado na sessão:', req.session);
  res.redirect('/meu-perfil');
});

// Página inicial
router.get('/', (req, res) => {
  res.render('home', { title: 'Connect Skills - Início' });
});

// Página de cadastro
router.get('/cadastro', (req, res) => {
  res.render('cadastro', { title: 'Cadastro - Connect Skills' });
});

router.get('/cadastro-pessoa-fisica', (req, res) => {
  res.render('cadastro-pessoa-fisica'); 
});

router.get('/home-candidatos', (req, res) => {
  res.render('home-candidatos', {
    nome: req.session.nome,
    sobrenome: req.session.sobrenome,
    localidade: req.session.localidade
  });
});

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


router.get('/cadastro-pessoa-juridica', (req, res) => {
  res.render('cadastro-pessoa-juridica');
 });

router.get('/login', (req, res) => {
  res.render('login', { title: 'Login- Connect Skills' });
});

router.get('/detalhes-da-vaga', (req, res) => {
  res.render('detalhes-da-vaga');
});

router.get('/candidatos-encontrados', (req, res) => {
  res.render('candidatos-encontrados');
});

router.get('/meu-perfil', (req, res) => {
  const { nome, sobrenome, localidade, ddd, telefone, dataNascimento, fotoPerfil } = req.session;
  const areas = req.session.areas || [];

  //console.log('Sessão:', req.session); // DEBUG
  
  // Redireciona se ainda não preencheu os dados
  if (!nome || !sobrenome) {
    return res.redirect('/cadastro-nome');
  }

  if (!localidade) {
    return res.redirect('/localizacao-login-candidato');
  }

  // Tudo preenchido, pode renderizar
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
// Mostrar a tela de telefone após localização
router.get('/telefone', (req, res) => {
  res.render('telefone'); // nome do ejs criado
});

// Salvar telefone e redirecionar para upload de foto
router.post('/telefone', (req, res) => {
  const { ddd, telefone } = req.body;
  req.session.ddd = ddd;
  req.session.telefone = telefone;

  // Redirecionar para a próxima etapa (upload de foto)
  res.redirect('/foto-perfil'); // ajuste conforme nome da sua rota de personalização
});




module.exports = router;