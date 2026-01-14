const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const candidatoRoutes = require('./candidatoRoutes');
const empresaRoutes = require('./empresaRoutes');

router.get('/', (req, res) => {
  console.log('Sessão recebida na /:', req.session);

  if (req.session.candidato) {
    return res.redirect('/candidatos/home');
  }

  if (req.session.empresa) {
    return res.redirect('/empresas/home');
  }

  res.render('shared/home', { title: 'Connect Skills - Início' });
});

router.use('/', authRoutes); 
router.use('/usuarios', usuarioRoutes); 

router.use('/candidatos', candidatoRoutes);
router.use('/candidato', candidatoRoutes);
router.use('/empresa', empresaRoutes);

module.exports = router;