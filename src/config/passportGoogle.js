// passportGoogle.js (revisado para impedir duplicidade global de e-mail)
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      // state esperado: "cadastro_candidato" ou "cadastro_empresa"
      const state = (req.query.state || '').trim();
      const isCadastro = state.startsWith('cadastro_');
      const tipoSolicitado = state.replace('cadastro_', '') || 'candidato'; // candidato|empresa

      // Normaliza e extrai dados
      const googleId = profile.id;
      const rawEmail = profile.emails && profile.emails[0] && profile.emails[0].value
        ? profile.emails[0].value
        : '';
      const email = rawEmail.trim().toLowerCase();
      const avatarUrl = profile.photos?.[0]?.value || 'https://via.placeholder.com/150';
      const nome = profile.name?.givenName || '';
      const sobrenome = profile.name?.familyName || '';

      // Busca por email (unicidade global) e por googleId
      const usuarioPorEmail = email
        ? await prisma.usuario.findUnique({ where: { email } })
        : null;

      const usuarioPorGoogleId = googleId
        ? await prisma.usuario.findUnique({ where: { googleId } })
        : null;

      // FLUXO CADASTRO
      if (isCadastro) {
        // 1) Se já existe QUALQUER usuário com esse e-mail, bloqueia criar outro (independente do tipo).
        if (usuarioPorEmail) {
          req.session.erro = 'Já existe uma conta com este e-mail. <a href="/login">Clique aqui para fazer login</a>.';
          await new Promise(resolve => req.session.save(resolve));
          return done(null, false);
        }

        // 2) Se já existe alguém com esse googleId (mesmo que e-mail difira), bloqueia duplicidade também.
        if (usuarioPorGoogleId) {
          req.session.erro = 'Esta conta do Google já está vinculada a um usuário.';
          await new Promise(resolve => req.session.save(resolve));
          return done(null, false);
        }

        // 3) Criar novo usuário (sem duplicidade)
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

        // Cria perfil “mínimo” do tipo, quando aplicável
        if (tipoSolicitado === 'candidato') {
          await prisma.candidato.create({ data: { usuario_id: novoUsuario.id } });
        } else if (tipoSolicitado === 'empresa') {
        }

        req.session.usuario = {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          sobrenome: novoUsuario.sobrenome,
          tipo: novoUsuario.tipo,
          foto: novoUsuario.avatarUrl,
          email: novoUsuario.email
        };

        return done(null, novoUsuario);
      }

      // FLUXO LOGIN
      // Nem cadastro nem linkagem — usuário deve existir por e-mail ou por googleId
      if (!usuarioPorGoogleId && !usuarioPorEmail) {
        req.session.erro = 'Não identificamos nenhuma conta Google cadastrada. <a href="/cadastro">Clique aqui para se cadastrar</a>.';
        await new Promise(resolve => req.session.save(resolve));
        return done(null, false);
      }

      // Se achou por e-mail mas ainda não tem googleId, vincula
      let usuario = usuarioPorGoogleId || usuarioPorEmail;

      if (usuario && !usuario.googleId && googleId) {
        usuario = await prisma.usuario.update({
          where: { id: usuario.id },
          data: { googleId, avatarUrl }
        });
      }

      // Preenche sessão
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
  }
));

module.exports = passport;
