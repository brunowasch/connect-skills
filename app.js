require('dotenv').config();
const express = require('express');
const router = express.Router();
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./src/config/db');
const MySQLStore = require('express-mysql-session')(session);
const passport = require('passport');
require('./src/config/passportGoogle');
const prisma = require('./src/config/prisma');
const nodemailer = require('nodemailer');

const authRoutes = require('./src/routes/authRoutes');
const usuarioRoutes = require('./src/routes/usuarioRoutes');
const candidatoRoutes = require('./src/routes/candidatoRoutes');
const empresaRoutes = require('./src/routes/empresaRoutes');
const mainRoutes = require('./src/routes/index');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await prisma.usuario.findUnique({ where: { id } });
  done(null, user);
});

const options = {
  host: process.env.DB_HOST || 'localhost',
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  clearExpired: true,
  checkExpirationInterval: 900000,
  expiration: 86400000,
  connectionLimit: 5,
  connectTimeout: 10000,
  waitForConnections: true,
  queueLimit: 0
});

app.use(session({
  secret: process.env.SECRET_SESSION || 'default_secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  res.locals.candidato = req.session.candidato || null;
  res.locals.empresa = req.session.empresa || null;
  res.locals.usuario = req.session.candidato || req.session.empresa || null;

  res.locals.sucesso = req.session.sucesso || null;
  res.locals.erro = req.session.erro || null;

  req.session.sucesso = null;
  req.session.erro = null;

  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const autenticar = (req, res, next) => {
  if (!req.session.usuario && !req.session.empresa) {
    return res.redirect('/login');
  }
  next();
};

app.use('/', mainRoutes);
app.use('/', authRoutes);
app.use('/usuarios', usuarioRoutes);
app.use('/candidatos', candidatoRoutes);
app.use('/empresas', empresaRoutes);

app.get('/auth/google/callback',
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

      if (!candidato || !candidato.telefone || !candidato.cidade || !candidato.estado || !candidato.pais || !candidato.data_nascimento) {
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

      if (!empresa || !empresa.telefone || !empresa.cidade || !empresa.estado || !empresa.pais) {
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

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

app.get('/contato', (req, res) => {
  res.render('shared/contato', {
    sucesso: req.session.sucesso || null,
    erro: req.session.erro || null,
    candidato: req.session.candidato || null,
    empresa: req.session.empresa || null,
    usuario: req.session.candidato || req.session.empresa || null
  });
  req.session.sucesso = null;
  req.session.erro = null;
});

app.post('/enviar-contato', async (req, res) => {
  const { nome, email, mensagem } = req.body;

  try {
    // Transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: 'Connect Skills <no-reply@connectskills.com>',
      to: process.env.EMAIL_USER,
      subject: 'Mensagem de Contato - Connect Skills',
      html: `
        <p><strong>Nome:</strong> ${nome}</p>
        <p><strong>E-mail:</strong> ${email}</p>
        <p><strong>Mensagem:</strong> ${mensagem}</p>
      `
    });

    // Decide qual página recarregar com mensagem de sucesso
    if (req.session.candidato) {
      return res.render('candidatos/home-candidatos', {
        sucesso: 'Email enviado com sucesso! Entraremos em contato em breve.',
        erro: null,
        candidato: req.session.candidato,
        empresa: null
      });
    } else if (req.session.empresa) {
      return res.render('empresas/home-empresas', {
        sucesso: 'Email enviado com sucesso! Entraremos em contato em breve.',
        erro: null,
        empresa: req.session.empresa,
        candidato: null,
        usuario: {
          nome: req.session.empresa.nome_empresa,
          email: req.session.usuario?.email || ''
        }
      });
    } else {
      return res.render('shared/home', {
        sucesso: 'Email enviado com sucesso! Entraremos em contato em breve.',
        erro: null
      });
    }
  } catch (error) {
    console.error('Erro ao enviar email de contato:', error);
    const mensagemErro = 'Erro ao enviar o email. Tente novamente mais tarde.';

    if (req.session.candidato) {
      return res.render('candidatos/home-candidatos', {
        sucesso: null,
        erro: mensagemErro,
        candidato: req.session.candidato,
        empresa: null
      });
    } else if (req.session.empresa) {
      return res.render('empresas/home-empresas', {
        sucesso: null,
        erro: mensagemErro,
        empresa: req.session.empresa,
        candidato: null
      });
    } else {
      return res.render('shared/home', {
        sucesso: null,
        erro: mensagemErro
      });
    }
  }
});

app.get('/candidatos/home', (req, res) => {
  if (!req.session.usuario || req.session.usuario.tipo !== 'candidato') {
    return res.redirect('/login');
  }

  res.render('candidatos/home-candidatos', {
    sucesso: req.session.sucesso || null,
    erro: req.session.erro || null,
    candidato: req.session.candidato || null,
    usuario: req.session.usuario || null
  });

  // Limpa as mensagens após exibir
  req.session.sucesso = null;
  req.session.erro = null;
});


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
