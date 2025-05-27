exports.telaCadastro = (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica'); // Ajuda a manter o padrão da pasta 'empresas'
};

// Processa o cadastro da empresa (simulação sem banco de dados)
exports.cadastrarEmpresa = (req, res) => {
  const { cnpj, email, senha } = req.body;

  // Simulando um cadastro
  console.log('Empresa cadastrada:', { cnpj, email, senha });

  // Redireciona para próxima etapa (nome + descrição da empresa)
  res.redirect('/empresas/nome-empresa');
};

// Exibe a tela para preencher nome e descrição da empresa
exports.telaNomeEmpresa = (req, res) => {
  res.render('empresas/nome-empresa'); // view em views/empresa/nome-empresa.ejs
};

exports.telaNomeEmpresa = (req, res) => {
  res.render('empresas/nome-empresa');
};

// Processa os dados de nome e descrição da empresa
exports.salvarNomeEmpresa = (req, res) => {
  const { nome, descricao } = req.body;

  // Simulando salvamento
  console.log('Informações da empresa:', { nome, descricao });

  // Redireciona para a home/dashboard da empresa
  res.redirect('/empresas/localizacao');
};

// GET: Exibe a tela de localização
exports.telaLocalizacao = (req, res) => {
  res.render('empresas/localizacao'); // certifique-se que o arquivo está em views/empresas/localizacao.ejs
};

// POST: Processa a localização
exports.salvarLocalizacao = (req, res) => {
  const { localidade } = req.body;

  console.log('Localização da empresa:', localidade);

  // Redireciona para a próxima tela do fluxo
  res.redirect('/empresas/telefone'); // ou outra próxima etapa
};

exports.telaLocalizacao = (req, res) => {
  res.render('empresas/localizacao-login-juridica'); // <-- nome exato do seu arquivo .ejs
};

// GET: Exibe a tela de telefone
exports.telaTelefone = (req, res) => {
  res.render('empresas/telefone-empresa'); // nome exato da view
};

// POST: Processa os dados do telefone
exports.salvarTelefone = (req, res) => {
  const { ddd, telefone } = req.body;

  console.log('Telefone recebido:', `+55 (${ddd}) ${telefone}`);

  // Redireciona para a próxima tela do fluxo
  res.redirect('/empresas/foto-perfil'); // substitua pela próxima rota real
};

// GET: Exibe a tela de foto de perfil da empresa
exports.telaFotoPerfil = (req, res) => {
  res.render('empresas/foto-perfil-empresa');
};

// POST: Processa o envio do logo (simulado)
exports.salvarFotoPerfil = (req, res) => {
  console.log('Logo da empresa enviado (simulado)');
  res.redirect('/empresas/home'); // ou a próxima tela real
};

// Exibe a "home" da empresa
exports.homeEmpresa = (req, res) => {
  res.render('empresas/home-empresas'); // view em views/empresas/home-empresas.ejs
};



