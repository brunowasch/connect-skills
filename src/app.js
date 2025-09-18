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

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

/* ---------- Segurança, compressão e proxy ---------- */
app.set('trust proxy', 1);
app.use(helmet({
   contentSecurityPolicy: false,
   contentTypeOptions: false,   
}));
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/candidato/anexos/') && req.path.endsWith('/abrir')) {
      return false; // não comprime PDFs
    }
    return compression.filter(req, res);
  }
}));

/* ---------- Parsers (limites enxutos) ---------- */
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));

/* ---------- Views e estáticos ---------- */
// Como app.js está em src/, as views ficam em src/views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', isProd);

// Se sua pasta public/ está em src/public, mantenha assim:
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

// (Se a sua public estiver na raiz do projeto em vez de src/public,
// troque para path.join(__dirname, '..', 'public') nos dois trechos acima)

/* ---------- Sessão (MySQL) ---------- */
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  clearExpired: true,
  checkExpirationInterval: 1000 * 60 * 20, // 20 min
  expiration: 1000 * 60 * 60 * 24 * 7,     // 7 dias

  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,

  // evita UPDATE na sessão a cada request
  disableTouch: true,
});

app.use(session({
  name: 'connectskills.sid',
  secret: process.env.SECRET_SESSION || process.env.SESSION_SECRET || 'connectskills-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: false,      // em Render Starter mantenha false; com TLS e proxy confiável pode ser true
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

/* ---------- Passport ---------- */
app.use(passport.initialize());
app.use(passport.session());

// serialize leve (evita query por request)
passport.serializeUser((user, done) => done(null, { id: user.id, tipo: user.tipo }));
passport.deserializeUser((payload, done) => done(null, payload));

/* ---------- Flash e locals ---------- */
app.use(flashMessage);

// mensagens de contato (sucesso/erro) e usuário atual nas views
app.use((req, res, next) => {
  res.locals.sucessoContato = req.session.sucessoContato || null;
  res.locals.erroContato     = req.session.erroContato || null;
  delete req.session.sucessoContato;
  delete req.session.erroContato;

  res.locals.candidato = req.session.candidato || null;
  res.locals.empresa   = req.session.empresa || null;
  res.locals.usuario   = req.session.usuario || res.locals.candidato || res.locals.empresa || null;
  next();
});

/* ---------- Rotas públicas ---------- */
app.use('/', mainRoutes);
app.use('/', authRoutes);
app.use('/', aliasRoutes);
app.use(candidatoArquivosRoutes);

/* ---------- Rotas autenticadas ---------- */
app.use('/usuarios', usuarioRoutes);
app.use('/candidatos', candidatoRoutes);
app.use('/empresas', empresaRoutes);

/* ---------- Healthcheck ---------- */
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

/* ---------- Páginas estáticas ---------- */
app.get('/termos', (req, res) => {
  res.render('shared/termos');
});
app.get('/politica-privacidade', (req, res) => {
  res.render('shared/politica-privacidade');
});

/* ---------- Logout ---------- */
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

/* ---------- Contato (envio async; não trava request) ---------- */
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

/* ---------- 404 ---------- */
app.use((req, res) => {
  try {
    res.status(404).render('shared/404', { url: req.originalUrl });
  } catch {
    res.status(404).type('html').send(`<!doctype html><title>404</title><h1>404 – Página não encontrada</h1><p>${req.originalUrl}</p>`);
  }
});

/* ---------- 500 ---------- */
app.use((err, req, res, _next) => {
  console.error('Erro não tratado:', err);
  try {
    res.status(500).render('shared/500', { erro: err?.message || 'Erro interno' });
  } catch {
    res.status(500).type('html').send(`<!doctype html><title>500</title><h1>500 – Erro interno</h1><pre>${(err && err.stack) || err}</pre>`);
  }
});

/* ---------- Server com keep-alive (estável no Render) ---------- */
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
