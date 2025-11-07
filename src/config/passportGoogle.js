// src/config/passportGoogle.js (revisado p/ callback dinâmico por ambiente)
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const APP_URL =
  process.env.APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://connectskills.com.br'
    : `http://localhost:${process.env.PORT || 3000}`);

const CALLBACK_URL =
  `${APP_URL.replace(/\/+$/, '')}/auth/google/callback`;

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,        // <- chave da correção
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const state = (req.query.state || '').trim();
      const isCadastro = state.startsWith('cadastro_');
      const tipoSolicitado = state.replace('cadastro_', '') || 'candidato'; // candidato|empresa

      const googleId = profile.id;
      const rawEmail = profile.emails && profile.emails[0] && profile.emails[0].value
        ? profile.emails[0].value
        : '';
      const email = rawEmail.trim().toLowerCase();
      const avatarUrl = profile.photos?.[0]?.value || 'https://via.placeholder.com/150';
      const nome = profile.name?.givenName || '';
      const sobrenome = profile.name?.familyName || '';

      const isConnError = (e) =>
        e?.name === 'PrismaClientInitializationError' ||
        /Can't reach database server/i.test(e?.message || '');

      let usuarioPorEmail = null;
      let usuarioPorGoogleId = null;
      try {
        if (email) {
          usuarioPorEmail = await prisma.usuario.findUnique({ where: { email } });
        }
        if (googleId) {
          usuarioPorGoogleId = await prisma.usuario.findUnique({ where: { googleId } });
        }
      } catch (e) {
        if (isConnError(e)) {
          req.session.erro = 'Estamos com instabilidade no banco de dados. Tente novamente em instantes.';
          await new Promise(r => req.session.save(r));
          return done(null, false);
        }
        throw e;
      }

      // FLUXO CADASTRO
      if (isCadastro) {
        if (usuarioPorEmail) {
          req.session.erro = 'Já existe uma conta com este e-mail. <a href="/login">Clique aqui para fazer login</a>.';
          await new Promise(resolve => req.session.save(resolve));
          return done(null, false);
        }

        if (usuarioPorGoogleId) {
          req.session.erro = 'Esta conta do Google já está vinculada a um usuário.';
          await new Promise(resolve => req.session.save(resolve));
          return done(null, false);
        }

        const senhaGerada = crypto.randomBytes(16).toString('hex');
        const novoUsuario = await prisma.usuario.create({
          data: {
            email,
            googleId,
            senha: senhaGerada,
            nome,
            sobrenome,
            avatarUrl,
            tipo: tipoSolicitado, 
          }
        });

        const tipo = novoUsuario.tipo || tipoSolicitado || 'candidato';
        req.session.usuario = {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          sobrenome: novoUsuario.sobrenome,
          tipo,
          foto: novoUsuario.avatarUrl,
          email: novoUsuario.email
        };
        
        if (tipoSolicitado === 'candidato') {
          await prisma.candidato.create({ data: { usuario_id: novoUsuario.id } });
        } else if (tipoSolicitado === 'empresa') {
        }

        await new Promise(resolve => req.session.save(resolve));
        return done(null, { ...novoUsuario, tipo });
      }

      // FLUXO LOGIN
      if (!usuarioPorGoogleId && !usuarioPorEmail) {
        req.session.erro = 'Não identificamos nenhuma conta Google cadastrada. <a href="/cadastro">Clique aqui para se cadastrar</a>.';
        await new Promise(resolve => req.session.save(resolve));
        return done(null, false);
      }

      let usuario = usuarioPorGoogleId || usuarioPorEmail;
      if (usuario && !usuario.googleId && googleId) {
        usuario = await prisma.usuario.update({
          where: { id: usuario.id },
          data: { googleId, avatarUrl }
        });
      }

      const tipo = (usuario && usuario.tipo) || tipoSolicitado || 'candidato';

      req.session.usuario = {
        id: usuario.id,
        nome: usuario.nome,
        sobrenome: usuario.sobrenome,
        tipo, 
        foto: usuario.avatarUrl,
        email: usuario.email
      };

      await new Promise(resolve => req.session.save(resolve));
      return done(null, { ...usuario, tipo });
    } catch (err) {
      console.error('Erro no login/cadastro com Google:', err);
      return done(err, null);
    }
  }
));

module.exports = passport;
