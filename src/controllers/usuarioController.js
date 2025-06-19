const usuarioModel = require('../models/usuarioModel');

exports.criarUsuario = (req, res) => {
  const { email, senha, tipo } = req.body;

  if (!email || !senha || !tipo) {
    return res.status(400).send('Preencha todos os campos.');
  }

  usuarioModel.cadastrar({ email, senha, tipo }, (err, result) => {
    if (err) {
  console.error('Erro ao cadastrar no banco:', err); // loga o erro
  return res.status(500).send(`Erro ao cadastrar no banco: ${err.message}`);
}

    const usuarioId = result.insertId; // 👈 aqui que define!

    if (tipo === 'empresa') {
        return res.redirect(`/empresa/nome-empresa?usuario_id=${usuarioId}`);
    } else {
      return res.redirect(`/candidato/cadastro/nome?usuario_id=${usuarioId}`);
    }
  });
};
