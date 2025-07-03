const path = require('path');
const fs = require('fs');
const candidatoModel = require('../models/candidatoModel');

exports.telaNomeCandidato = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos', { usuario_id });
};

exports.salvarNomeCandidato = (req, res) => {
  const { usuario_id, nome, sobrenome, data_nascimento } = req.body;
  const dados = { usuario_id, nome, sobrenome, data_nascimento };

  candidatoModel.inserirNomeSobrenome(dados, (err) => {
    if (err) return res.status(500).send("Erro ao salvar dados iniciais.");
    res.redirect(`/candidato/localizacao?usuario_id=${usuario_id}`);
  });
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/localizacao-login-candidato', { usuario_id });
};

exports.salvarLocalizacao = (req, res) => {
  const { usuario_id, localidade } = req.body;

  if (!usuario_id || !localidade) {
    return res.status(400).send('ID ou localidade ausente.');
  }

  const partes = localidade.split(',').map(p => p.trim());
  if (partes.length < 3) {
    return res.status(400).send('Formato de localidade inválido. Use: Cidade, Estado, País.');
  }

  const [cidade, estado, pais] = partes;
  candidatoModel.atualizarLocalizacao({ usuario_id, pais, estado, cidade }, (err) => {
    if (err) return res.status(500).send('Erro ao salvar localização.');
    res.redirect(`/candidato/telefone?usuario_id=${usuario_id}`);
  });
};

exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/telefone', { usuario_id });
};

exports.salvarTelefone = (req, res) => {
  const { usuario_id, ddi, ddd, telefone } = req.body;

  if (!usuario_id || !ddi || !ddd || !telefone) {
    return res.status(400).send("Preencha todos os campos de telefone.");
  }

  const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;
  candidatoModel.atualizarTelefone({ usuario_id, telefone: telefoneCompleto }, (err) => {
    if (err) return res.status(500).send("Erro ao salvar telefone.");
    res.redirect(`/candidato/foto-perfil?usuario_id=${usuario_id}`);
  });
};

exports.telaFotoPerfil = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/foto-perfil', { usuario_id });
};

exports.salvarFotoPerfil = (req, res) => {
  const { usuario_id, fotoBase64 } = req.body;

  if (!fotoBase64 || !fotoBase64.startsWith('data:image')) {
    return res.status(400).send("Nenhuma imagem recebida.");
  }

  const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const nomeArquivo = `${Date.now()}-foto-candidato.png`;
  const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const caminho = path.join(uploadDir, nomeArquivo);
  fs.writeFileSync(caminho, buffer);
  const caminhoFoto = `/uploads/${nomeArquivo}`;

  candidatoModel.atualizarFotoPerfil({ usuario_id, foto_perfil: caminhoFoto }, (err) => {
    if (err) return res.status(500).send("Erro ao salvar foto.");
    res.redirect(`/candidato/areas?usuario_id=${usuario_id}`);
  });
};

exports.telaSelecionarAreas = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/selecionar-areas', { usuario_id });
};

exports.salvarAreas = (req, res) => {
  const { usuario_id, areasSelecionadas } = req.body;
  const nomes = areasSelecionadas.split(',');

  candidatoModel.buscarPorUsuarioId(usuario_id, (err, candidato) => {
    if (err || !candidato) return res.status(500).send("Candidato não encontrado.");

    candidatoModel.buscarIdsDasAreas(nomes, (err, ids) => {
      if (err || ids.length !== 3) return res.status(500).send("Erro ao encontrar áreas.");

      candidatoModel.salvarAreasDeInteresse(candidato.id, ids, (err) => {
        if (err) return res.status(500).send("Erro ao salvar áreas de interesse.");

        // ✅ Salva usuario_id na sessão para futuras requisições
        req.session.usuario_id = usuario_id;

        res.redirect(`/candidato/home`);
      });
    });
  });
};

exports.telaHomeCandidato = (req, res) => {
  const usuario_id = req.session.usuario_id;
  if (!usuario_id) return res.redirect('/login');

  candidatoModel.buscarPorUsuarioId(usuario_id, (err, usuario) => {
    if (err || !usuario) return res.redirect('/login');

    res.render('candidatos/home-candidatos', {
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      localidade: `${usuario.cidade}, ${usuario.estado}, ${usuario.pais}`,
      activePage: 'home'
    });
  });
};

exports.mostrarPerfil = (req, res) => {
  const usuario_id = req.session.usuario_id;

  if (!usuario_id) return res.redirect('/login');

  candidatoModel.buscarPorUsuarioId(usuario_id, (err, usuario) => {
    if (err || !usuario) return res.redirect('/login');

    // Quebra o DDD e o número, se possível
    let ddd = '';
    let telefone = usuario.telefone;

    const match = /\((\d{2})\)\s*(.*)/.exec(usuario.telefone); // Ex: (51) 91234-5678
    if (match) {
      ddd = match[1];
      telefone = match[2];
    }

    res.render('candidatos/meu-perfil', {
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      localidade: `${usuario.cidade}, ${usuario.estado}, ${usuario.pais}`,
      telefone,
      ddd,
      dataNascimento: usuario.data_nascimento.toISOString().split('T')[0],
      fotoPerfil: usuario.foto_perfil,
      areas: usuario.areas || [],
      activePage: 'perfil'
    });
  });
};


exports.mostrarVagas = (req, res) => {
  const vagas = req.session.vagasPublicadas || [];
  res.render('candidatos/vagas', { vagas, activePage: 'vagas' });
};