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

// Callback do Google após login
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    const usuario = req.user;

    console.log('Usuário logado via Google:', {
      id: usuario.id,
      tipo: usuario.tipo
    });

    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      tipo: usuario.tipo
    };

    if (usuario.tipo === 'candidato') {
      const candidato = await prisma.candidato.findUnique({
        where: { usuario_id: usuario.id }
      });

      const cadastroIncompleto = !candidato?.telefone || 
                                candidato.telefone.includes('não informado') ||
                                !candidato.cidade || 
                                !candidato.estado || 
                                !candidato.pais || 
                                !candidato.data_nascimento;

      if (cadastroIncompleto) {
        console.log('🔁 Redirecionando para complemento do Google...');
        return res.redirect('/candidatos/cadastro/google/complementar');
      }

      req.session.candidato = {
        id: candidato.id,
        usuario_id: usuario.id,
        nome: usuario.nome,
        sobrenome: usuario.sobrenome,
        email: usuario.email,
        tipo: 'candidato',
        telefone: candidato.telefone,
        dataNascimento: candidato.data_nascimento,
        foto_perfil: candidato.foto_perfil,
        localidade: [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', '),
        areas: []
      };

      return res.redirect('/candidatos/home');
    }

    if (usuario.tipo === 'empresa') {
      const empresa = await prisma.empresa.findUnique({
        where: { usuario_id: usuario.id }
      });

      const cadastroIncompleto = !empresa || !empresa.telefone || !empresa.cidade || !empresa.estado || !empresa.pais;

      if (cadastroIncompleto) {
        console.log('🔁 Redirecionando empresa para complemento do Google...');
        return res.redirect('/empresas/complementar');
      }

      req.session.empresa = {
        id: empresa.id,
        usuario_id: usuario.id,
        nome_empresa: empresa.nome_empresa,
        descricao: empresa.descricao,
        telefone: empresa.telefone,
        cidade: empresa.cidade,
        estado: empresa.estado,
        pais: empresa.pais,
        foto_perfil: empresa.foto_perfil || ''
      };

      return res.redirect('/empresas/home');
    }

    res.redirect('/');
  }
);




module.exports = router;
