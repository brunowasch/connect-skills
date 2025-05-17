const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./src/config/db');
const routes = require('./src/routes/index');

const app = express();
const port = 3000;

app.use(session({
  secret: 'connectskills_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // IMPORTANTE: true apenas se estiver usando HTTPS
    maxAge: 1000 * 60 * 60 * 2 // 2 horas
  }
}));

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Configuração do EJS
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));



// Rotas
app.use('/', routes);

app.get('/cadastro-pessoa-juridica', (req, res) => {
  res.render('cadastro-pessoa-juridica');
});


app.post('/home-empresas', (req, res) => {
  // Aqui você pode pegar os dados do form se quiser
  const { cnpj, email, senha } = req.body;

  // Por enquanto, só redireciona mesmo para a tela da home das empresas
  res.render('home-empresas');
});

// Iniciando servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
