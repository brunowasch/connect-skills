exports.index = (req, res) => {
  res.render('shared/home', { title: 'Connect Skills - Início' });
};

exports.salvarPerfil = (req, res) => {
  const { nome } = req.body;

  if (!nome) {
    req.session.erro = 'Nome é obrigatório.';
    return res.redirect('/');
  }

  req.session.nomeUsuario = nome;
  req.session.sucesso = 'Perfil salvo!';
  res.redirect('/candidato/home-candidatos');
};
