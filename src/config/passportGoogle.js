const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const isProd = process.env.NODE_ENV === 'production';  // Verificando o ambiente
const BASE_URL = process.env.BASE_URL || (isProd ? 'https://connectskills.com.br' : 'http://localhost:3000');
const CALLBACK_URL = `${BASE_URL}/auth/google/callback`;
console.log('[OAUTH] Google callbackURL:', CALLBACK_URL);


// Funções de criação e atualização de usuário
async function safeCreateUsuario(data) {
  try {
    return await prisma.usuario.create({ data });
  } catch (e) {
    const msg = (e && e.message) || '';
    const unknownField = msg.includes('Unknown field') || msg.includes('Unknown argument');
    const avatarInData = Object.prototype.hasOwnProperty.call(data, 'avatarUrl');
    if (unknownField && avatarInData) {
      const { avatarUrl, ...rest } = data;
      return await prisma.usuario.create({ data: rest });
    }
    throw e;
  }
}

async function safeUpdateUsuario(where, data) {
  try {
    return await prisma.usuario.update({ where, data });
  } catch (e) {
    const msg = (e && e.message) || '';
    const unknownField = msg.includes('Unknown field') || msg.includes('Unknown argument');
    const avatarInData = Object.prototype.hasOwnProperty.call(data, 'avatarUrl');
    if (unknownField && avatarInData) {
      const { avatarUrl, ...rest } = data;
      return await prisma.usuario.update({ where, data: rest });
    }
    throw e;
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Checa se o usuário está tentando cadastrar ou logar
        const state = (req.query.state || '').trim();
        const isCadastro = state.startsWith('cadastro_');
        let tipoSolicitado = state.replace('cadastro_', '').toLowerCase().trim();
        if (!['candidato', 'empresa'].includes(tipoSolicitado)) {
          tipoSolicitado = 'candidato';
        }

        // Extração de dados do Google
        const googleId = profile?.id || '';
        const rawEmail = (profile?.emails && profile.emails[0] && profile.emails[0].value) || '';
        const email = rawEmail.trim().toLowerCase();
        const avatarUrl = (profile?.photos && profile.photos[0] && profile.photos[0].value) || 'https://via.placeholder.com/150';
        const nome = (profile?.name?.givenName || '').trim();
        const sobrenome = (profile?.name?.familyName || '').trim();

        if (!email) {
          req.session.erro = 'Não foi possível obter seu e-mail do Google. Verifique as permissões da conta ou tente outra conta.';
          await new Promise((r) => req.session.save(r));
          return done(null, false);
        }

        // Verifica se o e-mail ou o googleId já existe
        const usuarioPorEmail = await prisma.usuario.findUnique({ where: { email } });
        const usuarioPorGoogleId = googleId ? await prisma.usuario.findUnique({ where: { googleId } }) : null;

        if (isCadastro) {
          if (usuarioPorEmail) {
            req.session.erro = 'Já existe uma conta com este e-mail. <a href="/login">Clique aqui para fazer login</a>.';
            await new Promise((r) => req.session.save(r));
            return done(null, false);
          }
          if (usuarioPorGoogleId) {
            req.session.erro = 'Esta conta do Google já está vinculada a um usuário.';
            await new Promise((r) => req.session.save(r));
            return done(null, false);
          }

          // Criação de um novo usuário
          const senhaGerada = crypto.randomBytes(16).toString('hex');
          let novoUsuario = await safeCreateUsuario({
            email,
            googleId,
            senha: senhaGerada,
            nome,
            sobrenome,
            avatarUrl,
            tipo: tipoSolicitado,
          });

          // Criação do perfil de candidato ou empresa
          if (tipoSolicitado === 'candidato') {
            await prisma.candidato.create({ data: { usuario_id: novoUsuario.id } });
          }

          req.session.usuario = {
            id: novoUsuario.id,
            nome: novoUsuario.nome,
            sobrenome: novoUsuario.sobrenome,
            tipo: novoUsuario.tipo,
            foto: novoUsuario.avatarUrl || null,
            email: novoUsuario.email,
          };
          await new Promise((r) => req.session.save(r));
          return done(null, novoUsuario);
        }

        // Verificação para login ou vinculação do Google ID
        if (!usuarioPorGoogleId && !usuarioPorEmail) {
          req.session.erro = 'Não identificamos nenhuma conta Google cadastrada. <a href="/cadastro">Clique aqui para se cadastrar</a>.';
          await new Promise((r) => req.session.save(r));
          return done(null, false);
        }

        let usuario = usuarioPorGoogleId || usuarioPorEmail;
        if (usuario && !usuario.googleId && googleId) {
          usuario = await safeUpdateUsuario({ id: usuario.id }, { googleId, avatarUrl });
        }

        req.session.usuario = {
          id: usuario.id,
          nome: usuario.nome,
          sobrenome: usuario.sobrenome,
          tipo: usuario.tipo,
          foto: usuario.avatarUrl || null,
          email: usuario.email,
        };
        await new Promise((r) => req.session.save(r));

        // Definindo o redirecionamento correto
        const redirectTo = req.query.redirectTo || (usuario.tipo === 'candidato' ? '/candidatos/home' : '/empresa/home');
        return res.redirect(redirectTo);
      } catch (err) {
        console.error('Erro no login/cadastro com Google:', err);
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
