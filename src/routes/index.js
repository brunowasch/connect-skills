const express = require('express');
const router = express.Router();

// Roteadores separados
const authRoutes = require('./authRoutes');
const candidatoRoutes = require('./candidatoRoutes');
const empresaRoutes = require('./empresaRoutes');

// Página inicial
router.get('/', (req, res) => {
  res.render('shared/home', { title: 'Connect Skills - Início' });
});

// Use os roteadores
router.use('/', authRoutes);
router.use('/candidato', candidatoRoutes);
router.use('/empresa', empresaRoutes);

module.exports = router;
