const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function enviarEmailVerificacao(email, usuario_id) {
  const token = jwt.sign({ id: usuario_id }, process.env.JWT_SECRET, { expiresIn: '1d' });

  // Verificar se estamos em desenvolvimento ou produção
  const BASE_URL = process.env.NODE_ENV === 'production' 
    ? process.env.BASE_URL  // Quando em produção, pega a URL configurada na plataforma
    : 'http://localhost:3000';  // URL local de desenvolvimento

  const link = `${BASE_URL}/usuarios/verificar-email?token=${token}`;

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
    html: `
        <p>Olá!</p>
        <p>Obrigado por se cadastrar no <strong>Connect Skills</strong>.</p>
        <p>Para continuar seu cadastro, é necessário confirmar o seu endereço de e-mail.</p>
        <p>Clique no botão abaixo para verificar seu e-mail:</p>
        <p style="margin: 16px 0;">
          <a href="${link}" target="_blank" rel="noopener noreferrer" style="
            display: inline-block;
            padding: 10px 20px;
            background-color: #0d6efd;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
          ">
            Verificar e-mail
          </a>
        </p>
        <p>Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.</p>
        <p>Atenciosamente,<br><strong>Equipe Connect Skills</strong></p>
      `
  });
}


exports.criarUsuario = async (req, res) => {
  let { email, senha, tipo } = req.body;
  if (!email || !senha || !tipo) return res.status(400).send('Preencha todos os campos.');

  const emailNormalizado = email.trim().toLowerCase();

  try {
    const usuarioExistente = await usuarioModel.buscarPorEmail(emailNormalizado);

    if (usuarioExistente && usuarioExistente.email_verificado) {
      return res.status(400).send('Este e-mail já está cadastrado e verificado.');
    }

    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    let usuario_id;

    if (usuarioExistente && !usuarioExistente.email_verificado) {
      await usuarioModel.atualizarUsuario(usuarioExistente.id, {
        senha: senhaCriptografada,
        tipo
      });
      usuario_id = usuarioExistente.id;
    } else {
      const resultado = await usuarioModel.cadastrar({
        email: emailNormalizado,
        senha: senhaCriptografada,
        tipo
      });
      usuario_id = resultado.id || resultado.insertId;
    }

    await enviarEmailVerificacao(emailNormalizado, usuario_id);
    res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(emailNormalizado)}`);
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
      usuario_id: usuario.id,
      nome_empresa: empresa.nome_empresa,
      descricao: empresa.descricao,
      telefone: empresa.telefone,
      cidade: empresa.cidade,
      estado: empresa.estado,
      pais: empresa.pais,
      foto_perfil: empresa.foto_perfil || '/img/placeholder-empresa.png',
      email: usuario.email
    };

    // 🔧 Adicione esta parte:
    req.session.usuario = {
      id: usuario.id,
      tipo: 'empresa',
      nome: empresa.nome_empresa,
      email: usuario.email
    };

    return req.session.save(() => {
      res.redirect('/empresa/home');
  });
} else if (usuario.tipo === 'candidato') {
      const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);
      if (!candidato) return res.redirect('/login');

if (candidato) {
  req.session.candidato = {
    id: candidato.id,
    usuario_id: usuario.id,
    nome: candidato.nome,
    sobrenome: candidato.sobrenome,
    email: usuario.email,
    tipo: 'candidato',
    telefone: candidato.telefone,
    dataNascimento: candidato.data_nascimento,
    foto_perfil: candidato.foto_perfil,
    localidade: `${candidato.cidade}, ${candidato.estado}, ${candidato.pais}`,
    areas: candidato.candidato_area?.map(r => r.area_interesse.nome) || []
  };

  req.session.usuario = {
    id: usuario.id,
    tipo: 'candidato',
    nome: candidato.nome,
    sobrenome: candidato.sobrenome
  };

  return req.session.save(() => {
    res.redirect('/candidatos/home');
  });
}


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

    res.redirect(`/usuarios/email-verificado?usuario_id=${usuario_id}&tipo=${usuario.tipo}`);
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    res.status(400).send('Link inválido ou expirado.');
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

exports.telaEmailVerificado = (req, res) => {
  res.render('auth/email-verificado');
};

exports.statusVerificacao = async (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).json({ erro: 'E-mail não informado' });

  try {
    const usuario = await usuarioModel.buscarPorEmail(email);
    if (!usuario) return res.status(404).json({ verificado: false });

    if (usuario.email_verificado) {
      return res.json({
        verificado: true,
        usuario_id: usuario.id,
        tipo: usuario.tipo
      });
    }

    res.json({ verificado: false });
  } catch (erro) {
    console.error('Erro ao verificar status de verificação:', erro);
    res.status(500).json({ erro: 'Erro interno' });
  }
};

exports.recuperarSenha = async (req, res) => {
  const { email } = req.body;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (!usuario) {
      req.session.erro = 'E-mail não encontrado. Verifique se digitou corretamente.';
      return res.redirect('/usuarios/recuperar-senha');
    }

    const token = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const resetLink = `http://localhost:3000/usuarios/redefinir-senha?token=${token}`;

    await transporter.sendMail({
      from: 'Connect Skills <no-reply@connectskills.com>',
      to: email,
      subject: 'Recuperação de senha',
      html: `
        <p>Olá,</p>
        <p>
          Recebemos uma solicitação de redefinição de senha para sua conta no 
          <strong style="color: #6a1b9a;">Connect Skills</strong>.
        </p>
        <p>Clique no botão abaixo para escolher uma nova senha:</p>
        <p style="margin: 16px 0;">
          <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="
            display: inline-block;
            padding: 10px 20px;
            background-color: #0d6efd;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
          ">
            Redefinir senha
          </a>
        </p>
        <p>Se você não solicitou essa recuperação, ignore este e-mail.</p>
        <p>Equipe Connect Skills</p>
      `
    });

    req.session.sucesso = 'Enviamos um link de recuperação para seu e-mail!';
    return res.redirect('/usuarios/recuperar-senha');
  } catch (error) {
    console.error('Erro ao enviar email de recuperação:', error);
    req.session.erro = 'Erro ao enviar o e-mail de recuperação. Tente novamente.';
    return res.redirect('/usuarios/recuperar-senha');
  }
};

exports.telaRedefinirSenha = (req, res) => {
  const { token } = req.query || req.params;
  if (!token) return res.status(400).send('Token não fornecido.');
  res.render('auth/redefinir-senha', { token, erro: null });
};

exports.telaRecuperarSenha = (req, res) => {
  res.render('auth/recuperar-senha');
};

exports.redefinirSenha = async (req, res) => {
  const { token, novaSenha } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioId = decoded.id;

    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(novaSenha, salt);

    await usuarioModel.atualizarUsuario(usuarioId, {
      senha: senhaCriptografada
    });

    res.render('auth/redefinicao-sucesso');
  } catch (erro) {
    console.error('Erro ao redefinir senha:', erro);
    res.status(400).send('Token inválido ou expirado.');
  }
};

const exibirFormularioRedefinirSenha = async (req, res) => {
  const { token } = req.params;

  // (opcional) você pode verificar se o token é válido aqui antes de renderizar
  return res.render("redefinicao-sucesso", { token }); // ou redefinir-senha se você tiver uma view separada
};