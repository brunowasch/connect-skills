// routes/index.js
const express = require('express');
const router = express.Router();

// Página inicial
router.get('/', (req, res) => {
  res.render('home', { title: 'Connect Skills - Início' });
});

// Página de cadastro
router.get('/cadastro', (req, res) => {
  res.render('cadastro', { title: 'Cadastro - Connect Skills' });
});

module.exports = router;
