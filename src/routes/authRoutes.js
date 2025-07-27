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

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    const usuario = req.user;

    if (!usuario || !usuario.id) {
      console.error('Usuário inválido no callback do Google:', usuario);
      return res.redirect('/login');
    }

    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome || '',
      sobrenome: usuario.sobrenome || '',
      tipo: usuario.tipo
    };

    if (usuario.tipo === 'candidato') {
      const candidato = await prisma.candidato.findUnique({ where: { usuario_id: usuario.id } });
      if (candidato) {
        req.session.candidato = candidato;
        return req.session.save(() => res.redirect('/candidatos/home'));
      } else {
        return res.redirect('/candidatos/cadastro/google/complementar');
      }
    } else if (usuario.tipo === 'empresa') {
      const empresa = await prisma.empresa.findUnique({ where: { usuario_id: usuario.id } });
      if (empresa) {
        req.session.empresa = empresa;
        return req.session.save(() => res.redirect('/empresa/home'));
      } else {
        return res.redirect('/empresas/cadastro/google/complementar');
      }
    }

    return res.redirect('/login');
  }
);

module.exports = router;
