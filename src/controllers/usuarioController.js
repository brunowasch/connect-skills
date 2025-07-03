const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuarioModel');

exports.criarUsuario = async (req, res) => {
  const { email, senha, tipo } = req.body;

  if (!email || !senha || !tipo) {
    return res.status(400).send('Preencha todos os campos.');
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    usuarioModel.cadastrar({ email, senha: senhaCriptografada, tipo }, (err, result) => {
      if (err) {
        console.error('Erro ao cadastrar no banco:', err);
        return res.status(500).send(`Erro ao cadastrar no banco: ${err.message}`);
      }

      const usuarioId = result.insertId;

      if (tipo === 'empresa') {
        return res.redirect(`/empresa/nome-empresa?usuario_id=${usuarioId}`);
      } else {
        return res.redirect(`/candidato/cadastro/nome?usuario_id=${usuarioId}`);
      }
    });
  } catch (erro) {
    console.error('Erro ao criptografar a senha:', erro);
    return res.status(500).send('Erro interno ao processar o cadastro.');
  }
};