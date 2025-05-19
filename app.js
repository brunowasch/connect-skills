const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./src/config/db'); // Config do banco, se já estiver pronto
const routes = require('./src/routes/index');

const app = express();
const port = 3000;

// Sessão
app.use(session({
  secret: 'connectskills_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // true apenas se usar HTTPS
    maxAge: 1000 * 60 * 60 * 2 // 2 horas
  }
}));

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// EJS + Caminho das views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Multer (upload de imagens)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Uso das rotas externas
app.use('/', routes);

// Rotas diretas (opcional)
app.get('/cadastro-pessoa-juridica', (req, res) => {
  res.render('cadastro-pessoa-juridica');
});

// Simulação de login da empresa
app.post('/home-empresas', (req, res) => {
  const { cnpj, email, senha } = req.body;
  res.render('home-empresas');
});

app.get('/cadastro-pessoa-fisica', (req, res) => {
  res.render('cadastro-pessoa-fisica');
});


// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
