require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./src/config/db'); // Se estiver usando MySQL ou outro banco
const routes = require('./src/routes/index');
const empresaRoutes = require('./src/routes/empresaRoutes');
const app = express();
const port = 3000;


// ESSENCIAIS:
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));


// Para servir arquivos estáticos como imagens:
app.use(express.static(path.join(__dirname, '../public')));

// Configuração de sessão
app.use(session({
  secret: process.env.SECRET_SESSION,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: false, // true apenas se estiver usando HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
  }
}));

app.use('/uploads', express.static('uploads'));

app.get('/logout', (req, res) => {app.use('/uploads', express.static('uploads'));

  // Exemplo: destruir sessão
  req.session.destroy(err => {
    res.redirect('/');
  });
});

// Body parsers
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// EJS e views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use('/empresas', empresaRoutes);

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static('public'));

// Middleware global para formulário
app.use(express.urlencoded({ extended: true }));

// Rotas organizadas
app.use('/', routes);

// Início do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
