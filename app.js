require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./src/config/db');
const routes = require('./src/routes/index');
const empresaRoutes = require('./src/routes/empresaRoutes');
const usuarioRoutes = require('./src/routes/usuarioRoutes');
const candidatoRoutes = require('./src/routes/candidatoRoutes');
const app = express();
const port = 3000;

// Middleware de leitura de dados dos formulários
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Sessão
app.use(session({
  secret: process.env.SECRET_SESSION || 'default_secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
  }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Arquivos estáticos (CSS, imagens, JS)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Rotas específicas primeiro
app.use('/usuarios', usuarioRoutes);
app.use('/empresas', empresaRoutes);
app.use('/candidato', candidatoRoutes);

// Rota de logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Rotas genéricas por último
app.use('/', routes);

// Inicia servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
