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
    const tipo = req.query.state; // 'candidato' ou 'empresa'
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const avatarUrl = profile.photos[0]?.value || '';

    // 1. Tenta encontrar por googleId
    let usuario = await prisma.usuario.findUnique({
      where: { googleId }
    });

    // 2. Se não encontrou por googleId, procura por email
    if (!usuario) {
      usuario = await prisma.usuario.findUnique({
        where: { email }
      });

      // 2a. Se encontrou por email, atualiza com googleId e avatar
      if (usuario) {
        usuario = await prisma.usuario.update({
          where: { email },
          data: {
            googleId,
            avatarUrl
          }
        });
      } else {
        // 2b. Se não encontrou por email, cria novo usuário
        const senhaGerada = crypto.randomBytes(16).toString('hex');

        usuario = await prisma.usuario.create({
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
          await prisma.candidato.create({
            data: { usuario_id: usuario.id }
          });
        } else if (tipo === 'empresa') {
          await prisma.empresa.create({
            data: { usuario_id: usuario.id }
          });
        }
      }
    }

    done(null, usuario);
  } catch (err) {
    done(err, null);
  }
}));
