const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback',
  passReqToCallback: true
},
async (req, accessToken, refreshToken, profile, done) => {
  try {
    const state = req.query.state || '';
    const isCadastro = state.startsWith('cadastro_');
    const tipo = state.replace('cadastro_', '') || 'candidato'; // 'candidato' ou 'empresa'
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const avatarUrl = profile.photos?.[0]?.value || 'https://via.placeholder.com/150';

    console.log('Checando GoogleId e Email existentes...');
    const usuarioPorGoogleId = await prisma.usuario.findUnique({ where: { googleId } });
    const usuarios = await prisma.usuario.findMany();
    const usuarioPorEmail = usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
    console.log('usuarioPorGoogleId:', usuarioPorGoogleId);
    console.log('usuarioPorEmail:', usuarioPorEmail);
    console.log('isCadastro:', isCadastro);
    console.log('Tipo:', tipo);

    if (isCadastro && (usuarioPorGoogleId || usuarioPorEmail)) {
      req.session.erro = 'Já existe uma conta Google com esse endereço. <a href="/login">Clique aqui para fazer login</a>.';
      await new Promise(resolve => req.session.save(resolve));
      return done(null, false);
    }

    if (isCadastro) {
      const senhaGerada = crypto.randomBytes(16).toString('hex');

      const novoUsuario = await prisma.usuario.create({
        data: {
          email,
          googleId,
          senha: senhaGerada,
          nome: profile.name.givenName || '',
          sobrenome: profile.name.familyName || '',
          avatarUrl,
          tipo
        }
      });

      if (tipo === 'candidato') {
        await prisma.candidato.create({ data: { usuario_id: novoUsuario.id } });

        req.session.usuario = {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          sobrenome: novoUsuario.sobrenome,
          tipo: 'candidato',
          foto: avatarUrl,
          email: novoUsuario.email
        };

        return done(null, novoUsuario);
      } else {
        req.session.usuario = {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          sobrenome: novoUsuario.sobrenome,
          tipo: 'empresa',
          foto: avatarUrl,
          email: novoUsuario.email
        };

        return done(null, novoUsuario);
      }
    }

    if (!usuarioPorGoogleId && !usuarioPorEmail) {
      req.session.erro = 'Não identificamos nenhuma conta Google cadastrada. <a href="/cadastro">Clique aqui para se cadastrar</a>.';
      console.log('Conta Google não encontrada para login.');
      return done(null, false);
    }

    let usuario = usuarioPorGoogleId || usuarioPorEmail;

    if (!usuario.googleId) {
      usuario = await prisma.usuario.update({
        where: { id: usuario.id },
        data: { googleId, avatarUrl }
      });
    }

    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      tipo: usuario.tipo,
      foto: usuario.avatarUrl,
      email: usuario.email
    };

    return done(null, usuario);
  } catch (err) {
    console.error('Erro no login/cadastro com Google:', err);
    return done(err, null);
  }
}));
