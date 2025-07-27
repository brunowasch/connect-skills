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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Arquivos estáticos (CSS, imagens, JS, uploads)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Middleware de autenticação (opcional, se quiser proteger rotas)
const autenticar = (req, res, next) => {
  if (!req.session.usuario && !req.session.empresa) {
    return res.redirect('/login');
  }
  next();
};

app.use('/', mainRoutes);
app.use('/', authRoutes); // /cadastro, /login
app.use('/usuarios', usuarioRoutes); // cadastro, login, verificação

// Rotas autenticadas por tipo
app.use('/candidatos', candidatoRoutes); // etapa de cadastro e acesso
app.use('/empresas', empresaRoutes);     // etapa de cadastro e acesso

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    const usuario = req.user; // 👈 ISSO TEM QUE VIR ANTES DE TUDO

    console.log('✅ Usuário logado via Google:', {
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

      
      console.log('📦 Dados do candidato:', candidato);
      const cadastroIncompleto = !candidato?.telefone || 
                                candidato.telefone.includes('não informado') ||
                                !candidato.cidade || 
                                !candidato.estado || 
                                !candidato.pais || 
                                !candidato.data_nascimento;

      if (cadastroIncompleto) {
        console.log('🔁 Redirecionando para complemento do Google...');
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
      return res.redirect('/empresas/home');
    }

    res.redirect('/');
  }
);

// Rota de logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
