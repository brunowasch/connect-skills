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
const { encodeId, decodeId } = require('./utils/idEncoder');
const vagaController = require('./controllers/vagaController');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

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

const fromAddress =
  process.env.EMAIL_FROM ||
  (process.env.SMTP_USER
    ? `Connect Skills <${process.env.SMTP_USER}>`
    : 'Connect Skills <no-reply@connectskills.com.br>');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});


const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'videos-vagas', 
    resource_type: 'video',      
    allowed_formats: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  },
});


const uploadVideo = multer({ 
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

function createTransporter() {
  const host = process.env.SMTP_HOST || 'mail.connectskills.com.br';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

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

app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));
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
  res.locals.sucesso = req.session.sucessoContato || false;
  res.locals.erro    = req.session.erroContato || false;
  delete req.session.sucessoContato;
  delete req.session.erroContato;

  if (!req.isAuthenticated() && req.path.startsWith('/vagas/')) {
    req.session.returnTo = req.originalUrl;
  }

  res.locals.candidato = req.session.candidato || null;
  res.locals.empresa   = req.session.empresa || null;
  res.locals.usuario   = req.session.usuario || res.locals.candidato || res.locals.empresa || null;
  res.locals.sessionRemember = Boolean(req.session?.remember);

  res.locals.encodeId = encodeId;
  res.locals.decodeId = decodeId;
  next();
});

app.post('/vagas/enviar-video', 
  (req, res, next) => {
    // Middleware de segurança (exemplo)
    if (!req.session.candidato) return res.redirect('/login');
    next();
  },
  uploadVideo.single('video'), // <--- AQUI ESTAVA O SEGREDO (deve ser 'video')
  vagaController.uploadVideoCandidato
);

app.post('/solicitar-video', vagaController.solicitarVideoCandidato);

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

  let destino = '/#contact';
  if (req.session.candidato) destino = '/candidatos/home#contact';
  if (req.session.empresa)   destino = '/empresas/home#contact';

  if (!nome || !email || !mensagem) {
    req.session.erroContato = 'Por favor, preencha todos os campos.';
    return res.redirect(destino);
  }

  // sempre mostra sucesso pro usuário
  req.session.sucessoContato = 'Mensagem enviada!';
  res.redirect(destino);

  // envio em background + logs BEM explícitos
  setImmediate(async () => {
    try {
      console.log('[CONTATO] Tentando enviar e-mail...');
      console.log('[CONTATO] SMTP_HOST:', process.env.SMTP_HOST);
      console.log('[CONTATO] SMTP_USER:', process.env.SMTP_USER);
      console.log('[CONTATO] CONTACT_TARGET:', process.env.CONTACT_TARGET);

      const transporter = createTransporter();

      // opcional, mas ajuda a debugar
      transporter.verify((err, success) => {
        if (err) {
          console.error('[CONTATO] SMTP verify falhou:', err);
        } else {
          console.log('[CONTATO] SMTP pronto para enviar:', success);
        }
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.CONTACT_TARGET || process.env.SMTP_USER,
        subject: `Contato - ${nome}`,
        html: `
          <p><strong>Nome:</strong> ${nome}</p>
          <p><strong>E-mail:</strong> ${email}</p>
          <p><strong>Mensagem:</strong></p>
          <p>${mensagem}</p>
        `,
      });

      console.log('[CONTATO] E-mail enviado. MessageId:', info.messageId);
    } catch (error) {
      console.error('[CONTATO] Erro ao enviar contato:', error);
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
server.timeout = 300000;          
server.keepAliveTimeout = 300000; 
server.headersTimeout = 301000;

server.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});