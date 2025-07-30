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

    // 🔍 Verificações
    console.log('🔎 Checando GoogleId e Email existentes...');
    const usuarioPorGoogleId = await prisma.usuario.findUnique({ where: { googleId } });
    const usuarios = await prisma.usuario.findMany();
    const usuarioPorEmail = usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
    console.log('🆔 usuarioPorGoogleId:', usuarioPorGoogleId);
    console.log('📧 usuarioPorEmail:', usuarioPorEmail);
    console.log('🟡 isCadastro:', isCadastro);
    console.log('📌 Tipo:', tipo);

    // 🚫 BLOQUEAR cadastro se já existe
    if (isCadastro && (usuarioPorGoogleId || usuarioPorEmail)) {
      req.session.erro = 'Já existe uma conta Google com esse endereço. <a href="/login">Clique aqui para fazer login</a>.';
      await new Promise(resolve => req.session.save(resolve));
      return done(null, false);
    }

    // ✅ NOVO CADASTRO
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
      } else {
        await prisma.empresa.create({ data: { usuario_id: novoUsuario.id } });
      }

      return done(null, novoUsuario);
    }

    // 🟠 LOGIN: não encontrou nenhum
    if (!usuarioPorGoogleId && !usuarioPorEmail) {
      req.session.erro = 'Não identificamos nenhuma conta Google cadastrada. <a href="/cadastro">Clique aqui para se cadastrar</a>.';
      console.log('❗ Conta Google não encontrada para login.');
      return done(null, false);
    }

    // ✅ LOGIN: encontrou
    let usuario = usuarioPorGoogleId || usuarioPorEmail;

    // Atualiza googleId caso não esteja salvo
    if (!usuario.googleId) {
      usuario = await prisma.usuario.update({
        where: { id: usuario.id },
        data: { googleId, avatarUrl }
      });
    }

    return done(null, usuario);
  } catch (err) {
    console.error('❌ Erro no login/cadastro com Google:', err);
    return done(err, null);
  }
}));
