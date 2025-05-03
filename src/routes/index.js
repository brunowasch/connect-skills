// routes/index.js
const express = require('express');
const router = express.Router();

router.use(express.urlencoded({ extended: true }));

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
  const { nome, sobrenome } = req.body;
  // Aqui você pode salvar na sessão, banco ou passar via query
  req.session.nome = nome;
  req.session.sobrenome = sobrenome;
  res.redirect('/localização-login-candidato');
});

router.get('/localizacao-login-candidato', (req, res) => {
  res.render('localizacao-login-candidato');
});

router.post('/localizacao', (req, res) => {
  const { localidade } = req.body;
  // Você pode armazenar localidade também, se quiser
  req.session.localidade = localidade;
  // Redireciona para a próxima etapa
  res.redirect('/oportunidades'); // ou qualquer próxima rota
});

//FIM DO CADASTRO DE NOME E SOBRENOME

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
  res.render('home-candidatos');
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



module.exports = router;