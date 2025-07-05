const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');

async function enviarEmailVerificacao(email, usuarioId) {
  const token = jwt.sign({ id: usuarioId }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const link = `http://localhost:3000/usuarios/verificar-email?token=${token}`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: '"Connect Skills" <no-reply@connectskills.com>',
    to: email,
    subject: 'Confirmação de e-mail',
    html: `<p>Olá!</p>
           <p>Confirme seu e-mail clicando no link abaixo:</p>
           <a href="${link}">Verificar e-mail</a>`
  });
}

exports.criarUsuario = async (req, res) => {
  const { email, senha, tipo } = req.body;

  if (!email || !senha || !tipo) {
    return res.status(400).send('Preencha todos os campos.');
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    // Transformar o model em Promise
    const result = await new Promise((resolve, reject) => {
      usuarioModel.cadastrar({ email, senha: senhaCriptografada, tipo }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const usuarioId = result.insertId;

    await enviarEmailVerificacao(email, usuarioId);

    res.redirect(`/usuarios/aguardando-verificacao?email=${email}`);

  } catch (erro) {
    console.error('Erro ao criar usuário:', erro);
    return res.status(500).send('Erro interno ao processar o cadastro.');
  }
};


exports.login = async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).send('Preencha todos os campos.');
  }

  usuarioModel.buscarPorEmail(email, async (err, resultados) => {
    if (err) return res.status(500).send('Erro no banco de dados.');

    if (resultados.length === 0) {
      return res.status(401).send('Usuário não encontrado.');
    }

    const usuario = resultados[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
      return res.status(401).send('Senha incorreta.');
    }

    // Verifica tipo de usuário: empresa ou candidato
    if (usuario.tipo === 'empresa') {
      empresaModel.buscarPorUsuarioId(usuario.id, (err, empresa) => {
        if (err || !empresa) {
          console.error('Erro ao buscar empresa:', err);
          return res.redirect('/login');
        }

        req.session.empresa = {
          id: empresa.id,
          nome: empresa.nome,
          descricao: empresa.descricao,
          telefone: empresa.telefone,
          localidade: `${empresa.cidade}, ${empresa.estado}, ${empresa.pais}`,
          fotoPerfil: empresa.foto_perfil
        };

        res.redirect('/empresa/home');
      });
    } else if (usuario.tipo === 'candidato') {
      candidatoModel.buscarPorUsuarioId(usuario.id, (err, candidato) => {
        if (err || !candidato) {
          console.error('Erro ao buscar candidato:', err);
          return res.redirect('/login');
        }

        req.session.usuario = {
          id: candidato.id,
          nome: candidato.nome,
          sobrenome: candidato.sobrenome,
          email: usuario.email,
          tipo: usuario.tipo,
          telefone: candidato.telefone,
          dataNascimento: candidato.data_nascimento,
          fotoPerfil: candidato.foto_perfil,
          localidade: `${candidato.cidade}, ${candidato.estado}, ${candidato.pais}`,
          areas: candidato.areas || []
        };

        req.session.save(err => {
          if (err) {
            console.error('Erro ao salvar sessão do candidato:', err);
            return res.redirect('/login');
          }

          console.log('Sessão do candidato salva com sucesso!');
          res.redirect('/candidato/home');
        });
      });
    }
  });
};

exports.verificarEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioId = decoded.id;

    usuarioModel.verificarEmail(usuarioId, async (err) => {
      if (err) {
        console.error('Erro ao atualizar verificação no banco:', err);
        return res.status(500).send('Erro ao verificar e-mail.');
      }

      // Buscar o usuário para saber o tipo (empresa ou candidato)
      usuarioModel.buscarPorId(usuarioId, (err, resultados) => {
        if (err || resultados.length === 0) {
          console.error('Erro ao buscar usuário após verificação:', err);
          return res.status(500).send('Usuário não encontrado.');
        }

        const usuario = resultados[0];

        // Redireciona para a etapa correta
        if (usuario.tipo === 'empresa') {
          res.redirect(`/empresa/nome-empresa?usuario_id=${usuarioId}`);
        } else {
          res.redirect(`/candidato/cadastro/nome?usuario_id=${usuarioId}`);
        }
      });
    });
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return res.status(400).send('❌ Link inválido ou expirado.');
  }
};


exports.reenviarEmail = async (req, res) => {
  const { email } = req.body;

  try {
    // Busca o usuário pelo e-mail
    usuarioModel.buscarPorEmail(email, async (err, resultados) => {
      if (err || resultados.length === 0) {
        return res.status(400).send('Usuário não encontrado.');
      }

      const usuario = resultados[0];

      if (usuario.email_verificado) {
        return res.status(400).send('E-mail já foi verificado.');
      }

      await enviarEmailVerificacao(email, usuario.id);
       return res.redirect(`/usuarios/aguardando-verificacao?email=${encodeURIComponent(email)}&reenviado=true`);
    });
  } catch (error) {
    console.error('Erro ao reenviar e-mail:', error);
    res.status(500).send('Erro ao reenviar e-mail.');
  }
};

exports.telaAguardandoVerificacao = (req, res) => {
  const { email, reenviado } = req.query;
  res.render('auth/aguardando-verificacao', { email, reenviado  });
};