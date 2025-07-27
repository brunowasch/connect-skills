const express = require('express');
const router = express.Router();
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Tela de cadastro
router.get('/cadastro', (req, res) => {
  res.render('auth/cadastro', { title: 'Cadastro - Connect Skills' });
});

// Tela de login
router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login - Connect Skills' });
});


// Início do login com Google (define tipo no state)
router.get('/auth/google', (req, res, next) => {
  const tipo = req.query.tipo; // 'candidato' ou 'empresa'
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: tipo
  })(req, res, next);
});

module.exports = router;
