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



module.exports = router;