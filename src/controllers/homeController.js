exports.index = (req, res) => {
    res.render('home', { title: 'Connect Skills - Início' });
  };
exports.salvarPerfil = (req, res) => {
    const { nome } = req.body;

    // Aqui você atualizaria o banco de dados com os dados do perfil (não está incluído aqui)
    req.session.nomeUsuario = nomeDoUsuario;

    res.redirect('/home-candidatos');
};