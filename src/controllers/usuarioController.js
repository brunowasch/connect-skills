const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** Utilidades */
function baseUrl() {
  return process.env.NODE_ENV === 'production'
    ? process.env.BASE_URL
    : 'http://localhost:3000';
}

async function enviarEmailVerificacao(email, usuario_id) {
  const token = jwt.sign({ id: usuario_id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const link = `${baseUrl()}/usuarios/verificar-email?token=${token}`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
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

async function redirecionarFluxoCandidato(usuarioId, res) {
  const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuarioId));

  if (!candidato) {
    return res.redirect(`/candidato/nome?usuario_id=${usuarioId}`);
  }

  if (!candidato.cidade || !candidato.pais) {
    return res.redirect(`/candidato/localizacao?usuario_id=${usuarioId}`);
  }

  if (!candidato.telefone) {
    return res.redirect(`/candidato/telefone?usuario_id=${usuarioId}`);
  }

  if (!candidato.foto_perfil || candidato.foto_perfil.trim() === '') {
    return res.redirect(`/candidato/cadastro/foto-perfil?usuario_id=${usuarioId}`);
  }

  const areasQtd = (candidato.candidato_area || []).length;
  if (areasQtd !== 3) {
    return res.redirect(`/candidato/cadastro/areas?usuario_id=${usuarioId}`);
  }

  return res.redirect('/candidatos/home');
}

async function redirecionarFluxoEmpresa(usuarioId, res) {
  const empresa = await empresaModel.obterEmpresaPorUsuarioId(Number(usuarioId));

  if (!empresa) {
    return res.redirect(`/empresa/nome-empresa?usuario_id=${usuarioId}`);
  }

  if (!empresa.cidade || !empresa.pais) {
    return res.redirect(`/empresa/localizacao?usuario_id=${usuarioId}`);
  }

  if (!empresa.telefone) {
    return res.redirect(`/empresa/telefone?usuario_id=${usuarioId}`);
  }

  if (!empresa.foto_perfil || empresa.foto_perfil.trim() === '') {
    return res.redirect(`/empresas/foto-perfil?usuario_id=${usuarioId}`);
  }

  return res.redirect('/empresa/home');
}

/** ROTAS */
exports.criarUsuario = async (req, res) => {
  let { email, senha, tipo } = req.body;
  if (!email || !senha || !tipo) {
    req.session.erro = 'Preencha todos os campos.';
    return res.redirect('/cadastro');
  }

  const emailNormalizado = email.trim().toLowerCase();

  try {
    const usuarioExistente = await usuarioModel.buscarPorEmail(emailNormalizado);

    if (usuarioExistente) {
      if (usuarioExistente.email_verificado) {
        const usuarioId = usuarioExistente.id;

        if (usuarioExistente.tipo !== tipo) {
          await usuarioModel.atualizarUsuario(usuarioId, { tipo });
        }

        const perfilCandidato = await candidatoModel.obterCandidatoPorUsuarioId(usuarioId);
        const perfilEmpresa   = await empresaModel.obterEmpresaPorUsuarioId(usuarioId);

        const semPerfil =
          (tipo === 'candidato' && !perfilCandidato) ||
          (tipo === 'empresa'   && !perfilEmpresa);

        if (semPerfil) {
          return res.status(200).render('auth/cadastro', {
            erro: null,
            emailPrefill: emailNormalizado,
            showResumeModal: true,
            pendingUserId: usuarioId,
            email: usuarioExistente.email
          });
        }

        req.session.usuario = { id: usuarioId, tipo, email: emailNormalizado };
        if (tipo === 'candidato') {
          return redirecionarFluxoCandidato(usuarioId, res);
        } else {
          return redirecionarFluxoEmpresa(usuarioId, res);
        }
      }

      const salt = await bcrypt.genSalt(10);
      const senhaCriptografada = await bcrypt.hash(senha, salt);

      await usuarioModel.atualizarUsuario(usuarioExistente.id, { senha: senhaCriptografada, tipo });
      await enviarEmailVerificacao(emailNormalizado, usuarioExistente.id);

      return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(emailNormalizado)}`);
    }

    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    const resultado = await usuarioModel.cadastrar({
      email: emailNormalizado,
      senha: senhaCriptografada,
      tipo
    });

    const usuario_id = resultado.id || resultado.insertId;

    await enviarEmailVerificacao(emailNormalizado, usuario_id);
    return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(emailNormalizado)}`);

  } catch (erro) {
    console.error('Erro ao criar usuário:', erro);
    req.session.erro = 'Erro interno ao processar o cadastro.';
    return res.redirect('/cadastro');
  }
};


exports.login = async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    req.session.erro = 'Preencha todos os campos.';
    return res.redirect('/login');
  }

  try {
    const emailNormalizado = email.trim().toLowerCase();
    const usuario = await usuarioModel.buscarPorEmail(emailNormalizado);
    if (!usuario) {
      req.session.erro = 'Usuário não encontrado.';
      return res.redirect('/login');
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) {
      req.session.erro = 'Senha incorreta.';
      return res.redirect('/login');
    }

    if (usuario.tipo === 'empresa') {
      const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario.id);

      if (!empresa) {
        return redirecionarFluxoEmpresa(usuario.id, res);
      }

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
      req.session.usuario = { id: usuario.id, tipo: 'empresa', nome: empresa.nome_empresa, email: usuario.email };

      return req.session.save(() => res.redirect('/empresa/home'));
    }

    if (usuario.tipo === 'candidato') {
      const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);

      if (!candidato) {
        return redirecionarFluxoCandidato(usuario.id, res);
      }

      if (!candidato.cidade || !candidato.pais || !candidato.telefone || !candidato.foto_perfil
        || (candidato.candidato_area || []).length !== 3) {
        return redirecionarFluxoCandidato(usuario.id, res);
      }

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
      req.session.usuario = { id: usuario.id, tipo: 'candidato', nome: candidato.nome, sobrenome: candidato.sobrenome };

      return req.session.save(() => res.redirect('/candidatos/home'));
    }

    return res.redirect('/cadastro');

  } catch (err) {
    console.error('Erro ao realizar login:', err);
    req.session.erro = 'Erro ao realizar login.';
    return res.redirect('/login');
  }
};

exports.verificarEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario_id = decoded.id;

    await usuarioModel.marcarEmailComoVerificado(usuario_id);
    const usuario = await usuarioModel.buscarPorId(usuario_id);
    if (!usuario) {
      req.session.erro = 'Usuário não encontrado.';
      return res.redirect('/login');
    }

    return res.redirect(`/usuarios/email-verificado?usuario_id=${usuario_id}&tipo=${usuario.tipo}`);
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    req.session.erro = 'Link inválido ou expirado.';
    return res.redirect('/login');
  }
};

exports.reenviarEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const usuario = await usuarioModel.buscarPorEmail(email);
    if (!usuario) {
      req.session.erro = 'Usuário não encontrado.';
      return res.redirect('/login');
    }
    if (usuario.email_verificado) {
      req.session.sucesso = 'E-mail já verificado.';
      return res.redirect('/login');
    }

    await enviarEmailVerificacao(email, usuario.id);
    return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(email)}&reenviado=true`);
  } catch (error) {
    console.error('Erro ao reenviar e-mail:', error);
    req.session.erro = 'Erro ao reenviar e-mail.';
    return res.redirect('/login');
  }
};

exports.telaAguardandoVerificacao = (req, res) => {
  const { email, reenviado } = req.query;
  return res.render('auth/aguardando-verificacao', { email, reenviado });
};

exports.telaEmailVerificado = (req, res) => {
  return res.render('auth/email-verificado');
};

exports.statusVerificacao = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ erro: 'E-mail não informado' });

  try {
    const usuario = await usuarioModel.buscarPorEmail(email);
    if (!usuario) return res.status(404).json({ verificado: false });

    if (usuario.email_verificado) {
      return res.json({ verificado: true, usuario_id: usuario.id, tipo: usuario.tipo });
    }
    return res.json({ verificado: false });
  } catch (erro) {
    console.error('Erro ao verificar status de verificação:', erro);
    return res.status(500).json({ erro: 'Erro interno' });
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
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    const resetLink = `${baseUrl()}/usuarios/redefinir-senha?token=${token}`;

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
  if (!token) {
    req.session.erro = 'Token não fornecido.';
    return res.redirect('/usuarios/recuperar-senha');
  }
  return res.render('auth/redefinir-senha', { token, erro: null });
};

exports.telaRecuperarSenha = (req, res) => {
  return res.render('auth/recuperar-senha');
};

exports.redefinirSenha = async (req, res) => {
  const { token, novaSenha } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioId = decoded.id;

    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(novaSenha, salt);

    await usuarioModel.atualizarUsuario(usuarioId, { senha: senhaCriptografada });
    return res.render('auth/redefinicao-sucesso');
  } catch (erro) {
    console.error('Erro ao redefinir senha:', erro);
    req.session.erro = 'Token inválido ou expirado.';
    return res.redirect('/usuarios/recuperar-senha');
  }
};
