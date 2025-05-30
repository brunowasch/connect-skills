// Tela inicial de cadastro (CNPJ, email, senha)
exports.telaCadastro = (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica');
};

exports.cadastrarEmpresa = (req, res) => {
  const { cnpj, email, senha } = req.body;

  // Simulação: salvando dados iniciais na sessão
  req.session.empresa = { cnpj, email, senha };

  res.redirect('/empresa/nome-empresa');
};

// Tela e salvamento do nome e descrição
exports.telaNomeEmpresa = (req, res) => {
  res.render('empresas/nome-empresa');
};

exports.salvarNomeEmpresa = (req, res) => {
  const { nome, descricao } = req.body;

  req.session.empresa = {
    ...req.session.empresa,
    nome,
    descricao
  };

  res.redirect('/empresa/localizacao');
};

// Tela e salvamento da localização
exports.telaLocalizacao = (req, res) => {
  res.render('empresas/localizacao-login-juridica');
};

exports.salvarLocalizacao = (req, res) => {
  const { localidade } = req.body;

  req.session.empresa = {
    ...req.session.empresa,
    localidade
  };

  res.redirect('/empresa/telefone');
};

// Tela e salvamento do telefone
exports.telaTelefone = (req, res) => {
  res.render('empresas/telefone-empresa');
};

exports.salvarTelefone = (req, res) => {
  const { ddd, telefone } = req.body;

  req.session.empresa = {
    ...req.session.empresa,
    ddd,
    telefone
  };

  res.redirect('/empresa/foto-perfil');
};

// Tela da foto (logo da empresa)
exports.telaFotoPerfil = (req, res) => {
  res.render('empresas/foto-perfil-empresa');
};

// Salva imagem como base64 na sessão
exports.salvarFotoPerfil = (req, res) => {
  if (req.body.fotoBase64) {
    req.session.empresa = {
      ...req.session.empresa,
      fotoPerfil: req.body.fotoBase64
    };
  } else if (req.file) {
    req.session.empresa = {
      ...req.session.empresa,
      fotoPerfil: `/uploads/${req.file.filename}`
    };
  }

  res.redirect('/empresa/home');
};


// Página inicial da empresa (dashboard)
exports.homeEmpresa = (req, res) => {
  res.render('empresas/home-empresas');
};

// Tela do perfil da empresa
exports.telaPerfilEmpresa = (req, res) => {
  const empresa = req.session.empresa;

  if (!empresa) {
    return res.send('Dados da empresa não encontrados na sessão.');
  }

  res.render('empresas/meu-perfil', { empresa });
};
