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
