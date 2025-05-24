// src/routes/empresaRoutes.js
const express = require('express');
const router = express.Router();

// Cadastro PJ
router.get('/cadastro', (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica');
});

// Simulação de login da empresa e redirecionamento para home
router.post('/home', (req, res) => {
  const { cnpj, email, senha } = req.body;
  // Aqui pode-se adicionar lógica de autenticação futura
  res.render('empresas/home-empresas');
});

// Detalhes da vaga
router.get('/detalhes-da-vaga', (req, res) => {
  res.render('empresas/detalhes-da-vaga');
});

// Candidatos encontrados
router.get('/candidatos-encontrados', (req, res) => {
  res.render('empresas/candidatos-encontrados');
});

module.exports = router;
