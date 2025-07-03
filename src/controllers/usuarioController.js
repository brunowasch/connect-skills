const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuarioModel');
const candidatoModel = require('../models/candidatoModel');
const empresaModel = require('../models/empresaModel');

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