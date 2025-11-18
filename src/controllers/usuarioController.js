const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { encodeId, decodeId } = require('../utils/idEncoder');

const fromAddress =
  process.env.EMAIL_FROM ||
  (process.env.SMTP_USER
    ? `Connect Skills <${process.env.SMTP_USER}>`
    : 'Connect Skills <no-reply@connectskills.com.br>');

function createTransporter() {
  const host = process.env.SMTP_HOST || 'mail.connectskills.com.br';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function baseUrl() {
  const isProd = process.env.NODE_ENV === 'production';
  const url = process.env.BASE_URL || (isProd ? 'https://connectskills.com.br' : 'http://localhost:3000');
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function skipFlagAtivo(req) {
  return Boolean(req.session?.usuario?.skipCadastro) || req.cookies?.cs_skipCadastro === '1';
}

async function enviarEmailVerificacao(email, usuario_id) {
  const token = jwt.sign({ id: usuario_id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const link = `${baseUrl()}/usuarios/verificar-email?token=${token}`;

  const transporter = createTransporter();

  await transporter.sendMail({
    from: fromAddress,
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
            font-weight: bold;">
            Verificar e-mail
          </a>
        </p>
        <p>Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.</p>
        <p>Atenciosamente,<br><strong>Equipe Connect Skills</strong></p>
      </div>
    `,
  });
}

async function enviarEmailConfirmacaoAcao(email, usuario_id, tipo) {
  const transporter = createTransporter();

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
          font-weight: bold;">
          Continuar cadastro
        </a>
        <a href="${reiniciarLink}" target="_blank" rel="noopener noreferrer" style="
          display: inline-block;
          padding: 10px 16px;
          border-radius: 6px;
          background: #6c757d;
          color: #ffffff !important;
          text-decoration: none;
          font-weight: bold;">
          Reiniciar cadastro
        </a>
      </div>
      <p style="color:#555; font-size: 14px;">Esses links expiram em 2 horas. Caso não tenha solicitado, ignore este e-mail.</p>
      <p>Equipe Connect Skills</p>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
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
    return res.redirect(`/candidatos/cadastro/nome`);
  }
  if (!candidato.nome || !candidato.sobrenome) {
    return res.redirect(`/candidatos/cadastro/nome`);
  }
  if (!candidato.data_nascimento) {
    return res.redirect(`/candidatos/data-nascimento`);
  }
  if (!candidato.cidade || !candidato.pais) {
    return res.redirect(`/candidatos/localizacao`);
  }
  if (!candidato.telefone) {
    return res.redirect(`/candidatos/telefone`);
  }
  if (!candidato.foto_perfil || candidato.foto_perfil.trim() === '') {
    return res.redirect(`/candidatos/cadastro/foto-perfil`);
  }
  const areasQtd = (candidato.candidato_area || []).length;
  if (areasQtd !== 3) {
    return res.redirect(`/candidatos/cadastro/areas`);
  }
  return res.redirect('/candidatos/home');
}

async function redirecionarFluxoEmpresa(usuarioId, res) {
  const empresa = await empresaModel.obterEmpresaPorUsuarioId(Number(usuarioId));

  if (!empresa || !empresa.nome_empresa) {
    return res.redirect(`/empresas/nome-empresa`);
  }
  if (!empresa.cidade || !empresa.pais) {
    return res.redirect(`/empresas/localizacao`);
  }
  if (!empresa.telefone) {
    return res.redirect(`/empresas/telefone`);
  }
  if (!empresa.foto_perfil || empresa.foto_perfil.trim() === '') {
    return res.redirect(`/empresas/foto-perfil`);
  }
  return res.redirect('/empresas/home');
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
// ... (lógica de reset de empresa)
    await tx.empresa.delete({
      where: { usuario_id: Number(usuarioId) }
    });
  });
}

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

        const cand = await candidatoModel.obterCandidatoPorUsuarioId(usuarioId);
        const emp  = await empresaModel.obterEmpresaPorUsuarioId(usuarioId);
        const jaTemCandidato = !!cand;
        const jaTemEmpresa   = !!emp;

        if (jaTemCandidato || jaTemEmpresa) {
          const tipoAtual = jaTemCandidato ? 'candidato' : 'empresa';

          if (tipo !== tipoAtual) {
            await enviarEmailConfirmacaoAcao(emailNormalizado, usuarioId, tipoAtual);
            return res.status(200).render('auth/cadastro', {
              erro: `Este e-mail já possui um perfil do tipo ${tipoAtual}. Para mudar, exclua o perfil atual antes.`,
              emailPrefill: emailNormalizado,
              showResumeModal: true,
              pendingUserId: usuarioId,
              tipo: tipoAtual
            });
          }

          const incompleto = (tipoAtual === 'candidato')
            ? isCandidatoIncompleto(cand)
            : isEmpresaIncompleto(emp);

          if (incompleto) {
            await enviarEmailConfirmacaoAcao(emailNormalizado, usuarioId, tipoAtual);
            return res.status(200).render('auth/cadastro', {
              erro: null,
              emailPrefill: emailNormalizado,
              showResumeModal: true,
              pendingUserId: usuarioId,
              tipo: tipoAtual
            });
          }

          return res.status(200).render('auth/cadastro', {
            erro: 'Já existe uma conta com este e-mail. <a href="/login" class="text-primary">Clique aqui para fazer login</a>.',
            emailPrefill: emailNormalizado,
            showResumeModal: false,
            pendingUserId: null,
            tipo: tipoAtual
          });
        }

        if (usuarioExistente.tipo !== tipo) {
          await usuarioModel.atualizarUsuario(usuarioId, { tipo });
        }

        await enviarEmailConfirmacaoAcao(emailNormalizado, usuarioId, tipo);

        return res.status(200).render('auth/cadastro', {
          erro: null,
          emailPrefill: emailNormalizado,
          showResumeModal: true,
          pendingUserId: usuarioId,
          tipo
        });
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

    req.session.emailParaVerificacao = emailNormalizado;
    return res.redirect(`/usuarios/aguardando-verificacao`);

  } catch (erro) {
    console.error('Erro ao criar usuário:', erro);
    req.session.erro = 'Erro interno ao processar o cadastro.';
    return res.redirect('/cadastro');
  }
};

exports.login = async (req, res) => {
  const { email, senha, remember } = req.body;
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
      req.session.emailParaVerificacao = usuario.email;
      return res.redirect(`/usuarios/aguardando-verificacao`);
    }

    req.session.regenerate(async (err) => {
      if (err) {
        console.error('Erro ao regenerar sessão:', err);
        req.session.erro = 'Erro ao iniciar sessão.';
        return res.redirect('/login');
      }

      const keep = remember === 'on';
      req.session.remember = keep;

      if (remember === 'on') {
        const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
        req.session.cookie.maxAge = THIRTY_DAYS;
        req.session.cookie.expires = new Date(Date.now() + THIRTY_DAYS);
      } else {
        if ('maxAge' in req.session.cookie) delete req.session.cookie.maxAge;
        req.session.cookie.expires = undefined;
      }

      if (usuario.tipo === 'empresa') {
        const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario.id);

        req.session.empresa = {
          id: empresa?.id ?? null,
          usuario_id: usuario.id,
          nome_empresa: empresa?.nome_empresa || '',
          descricao: empresa?.descricao || '',
          telefone: empresa?.telefone || '',
          cidade: empresa?.cidade || '',
          estado: empresa?.estado || '',
          pais: empresa?.pais || '',
          // A foto é salva como a URL real, ou uma string vazia se não existir.
          foto_perfil: (empresa?.foto_perfil && String(empresa.foto_perfil).trim() !== '')
            ? empresa.foto_perfil
            : '', // Salva como string vazia
          email: usuario.email
        };

        req.session.usuario = {
          id: usuario.id,
          tipo: 'empresa',
          nome: empresa?.nome_empresa || '',
          email: usuario.email,
          skipCadastro: false,
        };
        
        if (!empresa || isEmpresaIncompleto(empresa)) {
          return redirecionarFluxoEmpresa(usuario.id, res);
        }

        const destino = req.session.returnTo || '/empresas/home';
        delete req.session.returnTo;
        return req.session.save(() => res.redirect(destino));
      }

      if (usuario.tipo === 'candidato') {
        // (Lógica do candidato que já corrigimos)
        const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);
        const localidade = [candidato?.cidade, candidato?.estado, candidato?.pais]
          .filter(Boolean).join(', ');

        req.session.candidato = {
          id: candidato?.id ?? null,
          usuario_id: usuario.id,
          nome: candidato?.nome || '',
          sobrenome: candidato?.sobrenome || '',
          email: usuario.email,
          tipo: 'candidato',
          telefone: candidato?.telefone || '',
          dataNascimento: candidato?.data_nascimento || null,
          foto_perfil: candidato?.foto_perfil || '',
          localidade,
          areas: candidato?.candidato_area?.map(r => r.area_interesse.nome) || []
        };
        req.session.usuario = {
          id: usuario.id,
          tipo: 'candidato',
          nome: candidato?.nome || '',
          sobrenome: candidato?.sobrenome || '',
          skipCadastro: false,
        };

        if (!candidato || isCandidatoIncompleto(candidato)) {
          return redirecionarFluxoCandidato(usuario.id, res);
        }

        const destino = req.session.returnTo || '/candidatos/home';
        delete req.session.returnTo;
        return req.session.save(() => res.redirect(destino));
      }

      return res.redirect('/cadastro');
    });

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
        throw new Error("Usuário não encontrado após verificação.");
    }
    return res.redirect(`/usuarios/email-verificado?uid=${usuario.id}&tipo=${usuario.tipo}`);

  } catch (error) {
    console.error('Erro ao verificar token:', error);
    req.session.erro = 'Link inválido ou expirado.';
    return res.redirect('/login'); 
  }
};

exports.reenviarEmail = async (req, res) => {
// ... (Nenhuma alteração nesta função)
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
  const email = req.session.emailParaVerificacao;
  const reenviado = req.query.reenviado || null;

  if (!email) {
    return res.redirect('/login');
  }

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
        req.session.regenerate(async (err) => {
            if (err) {
                console.error('Erro ao regenerar sessão no status:', err);
                return res.status(500).json({ erro: 'Erro de sessão' });
            }
            
            req.session.remember = false;
            req.session.cookie.expires = undefined;

            let redirectTo = '/'; 

            if (usuario.tipo === 'candidato') {
                const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);
                
                const localidade = [candidato?.cidade, candidato?.estado, candidato?.pais]
                    .filter(Boolean).join(', ');

                req.session.candidato = {
                  id: candidato?.id ?? null,
                  usuario_id: usuario.id,
                  nome: candidato?.nome || '',
                  sobrenome: candidato?.sobrenome || '',
                  email: usuario.email,
                  tipo: 'candidato',
                  telefone: candidato?.telefone || '',
                  dataNascimento: candidato?.data_nascimento || null,
                  foto_perfil: candidato?.foto_perfil || '',
                  localidade,
                  areas: candidato?.candidato_area?.map(r => r.area_interesse.nome) || []
                };

                req.session.usuario = {
                  id: usuario.id,
                  tipo: 'candidato',
                  nome: candidato?.nome || '',
                  sobrenome: candidato?.sobrenome || '',
                  skipCadastro: false,
                };
                
                if (!candidato || isCandidatoIncompleto(candidato)) {
                   redirectTo = '/candidatos/cadastro/nome';
                } else {
                   redirectTo = '/candidatos/home';
                }

            } else if (usuario.tipo === 'empresa') {
                const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario.id);

                req.session.empresa = {
                  id: empresa?.id ?? null,
                  usuario_id: usuario.id,
                   nome_empresa: empresa?.nome_empresa || '',
                  email: usuario.email
                };

                req.session.usuario = {
                  id: usuario.id,
                  tipo: 'empresa',
                  nome: empresa?.nome_empresa || '',
                  email: usuario.email,
                  skipCadastro: false,
              };
                
                if (!empresa || isEmpresaIncompleto(empresa)) {
                    redirectTo = '/empresas/nome-empresa';
                } else {
                    redirectTo = '/empresas/home';
               }
            }

            // O 'usuario.email' vem da busca no banco de dados.
            req.session.emailParaVerificacao = usuario.email; 

            req.session.save((err) => {
                if(err) return res.status(500).json({ erro: 'Erro ao salvar sessão' });
                
                return res.json({
                    verificado: true,
                    redirectTo: redirectTo 
                });
            });
        });
        
        return;
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
    const transporter = createTransporter();
    const resetLink = `${baseUrl()}/usuarios/redefinir-senha?token=${token}`;
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Recuperação de senha',
      html: `...` // (conteúdo do email)
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
// ... (Nenhuma alteração nesta função)
  const { token } = req.query || req.params;
  if (!token) {
    req.session.erro = 'Token não fornecido.';
    return res.redirect('/usuarios/recuperar-senha');
  }
  return res.render('auth/redefinir-senha', { token, erro: null });
};

exports.telaRecuperarSenha = (req, res) => {
// ... (Nenhuma alteração nesta função)
  return res.render('auth/recuperar-senha');
};

exports.redefinirSenha = async (req, res) => {
// ... (Nenhuma alteração nesta função)
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
  const usuario_id = req.session?.usuario?.id;

  if (!usuario_id) {
    // Se não há sessão, não há o que "continuar".
    req.session.erro = 'Faça login para continuar.';
    return res.redirect('/login');
  }

  try {
    const usuario = await usuarioModel.buscarPorId(Number(usuario_id));
    if (!usuario) {
      req.session.erro = 'Usuário da sessão não encontrado.';
      req.session.destroy(); // Limpa a sessão inválida
      return res.redirect('/login');
    }

    // (O restante da sua lógica estava correto, agora é seguro)
    if (!usuario.email_verificado) {
      return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(usuario.email)}`);
    }

    const tipoEfetivo = usuario.tipo; // Pega o tipo do usuário seguro

    if (skipFlagAtivo(req)) {
      return res.redirect(tipoEfetivo === 'empresa' ? '/empresas/home' : '/candidatos/home');
    }

    if (tipoEfetivo === 'candidato') return redirecionarFluxoCandidato(Number(usuario_id), res);
    if (tipoEfetivo === 'empresa')   return redirecionarFluxoEmpresa(Number(usuario_id), res);

    return res.redirect('/cadastro');
  } catch (err) {
    console.error('Erro ao continuar cadastro:', err);
    req.session.erro = 'Não foi possível continuar o cadastro.';
    return res.redirect('/login');
  }
};


exports.reiniciarCadastro = async (req, res) => {
  const usuario_id = req.session?.usuario?.id;
  const tipo = req.session?.usuario?.tipo;


  if (!usuario_id || !tipo) {
    req.session.erro = 'Você precisa estar logado para reiniciar o cadastro.';
    return res.redirect('/login');
  }

  try {
    const usuario = await usuarioModel.buscarPorId(Number(usuario_id));
    if (!usuario) {
      req.session.erro = 'Usuário da sessão não encontrado.';
      req.session.destroy();
      return res.redirect('/login');
    }

    delete req.session.candidato;
    delete req.session.empresa;

    if (tipo === 'candidato') {
      await resetParcialCandidato(Number(usuario_id));
      return res.redirect(`/candidatos/cadastro/nome`);
    }
    if (tipo === 'empresa') {
      await resetParcialEmpresa(Number(usuario_id));
      return res.redirect(`/empresas/nome-empresa`);
    }

    return res.redirect('/cadastro');
  } catch (err) {
    console.error('Erro ao reiniciar cadastro:', err);
    req.session.erro = 'Não foi possível reiniciar o cadastro.';
    return res.redirect('/login');
  }
};

exports.confirmarAcaoCadastro = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.session.erro = 'Token não fornecido.';
    return res.redirect('/cadastro');
  }

  try {
    // A verificação do JWT é SEGURA.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario_id = Number(decoded.id);
    const tipo = decoded.tipo;
    const acao = decoded.acao;

    if (!usuario_id || !tipo || !acao) {
      req.session.erro = 'Dados do token incompletos.';
      return res.redirect('/cadastro');
    }

    const usuario = await usuarioModel.buscarPorId(usuario_id);
    if (!usuario || !usuario.email_verificado) {
      req.session.erro = 'Ação não permitida para esta conta.';
      return res.redirect('/cadastro');
    }

    // ADICIONA O LOGIN (req.session.regenerate) ANTES DE REDIRECIONAR
    // Isso é necessário para que as rotas protegidas (ex: /candidato/nome) funcionem
    req.session.regenerate(async (err) => {
        if (err) {
            console.error('Erro ao regenerar sessão em confirmarAcao:', err);
            req.session.erro = 'Erro ao iniciar sessão.';
            return res.redirect('/login');
        }

        req.session.remember = false;
        req.session.cookie.expires = undefined;
        
        // Cria as sessões (copiado da lógica de statusVerificacao)
        if (usuario.tipo === 'candidato') {
            const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario.id);
            const localidade = [candidato?.cidade, candidato?.estado, candidato?.pais].filter(Boolean).join(', ');
            req.session.candidato = {
                id: candidato?.id ?? null,
                usuario_id: usuario.id,
                nome: candidato?.nome || '',
                sobrenome: candidato?.sobrenome || '',
                email: usuario.email,
                tipo: 'candidato',
                localidade,
                // ... (etc)
            };
            req.session.usuario = {
                id: usuario.id,
                tipo: 'candidato',
                nome: candidato?.nome || '',
                sobrenome: candidato?.sobrenome || '',
            };
        } else if (usuario.tipo === 'empresa') {
            const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario.id);
            req.session.empresa = {
                id: empresa?.id ?? null,
                usuario_id: usuario.id,
                nome_empresa: empresa?.nome_empresa || '',
                email: usuario.email,
            };
            req.session.usuario = {
                id: usuario.id,
                tipo: 'empresa',
                nome: empresa?.nome_empresa || '',
                email: usuario.email,
            };
        }

        // Salva a sessão e executa a ação
        req.session.save(async (err) => {
            if (err) {
                req.session.erro = 'Erro ao salvar sessão.';
                return res.redirect('/login');
            }

            // Agora podemos executar as ações com segurança
            if (acao === 'continuar') {
                if (tipo === 'candidato') return redirecionarFluxoCandidato(usuario_id, res);
                if (tipo === 'empresa')   return redirecionarFluxoEmpresa(usuario_id, res);
            }

            if (acao === 'reiniciar') {
                delete req.session.candidato; // (A sessão será recriada no próximo passo)
                delete req.session.empresa;

                if (tipo === 'candidato') {
                  await resetParcialCandidato(usuario_id);
                    // O redirect seguro já vai funcionar pois o usuário está logado
                  return res.redirect(`/candidatos/cadastro/nome`);
                }
                if (tipo === 'empresa') {
                  await resetParcialEmpresa(usuario_id);
                  return res.redirect(`/empresas/nome-empresa`);
                }
            }

            req.session.erro = 'Ação inválida.';
            return res.redirect('/cadastro');
        });
    });

  } catch (error) {
    console.error('Erro ao confirmar ação do cadastro via e-mail:', error);
    req.session.erro = 'Link inválido ou expirado.';
    return res.redirect('/cadastro');
  }
};

exports.pularCadastro = async (req, res) => {
  try {
    const usuario_id = req.session?.usuario?.id;
    const tipo = req.session?.usuario?.tipo;
    

    if (!usuario_id || !tipo) {
        req.session.erro = 'Você precisa estar logado para pular o cadastro.';
        return res.redirect('/login');
    }

    req.session.usuario.skipCadastro = true;

    if (req.session.usuario?.tipo === 'candidato') {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      let cand = await prisma.candidato.findUnique({
        where: { usuario_id: Number(usuario_id) }
      });

      if (!cand) {
        cand = await prisma.candidato.create({
          data: {
            usuario_id: Number(usuario_id), 
            nome: '',
            sobrenome: '',
            data_nascimento: null,
            pais: '',
            estado: '',
            cidade: '',
            telefone: '',
            foto_perfil: ''
          }
        });
      }
      req.session.candidato = {
        id: Number(cand.id),
        skipCadastro: true
      };
    }

    if (req.session.empresa) {
      req.session.empresa.skipCadastro = true;
    }

    res.cookie('cs_skipCadastro', '1', {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 31536000000
    });

    return res.redirect(tipo === 'empresa' ? '/empresas/home' : '/candidatos/home');
  } catch (err) {
    console.error('Erro ao pular cadastro:', err);
    req.session.erro = 'Não foi possível pular o complemento agora.';
    return res.redirect('/login');
  }
};