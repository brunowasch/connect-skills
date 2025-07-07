const express = require('express');
const router = express.Router();

router.get('/cadastro', (req, res) => {
  res.render('auth/cadastro', { title: 'Cadastro - Connect Skills' });
});

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login - Connect Skills' });
});

module.exports = router;