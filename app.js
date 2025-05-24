const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./src/config/db'); // Se estiver usando MySQL ou outro banco
const routes = require('./src/routes/index');

const app = express();
const port = 3000;

// Configuração de sessão
app.use(session({
  secret: 'connectskills_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // true apenas se estiver usando HTTPS
    maxAge: 1000 * 60 * 60 * 2 // 2 horas
  }
}));

// Body parsers
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// EJS e views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Middleware global para formulário
app.use(express.urlencoded({ extended: true }));

// Rotas organizadas
app.use('/', routes);

// Início do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
