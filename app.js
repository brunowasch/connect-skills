require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const MySQLStore = require('express-mysql-session')(session);
const passport = require('passport');
require('./src/config/passportGoogle');
const prisma = require('./src/config/prisma');
const nodemailer = require('nodemailer');

const flashMessage = require('./src/middlewares/flashMessage');

const aliasRoutes = require('./src/routes/aliasRoutes');
const authRoutes = require('./src/routes/authRoutes');
const usuarioRoutes = require('./src/routes/usuarioRoutes');
const candidatoRoutes = require('./src/routes/candidatoRoutes');
const empresaRoutes = require('./src/routes/empresaRoutes');
const mainRoutes = require('./src/routes/index');

const app = express();
const port = 3000;

// Parsers
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Passport
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await prisma.usuario.findUnique({ where: { id } });
  done(null, user);
});

// Session store
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

// Session
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

// Passport (depois da sessão)
app.use(passport.initialize());
app.use(passport.session());

// Flash (depois da sessão, antes das rotas)
app.use(flashMessage);

app.use((req, res, next) => {
  res.locals.sucessoContato = req.session.sucessoContato || null;
  res.locals.erroContato     = req.session.erroContato || null;
  delete req.session.sucessoContato;
  delete req.session.erroContato;
  next();
});

// Expor usuário atual nas views (não toca nas mensagens)
app.use((req, res, next) => {
  res.locals.candidato = req.session.candidato || null;
  res.locals.empresa = req.session.empresa || null;
  res.locals.usuario = req.session.candidato || req.session.empresa || null;
  next();
});

// Views e estáticos
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Rotas
app.use('/', mainRoutes);
app.use('/', authRoutes);
app.use('/', aliasRoutes);
app.use('/usuarios', usuarioRoutes);
app.use('/candidatos', candidatoRoutes);
app.use('/empresas', empresaRoutes);
 
// Callback do Google (se você já trata isso em authRoutes, pode remover daqui)
app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', { failWithError: true }, async (err, user) => {
    if (err) {
      console.error('Erro no callback Google:', err);
      req.session.erro = 'Erro ao autenticar com o Google.';
      return res.redirect('/login');
    }

    if (!user) {
      const erro = req.session.erro || '';
      if (erro.includes('Clique aqui para fazer login')) {
        return res.redirect('/cadastro');
      } else {
        return res.redirect('/login');
      }
    }

    req.login(user, async (loginErr) => {
      if (loginErr) {
        console.error('Erro ao logar manualmente:', loginErr);
        req.session.erro = 'Erro ao criar sessão com Google.';
        return res.redirect('/login');
      }

      // Sessão base
      req.session.usuario = {
        id: user.id,
        nome: user.nome,
        sobrenome: user.sobrenome,
        tipo: user.tipo,
        email: user.email,
        foto: user.avatarUrl || ''
      };

      const tipo = user.tipo;

      if (tipo === 'candidato') {
        const candidato = await prisma.candidato.findUnique({ where: { usuario_id: user.id } });

        const cadastroIncompleto = !candidato
          || !candidato.telefone || !candidato.cidade || !candidato.estado || !candidato.pais || !candidato.data_nascimento;

        if (cadastroIncompleto) {
          return res.redirect('/candidatos/cadastro/google/complementar');
        }

        req.session.candidato = {
          id: candidato.id,
          usuario_id: user.id,
          nome: user.nome,
          sobrenome: user.sobrenome,
          email: user.email,
          tipo: 'candidato',
          telefone: candidato.telefone,
          dataNascimento: candidato.data_nascimento,
          foto_perfil: candidato.foto_perfil,
          localidade: [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', '),
          areas: []
        };

        return res.redirect('/candidatos/home');
      }

      if (tipo === 'empresa') {
        const empresa = await prisma.empresa.findUnique({ where: { usuario_id: user.id } });

        const cadastroIncompleto = !empresa
          || !empresa.telefone || !empresa.cidade || !empresa.estado || !empresa.pais;

        if (cadastroIncompleto) {
          return res.redirect('/empresas/complementar');
        }

        req.session.empresa = {
          id: empresa.id,
          usuario_id: user.id,
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

      return res.redirect('/');
    });
  })(req, res, next);
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Contato (view simples — mensagens vêm de res.locals)
app.get('/contato', (req, res) => {
  res.render('shared/contato', {
    candidato: req.session.candidato || null,
    empresa: req.session.empresa || null,
    usuario: req.session.candidato || req.session.empresa || null
  });
});

// Home do candidato (sem mexer em sucesso/erro)
app.get('/candidatos/home', (req, res) => {
  if (!req.session.usuario || req.session.usuario.tipo !== 'candidato') {
    return res.redirect('/login');
  }

  res.render('candidatos/home-candidatos', {
    candidato: req.session.candidato || null,
    usuario: req.session.usuario || null
  });
});

// Enviar contato (aqui renderiza direto com sucesso/erro específicos)
app.post('/enviar-contato', async (req, res) => {
  const { nome, email, mensagem } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
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

    req.session.sucessoContato = 'Email enviado com sucesso! Entraremos em contato em breve.';
    const destino = req.session.candidato ? '/candidatos/home' : '/empresas/home';
    return res.redirect(destino);

  } catch (e) {
    console.error('Erro ao enviar contato:', e);
    req.session.erroContato = 'Não conseguimos enviar sua mensagem. Tente novamente.';
    const destino = req.session.candidato ? '/candidatos/home' : '/empresas/home';
    return res.redirect(destino);
  }
});

// Start
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
