const express = require('express');
const router = express.Router();
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Telas de login e cadastro
router.get('/cadastro', (req, res) => {
  res.render('auth/cadastro', {
    title: 'Cadastro - Connect Skills',
    erro: req.session.erro || null,
    sucesso: req.session.sucesso || null
  });

  req.session.erro = null;
  req.session.sucesso = null;
});

router.get('/login', (req, res) => {
  // mensagem extra quando vem via query string
  if (req.query.erro === '1') {
    res.locals.erro = 'Não identificamos nenhuma conta Google cadastrada. <a href="/cadastro">Clique aqui para se cadastrar</a>.';
  }

  res.render('auth/login', {
    title: 'Login - Connect Skills'
  });
});

// Início do login com Google
router.get('/auth/google', (req, res, next) => {
const tipo = req.query.tipo || 'candidato';
const isCadastro = req.query.cadastro === '1';
const state = isCadastro ? `cadastro_${tipo}` : tipo;

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state
  })(req, res, next);
});

router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user) => {
    if (err) {
      console.error('Erro no login Google:', err);
      req.session.erro = 'Erro ao autenticar com o Google.';
      return res.redirect('/login');
    }

    if (!user) {
      const erro = req.session.erro || null;
      req.session.erro = null;

      const veioDoCadastro = req.query.state?.startsWith('cadastro_');

      if (veioDoCadastro) {
        return res.render('auth/cadastro', {
          title: 'Cadastro - Connect Skills',
          erro,
          sucesso: null
        });
      }

      return res.render('auth/login', {
        title: 'Login - Connect Skills',
        erro,
        sucesso: null
      });
    }

    req.session.usuario = {
      id: user.id,
      nome: user.nome,
      sobrenome: user.sobrenome,
      tipo: user.tipo
    };

    if (user.tipo === 'candidato') {
      const candidato = await prisma.candidato.findUnique({ where: { usuario_id: user.id } });

      const cadastroIncompleto = !candidato || !candidato.telefone || !candidato.cidade || !candidato.estado || !candidato.pais || !candidato.data_nascimento;

      if (cadastroIncompleto) {
        return res.redirect('/candidatos/cadastro/google/complementar');
      }

      req.session.candidato = {
        id: candidato.id,
        usuario_id: user.id,
        nome: user.nome,
        sobrenome: user.sobrenome,
        email: user.email,
        tipo: 'candidato',
        telefone: candidato.telefone,
        dataNascimento: candidato.data_nascimento,
        foto_perfil: candidato.foto_perfil,
        localidade: [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', '),
        areas: [] // pode ser populado depois
      };

      return res.redirect('/candidatos/home');
    }

    if (user.tipo === 'empresa') {
      const empresa = await prisma.empresa.findUnique({ where: { usuario_id: user.id } });

      const cadastroIncompleto = !empresa || !empresa.telefone || !empresa.cidade || !empresa.estado || !empresa.pais || !empresa.nome_empresa;

      if (cadastroIncompleto) {
        return res.redirect('/empresas/complementar');
      }

      req.session.empresa = {
        id: empresa.id,
        usuario_id: user.id,
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

    return res.redirect('/');
  })(req, res, next);
});


module.exports = router;