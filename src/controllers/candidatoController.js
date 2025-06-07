exports.mostrarPerfil = (req, res) => {
  const usuario = req.session.usuario;

  if (!usuario) {
    return res.redirect('/login'); // ou página de erro
  }

  res.render('candidato/meu-perfil', {
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    localidade: usuario.localidade,
    ddd: usuario.ddd,
    telefone: usuario.telefone,
    dataNascimento: usuario.dataNascimento,
    fotoPerfil: usuario.fotoPerfil,
    areas: usuario.areas || [],
    candidaturas: usuario.candidaturas || []
  });
};
exports.mostrarVagas = (req, res) => {
  const vagas = req.session.vagasPublicadas || []; // acessa vagas salvas na sessão
  res.render('candidatos/vagas', { vagas });
};
res.render('candidatos/home-candidatos', {
  nome,
  sobrenome,
  localidade,
  activePage: 'home'
});
res.render('candidatos/vagas', {
  vagas,
  activePage: 'vagas'
});
res.render('candidatos/meu-perfil', {
  nome,
  sobrenome,
  localidade,
  ddd,
  telefone,
  dataNascimento,
  fotoPerfil,
  areas,
  activePage: 'perfil'
});

