require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const passport = require('passport');
const compression = require('compression');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const cookieParser = require('cookie-parser');
const { encodeId, decodeId } = require('./src/utils/idEncoder');

// Configs e utils
require('./config/passportGoogle');
const prisma = require('./config/prisma');
const flashMessage = require('./middlewares/flashMessage');

// Rotas
const aliasRoutes = require('./routes/aliasRoutes');
const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const candidatoRoutes = require('./routes/candidatoRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const mainRoutes = require('./routes/index');
const candidatoArquivosRoutes = require('./routes/candidatoArquivosRoutes');
const empresaArquivoRoutes = require('./routes/empresaArquivoRoutes');

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(helmet({
   contentSecurityPolicy: false,
   contentTypeOptions: false,   
}));
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/candidato/anexos/') && req.path.endsWith('/abrir')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', isProd);

app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '7d', 
  etag: true,
  immutable: true,
}));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '7d',
  etag: true,
  immutable: true,
}));

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  clearExpired: true,
  checkExpirationInterval: 1000 * 60 * 60, 
  expiration: THIRTY_DAYS,                
  disableTouch: false,
});

app.use((req, _res, next) => {
  try {
    if (req.session?.remember) {
      req.session.touch();
    }
  } catch {}
  next();
});

app.use(session({
  name: 'connectskills.sid',
  secret: process.env.SECRET_SESSION || 'connectskills-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  rolling: false,
  unset: 'destroy',
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, { id: user.id, tipo: user.tipo }));
passport.deserializeUser((payload, done) => done(null, payload));

app.use(flashMessage);

app.use((req, res, next) => {
  res.locals.sucessoContato = req.session.sucessoContato || null;
  res.locals.erroContato     = req.session.erroContato || null;
  delete req.session.sucessoContato;
  delete req.session.erroContato;

  res.locals.candidato = req.session.candidato || null;
  res.locals.empresa   = req.session.empresa || null;
  res.locals.usuario   = req.session.usuario || res.locals.candidato || res.locals.empresa || null;
  res.locals.sessionRemember = Boolean(req.session?.remember);
  next();
});

app.use('/', mainRoutes);
app.use('/', authRoutes);
app.use('/', aliasRoutes);
app.use(candidatoArquivosRoutes);
app.use(empresaArquivoRoutes);

app.use('/usuarios', usuarioRoutes);
app.use('/candidatos', candidatoRoutes);
app.use('/empresas', empresaRoutes);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/termos', (req, res) => {
  res.render('shared/termos');
});
app.get('/politica-privacidade', (req, res) => {
  res.render('shared/politica-privacidade');
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

app.get('/contato', (req, res) => {
  res.render('shared/contato');
});

app.post('/enviar-contato', async (req, res) => {
  const { nome, email, mensagem } = req.body || {};
  const destino = req.session.candidato ? '/candidatos/home' : '/empresas/home';

  if (!nome || !email || !mensagem) {
    req.session.erroContato = 'Por favor, preencha nome, e-mail e mensagem.';
    return res.redirect(destino);
  }

  req.session.sucessoContato = 'Mensagem recebida! Em instantes, enviaremos a confirmação por e-mail.';
  res.redirect(destino);

  setImmediate(async () => {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || process.env.GMAIL_USER,
          pass: process.env.EMAIL_PASS || process.env.GMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'Connect Skills <no-reply@connectskills.com>',
        to: process.env.CONTACT_TARGET || process.env.EMAIL_USER || process.env.GMAIL_USER,
        subject: `Mensagem de Contato - ${nome}`,
        html: `
          <p><strong>Nome:</strong> ${nome}</p>
          <p><strong>E-mail:</strong> ${email}</p>
          <p><strong>Mensagem:</strong></p>
          <p>${mensagem}</p>
        `,
      });
    } catch (e) {
      console.error('Erro ao enviar contato (background):', e);
    }
  });
});

app.use((req, res) => {
  try {
    res.status(404).render('shared/404', { url: req.originalUrl });
  } catch {
    res.status(404).type('html').send(`<!doctype html><title>404</title><h1>404 – Página não encontrada</h1><p>${req.originalUrl}</p>`);
  }
});

app.use((err, req, res, _next) => {
  console.error('Erro não tratado:', err);
  try {
    res.status(500).render('shared/500', { erro: err?.message || 'Erro interno' });
  } catch {
    res.status(500).type('html').send(`<!doctype html><title>500</title><h1>500 – Erro interno</h1><pre>${(err && err.stack) || err}</pre>`);
  }
});

const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});