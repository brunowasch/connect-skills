const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

// Conexão com banco de dados
const db = require('./src/config/db');

// Configuração do EJS
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Rotas
const routes = require('./src/routes/index');
app.use('/', routes);

app.use(express.urlencoded({ extended: true }));

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
