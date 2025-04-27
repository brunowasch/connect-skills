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

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
const routes = require('./src/routes/index');
app.use('/', routes);

// Iniciando servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
