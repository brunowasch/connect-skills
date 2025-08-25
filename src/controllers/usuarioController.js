const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function baseUrl() {
  const url = process.env.NODE_ENV === 'production'
    ? process.env.BASE_URL
    : 'http://localhost:3000';
  return url.endsWith('/') ? url.slice(0, -1) : url;
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
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#000000;">
        <p>Olá!</p>
        <p>Obrigado por se cadastrar no <strong>Connect Skills</strong>.</p>
        <p>Para continuar seu cadastro, é necessário confirmar o seu endereço de e-mail.</p>
        <p>Clique no botão abaixo para verificar seu e-mail:</p>
        <p style="margin: 16px 0;">
          <a href="${link}" target="_blank" rel="noopener noreferrer" style="
            display: inline-block;
            padding: 10px 20px;
            background-color: #0d6efd;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
          ">
            Verificar e-mail
          </a>
        </p>
        <p>Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.</p>
        <p>Atenciosamente,<br><strong>Equipe Connect Skills</strong></p>
      </div>
    `
  });
}

async function enviarEmailConfirmacaoAcao(email, usuario_id, tipo) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  const continuarToken = jwt.sign(
    { id: usuario_id, tipo, acao: 'continuar' },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
  const reiniciarToken = jwt.sign(
    { id: usuario_id, tipo, acao: 'reiniciar' },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  const continuarLink = `${baseUrl()}/usuarios/confirmar-cadastro?token=${continuarToken}`;
  const reiniciarLink = `${baseUrl()}/usuarios/confirmar-cadastro?token=${reiniciarToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#000000;">
      <p>Olá!</p>
      <p>Identificamos que você já possui um <strong>cadastro em andamento</strong> no Connect Skills (${tipo === 'candidato' ? 'Pessoa Física' : 'Pessoa Jurídica'}).</p>
      <p>Por segurança, confirme a ação que deseja realizar:</p>

      <div style="margin: 20px 0; flex-wrap: wrap; gap: 20px;">
        <a href="${continuarLink}" target="_blank" rel="noopener noreferrer" style="
          display: inline-block; 
          padding: 10px 16px; 
          border-radius: 6px; 
          background: #0d6efd; 
          color: #ffffff !important; 
          text-decoration: none; 
          font-weight: bold;
        ">
          Continuar cadastro
        </a>

        <a href="${reiniciarLink}" target="_blank" rel="noopener noreferrer" style="
          display: inline-block; 
          padding: 10px 16px; 
          border-radius: 6px; 
          background: #6c757d; 
          color: #ffffff !important; 
          text-decoration: none; 
          font-weight: bold;
        ">
          Reiniciar cadastro
        </a>
      </div>

      <p style="color:#555; font-size: 14px;">Esses links expiram em 2 horas. Caso não tenha solicitado, ignore este e-mail.</p>
      <p>Equipe Connect Skills</p>
    </div>
  `;

  await transporter.sendMail({
    from: 'Connect Skills <no-reply@connectskills.com>',
    to: email,
    subject: 'Confirme como deseja prosseguir com seu cadastro',
    html
  });
}

function isCandidatoIncompleto(c) {
  if (!c) return true;
  const faltandoNome = !c.nome || !c.sobrenome;
  const faltandoData = !c.data_nascimento;
  const faltandoLocal = !c.cidade || !c.pais;
  const faltandoTelefone = !c.telefone;
  const faltandoFoto = !c.foto_perfil || c.foto_perfil.trim() === '';
  const faltandoAreas = !c.candidato_area || c.candidato_area.length < 3;
  return (
    faltandoNome ||
    faltandoData ||
    faltandoLocal ||
    faltandoTelefone ||
    faltandoFoto ||
    faltandoAreas
  );
}

function isEmpresaIncompleto(e) {
  if (!e) return true;
  const faltandoNome = !e.nome_empresa;
  const faltandoLocal = !e.cidade || !e.pais;
  const faltandoTelefone = !e.telefone;
  const faltandoFoto = !e.foto_perfil || e.foto_perfil.trim() === '';
  return faltandoNome || faltandoLocal || faltandoTelefone || faltandoFoto;
}

async function redirecionarFluxoCandidato(usuarioId, res) {
  const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuarioId));

  if (!candidato) {
    return res.redirect(`/candidato/nome?usuario_id=${usuarioId}`);
  }

  if (!candidato.nome || !candidato.sobrenome) {
    return res.redirect(`/candidato/nome?usuario_id=${usuarioId}`);
  }

  if (!candidato.data_nascimento) {
    return res.redirect(`/candidato/data-nascimento?usuario_id=${usuarioId}`);
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

  if (!empresa || !empresa.nome_empresa) {
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

async function resetParcialCandidato(usuarioId) {
  await prisma.$transaction(async (tx) => {
    const cand = await tx.candidato.findUnique({
      where: { usuario_id: Number(usuarioId) },
      select: { id: true },
    });
    if (!cand) return;

    await tx.candidato_area.deleteMany({
      where: { candidato_id: cand.id }
    });

    await tx.candidato.delete({
      where: { usuario_id: Number(usuarioId) }
    });
  });
}

async function resetParcialEmpresa(usuarioId) {
  await prisma.$transaction(async (tx) => {
    const emp = await tx.empresa.findUnique({
      where: { usuario_id: Number(usuarioId) },
      select: { id: true },
    });
    if (!emp) return;

    const vagas = await tx.vaga.findMany({
      where: { empresa_id: emp.id },
      select: { id: true }
    });
    const vagaIds = vagas.map(v => v.id);

    if (vagaIds.length) {
      await tx.vaga_area.deleteMany({
        where: { vaga_id: { in: vagaIds } }
      });
      await tx.vaga_soft_skill.deleteMany({
        where: { vaga_id: { in: vagaIds } }
      });
      await tx.vaga.deleteMany({
        where: { id: { in: vagaIds } }
      });
    }

    await tx.empresa.delete({
      where: { usuario_id: Number(usuarioId) }
    });
  });
}

// === criarUsuario (ajustada) ===
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
      // E-mail já existe
      if (usuarioExistente.email_verificado) {
        const usuarioId = usuarioExistente.id;

        // Carrega perfis existentes
        const cand = await candidatoModel.obterCandidatoPorUsuarioId(usuarioId);
        const emp  = await empresaModel.obterEmpresaPorUsuarioId(usuarioId);
        const jaTemCandidato = !!cand;
        const jaTemEmpresa   = !!emp;

        // Se já existe QUALQUER perfil, congela tipo e bloqueia criar o outro
        if (jaTemCandidato || jaTemEmpresa) {
          const tipoAtual = jaTemCandidato ? 'candidato' : 'empresa';

          if (tipo !== tipoAtual) {
            // Conflito de tipo — mostra modal e envia e-mail de confirmação de ação
            await enviarEmailConfirmacaoAcao(emailNormalizado, usuarioId, tipoAtual);
            return res.status(200).render('auth/cadastro', {
              erro: `Este e-mail já possui um perfil do tipo ${tipoAtual}. Para mudar, exclua o perfil atual antes.`,
              emailPrefill: emailNormalizado,
              showResumeModal: true,
              pendingUserId: usuarioId,
              tipo: tipoAtual
            });
          }

          // Mesmo tipo: se incompleto, abre modal + envia e-mail; se completo, mostra aviso com link de login
          const incompleto = (tipoAtual === 'candidato')
            ? isCandidatoIncompleto(cand)
            : isEmpresaIncompleto(emp);

          if (incompleto) {
            // Envia e-mail de confirmação de ação (continuar/reiniciar)
            await enviarEmailConfirmacaoAcao(emailNormalizado, usuarioId, tipoAtual);

            return res.status(200).render('auth/cadastro', {
              erro: null,
              emailPrefill: emailNormalizado,
              showResumeModal: true,
              pendingUserId: usuarioId,
              tipo: tipoAtual
            });
          }

          // Cadastro COMPLETO - renderiza a própria tela de cadastro com aviso + link de login
          return res.status(200).render('auth/cadastro', {
            erro: 'Já existe uma conta com este e-mail. <a href="/login" class="text-primary">Clique aqui para fazer login</a>.',
            emailPrefill: emailNormalizado,
            showResumeModal: false,
            pendingUserId: null,
            tipo: tipoAtual
          });
        }

        // NÃO tem perfil ainda -> agora pode fixar o tipo (uma única vez)
        if (usuarioExistente.tipo !== tipo) {
          await usuarioModel.atualizarUsuario(usuarioId, { tipo });
        }

        // Primeiro perfil do tipo selecionado — mostra modal e também manda e-mail de confirmação de ação
        await enviarEmailConfirmacaoAcao(emailNormalizado, usuarioId, tipo);

        return res.status(200).render('auth/cadastro', {
          erro: null,
          emailPrefill: emailNormalizado,
          showResumeModal: true,
          pendingUserId: usuarioId,
          tipo
        });
      }

      // E-mail existe, mas ainda não verificado -> atualiza senha/tipo e reenvia verificação padrão
      const salt = await bcrypt.genSalt(10);
      const senhaCriptografada = await bcrypt.hash(senha, salt);

      await usuarioModel.atualizarUsuario(usuarioExistente.id, { senha: senhaCriptografada, tipo });
      await enviarEmailVerificacao(emailNormalizado, usuarioExistente.id);

      return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(emailNormalizado)}`);
    }

    // Usuário novo
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

    if (!usuario.email_verificado) {
      // Mantém experiência: leva para a tela que orienta a verificar o e-mail, com opção de reenviar
      return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(usuario.email)}`);
    }

    if (usuario.tipo === 'empresa') {
      const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario.id);

      if (!empresa || isEmpresaIncompleto(empresa)) {
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

      const destino = req.session.returnTo || '/empresa/home';
      delete req.session.returnTo;
      return req.session.save(() => res.redirect(destino));
    }

    if (usuario.tipo === 'candidato') {
      const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);

      if (!candidato || isCandidatoIncompleto(candidato)) {
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

      const destino = req.session.returnTo || '/candidatos/home';
      delete req.session.returnTo;
      return req.session.save(() => res.redirect(destino));
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
        <p>Recebemos uma solicitação de redefinição de senha para sua conta no <strong>Connect Skills</strong>.</p>
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

exports.continuarCadastro = async (req, res) => {
  const { usuario_id, tipo } = req.query;
  if (!usuario_id || !tipo) return res.redirect('/cadastro');

  try {
    const usuario = await usuarioModel.buscarPorId(Number(usuario_id));
    if (!usuario) return res.redirect('/cadastro');

    if (!usuario.email_verificado) {
      return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(usuario.email)}`);
    }

    if (tipo === 'candidato') return redirecionarFluxoCandidato(Number(usuario_id), res);
    if (tipo === 'empresa')   return redirecionarFluxoEmpresa(Number(usuario_id), res);
    return res.redirect('/cadastro');
  } catch (err) {
    console.error('Erro ao continuar cadastro:', err);
    req.session.erro = 'Não foi possível continuar o cadastro.';
    return res.redirect('/cadastro');
  }
};

exports.reiniciarCadastro = async (req, res) => {
  const { usuario_id, tipo } = req.query;
  if (!usuario_id || !tipo) return res.redirect('/cadastro');

  try {
    const usuario = await usuarioModel.buscarPorId(Number(usuario_id));
    if (!usuario) return res.redirect('/cadastro');

    // 🚫 Bloqueio: precisa verificar o e-mail antes de reiniciar
    if (!usuario.email_verificado) {
      return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(usuario.email)}`);
    }

    delete req.session.candidato;
    delete req.session.empresa;

    if (tipo === 'candidato') {
      await resetParcialCandidato(Number(usuario_id));
      return res.redirect(`/candidato/nome?usuario_id=${Number(usuario_id)}&restart=1`);
    }
    if (tipo === 'empresa') {
      await resetParcialEmpresa(Number(usuario_id));
      return res.redirect(`/empresa/nome-empresa?usuario_id=${Number(usuario_id)}&restart=1`);
    }

    return res.redirect('/cadastro');
  } catch (err) {
    console.error('Erro ao reiniciar cadastro:', err);
    req.session.erro = 'Não foi possível reiniciar o cadastro.';
    return res.redirect('/cadastro');
  }
};

exports.confirmarAcaoCadastro = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.session.erro = 'Token não fornecido.';
    return res.redirect('/cadastro');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario_id = Number(decoded.id);
    const tipo = decoded.tipo;
    const acao = decoded.acao; // 'continuar' | 'reiniciar'

    if (!usuario_id || !tipo || !acao) {
      req.session.erro = 'Dados do token incompletos.';
      return res.redirect('/cadastro');
    }

    // Segurança extra: valida se o usuário existe e está verificado
    const usuario = await usuarioModel.buscarPorId(usuario_id);
    if (!usuario || !usuario.email_verificado) {
      req.session.erro = 'Ação não permitida para esta conta.';
      return res.redirect('/cadastro');
    }

    if (acao === 'continuar') {
      if (tipo === 'candidato') return redirecionarFluxoCandidato(usuario_id, res);
      if (tipo === 'empresa')   return redirecionarFluxoEmpresa(usuario_id, res);
    }

    if (acao === 'reiniciar') {
      // Limpa sessão
      delete req.session.candidato;
      delete req.session.empresa;

      if (tipo === 'candidato') {
        await resetParcialCandidato(usuario_id);
        return res.redirect(`/candidato/nome?usuario_id=${usuario_id}&restart=1`);
      }
      if (tipo === 'empresa') {
        await resetParcialEmpresa(usuario_id);
        return res.redirect(`/empresa/nome-empresa?usuario_id=${usuario_id}&restart=1`);
      }
    }

    req.session.erro = 'Ação inválida.';
    return res.redirect('/cadastro');
  } catch (error) {
    console.error('Erro ao confirmar ação do cadastro via e-mail:', error);
    req.session.erro = 'Link inválido ou expirado.';
    return res.redirect('/cadastro');
  }
};
