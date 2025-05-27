// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Página de cadastro geral
router.get('/cadastro', (req, res) => {
  res.render('auth/cadastro', { title: 'Cadastro - Connect Skills' });
});

// Página de login
router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login - Connect Skills' });
});



module.exports = router;

