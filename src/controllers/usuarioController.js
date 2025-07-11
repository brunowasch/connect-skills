const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');

async function enviarEmailVerificacao(email, usuario_id) {
  const token = jwt.sign({ id: usuario_id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const link = `http://localhost:3000/usuarios/verificar-email?token=${token}`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: 'Connect Skills <no-reply@connectskills.com>',
    to: email,
    subject: 'Confirmação de e-mail',
    html: `<p>Olá!</p><p>Confirme seu e-mail clicando no link abaixo:</p><a href="${link}">Verificar e-mail</a>`
  });
}

exports.criarUsuario = async (req, res) => {
  const { email, senha, tipo } = req.body;
  if (!email || !senha || !tipo) return res.status(400).send('Preencha todos os campos.');

  try {
    const usuarioExistente = await usuarioModel.buscarPorEmail(email);
    if (usuarioExistente) return res.status(400).send('Este e-mail já está cadastrado.');

    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    const resultado = await usuarioModel.cadastrar({ email, senha: senhaCriptografada, tipo });
    const usuario_id = resultado.id || resultado.insertId;

    await enviarEmailVerificacao(email, usuario_id);
    res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(email)}`);
  } catch (erro) {
    console.error('Erro ao criar usuário:', erro);
    res.status(500).send('Erro interno ao processar o cadastro.');
  }
};

exports.login = async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).send('Preencha todos os campos.');

  try {
    const usuario = await usuarioModel.buscarPorEmail(email);
    if (!usuario) return res.status(401).send('Usuário não encontrado.');

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.status(401).send('Senha incorreta.');

    if (usuario.tipo === 'empresa') {
      const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario.id);
      if (!empresa) return res.redirect('/login');

      req.session.empresa = {
        id: empresa.id,
        nome_empresa: empresa.nome_empresa,
        descricao: empresa.descricao,
        telefone: empresa.telefone,
        cidade: empresa.cidade,
        estado: empresa.estado,
        pais: empresa.pais,
        foto_perfil: empresa.foto_perfil,
      };

      return req.session.save(() => {
        res.redirect('/empresa/home');
      });

    } else if (usuario.tipo === 'candidato') {
      const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);
      if (!candidato) return res.redirect('/login');

      // Armazena sessão de candidato, não em req.session.usuario
      req.session.candidato = {
        id: candidato.id,
        nome: candidato.nome,
        sobrenome: candidato.sobrenome,
        email: candidato.email,
        tipo: 'candidato',
        telefone: candidato.telefone,
        data_nascimento: candidato.data_nascimento,
        foto_perfil: candidato.foto_perfil,
        localidade: `${candidato.cidade}, ${candidato.estado}, ${candidato.pais}`,
        areas: candidato.candidato_area?.map(rel => rel.area_interesse.nome) || []
      };

      return req.session.save(() => {
        // Redireciona para a rota correta dos candidatos
        res.redirect('/candidatos/home');
      });
    }
  } catch (err) {
    console.error('Erro ao realizar login:', err);
    res.status(500).send('Erro ao realizar login.');
  }
};

exports.verificarEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario_id = decoded.id;

    await usuarioModel.marcarEmailComoVerificado(usuario_id);
    const usuario = await usuarioModel.buscarPorId(usuario_id);
    if (!usuario) return res.status(404).send('Usuário não encontrado.');

    if (usuario.tipo === 'empresa') {
      res.redirect(`/empresa/nome-empresa?usuario_id=${usuario_id}`);
    } else {
      res.redirect(`/candidatos/cadastro/nome?usuario_id=${usuario_id}`);
    }
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    res.status(400).send('❌ Link inválido ou expirado.');
  }
};

exports.reenviarEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const usuario = await usuarioModel.buscarPorEmail(email);
    if (!usuario) return res.status(400).send('Usuário não encontrado.');
    if (usuario.email_verificado) return res.status(400).send('E-mail já foi verificado.');

    await enviarEmailVerificacao(email, usuario.id);
    res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(email)}&reenviado=true`);
  } catch (error) {
    console.error('Erro ao reenviar e-mail:', error);
    res.status(500).send('Erro ao reenviar e-mail.');
  }
};

exports.telaAguardandoVerificacao = (req, res) => {
  const { email, reenviado } = req.query;
  res.render('auth/aguardando-verificacao', { email, reenviado });
};
