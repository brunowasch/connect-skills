const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const candidatoRoutes = require('./candidatoRoutes');
const empresaRoutes = require('./empresaRoutes');

// Página inicial
router.get('/', (req, res) => {
  res.render('shared/home', { title: 'Connect Skills - Início' });
});

// Rotas públicas
router.use('/', authRoutes); // /cadastro, /login
router.use('/usuarios', usuarioRoutes); // /cadastrar, /verificar-email

// Rotas por tipo de usuário
router.use('/candidato', candidatoRoutes);
router.use('/empresa', empresaRoutes);

module.exports = router;