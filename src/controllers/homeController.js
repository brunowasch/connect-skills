exports.index = (req, res) => {
  res.render('shared/home', { title: 'Connect Skills - Início' });
};

exports.salvarPerfil = (req, res) => {
  const { nome } = req.body;

  if (!nome) {
    return res.status(400).send('Nome é obrigatório.');
  }

  req.session.nomeUsuario = nome;
  res.redirect('/candidato/home-candidatos'); 
};
