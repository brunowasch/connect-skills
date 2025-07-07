const path = require('path');
const fs = require('fs');
const candidatoModel = require('../models/candidatoModel');

exports.telaNomeCandidato = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos', { usuario_id });
};

exports.salvarNomeCandidato = async (req, res) => {
  const { usuario_id, nome, sobrenome, data_nascimento } = req.body;

  try {
    await candidatoModel.criarCandidato({
      usuario_id: Number(usuario_id),
      nome,
      sobrenome,
      data_nascimento: new Date(data_nascimento),
    });

    res.redirect(`/candidato/localizacao?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar nome e sobrenome:', err);
    res.status(500).send("Erro ao salvar dados iniciais.");
  }
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/localizacao-login-candidato', { usuario_id });
};

exports.salvarLocalizacao = async (req, res) => {
  const { usuario_id, localidade } = req.body;

  if (!usuario_id || !localidade) {
    return res.status(400).send('ID ou localidade ausente.');
  }

  const partes = localidade.split(',').map(p => p.trim());
  if (partes.length < 3) {
    return res.status(400).send('Formato de localidade inválido. Use: Cidade, Estado, País.');
  }

  const [cidade, estado, pais] = partes;

  try {
    await candidatoModel.atualizarLocalizacao({
      usuario_id: Number(usuario_id),
      pais,
      estado,
      cidade,
    });

    res.redirect(`/candidato/telefone?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    res.status(500).send('Erro ao salvar localização.');
  }
};

exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/telefone', { usuario_id });
};

exports.salvarTelefone = async (req, res) => {
  const { usuario_id, ddi, ddd, telefone } = req.body;

  if (!usuario_id || !ddi || !ddd || !telefone) {
    return res.status(400).send("Preencha todos os campos de telefone.");
  }

  const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;

  try {
    await candidatoModel.atualizarTelefone({ usuario_id: Number(usuario_id), telefone: telefoneCompleto });
    res.redirect(`/candidato/foto-perfil?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar telefone:', err);
    res.status(500).send("Erro ao salvar telefone.");
  }
};

exports.telaFotoPerfil = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/foto-perfil', { usuario_id });
};

exports.salvarFotoPerfil = async (req, res) => {
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

  try {
    await candidatoModel.atualizarFotoPerfil({ usuario_id: Number(usuario_id), foto_perfil: caminhoFoto });
    res.redirect(`/candidato/areas?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar foto:', err);
    res.status(500).send("Erro ao salvar foto.");
  }
};

exports.telaSelecionarAreas = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/selecionar-areas', { usuario_id });
};

exports.salvarAreas = async (req, res) => {
  const { usuario_id, areasSelecionadas } = req.body;
  const nomes = areasSelecionadas.split(',');

  try {
    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    if (!candidato) return res.status(404).send("Candidato não encontrado.");

    const ids = await candidatoModel.buscarIdsDasAreas({ nomes });
    if (ids.length !== 3) return res.status(400).send("Selecione exatamente 3 áreas válidas.");

    await candidatoModel.salvarAreasDeInteresse({
      candidato_id: candidato.id,
      areas: ids
    });

    req.session.usuario_id = usuario_id;
    res.redirect(`/candidato/home`);
  } catch (err) {
    console.error('Erro ao salvar áreas de interesse:', err);
    res.status(500).send("Erro ao salvar áreas de interesse.");
  }
};

exports.telaHomeCandidato = (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) {
    console.warn('Sessão de candidato vazia, redirecionando para login.');
    return res.redirect('/login');
  }

  res.render('candidatos/home-candidatos', {
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    localidade: usuario.localidade,
    activePage: 'home',
    usuario
  });
};

exports.mostrarPerfil = (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) {
    console.warn('Sessão de candidato não encontrada em /meu-perfil');
    return res.redirect('/login');
  }

  let ddd = '';
  let telefone = usuario.telefone;

  const match = /\((\d{2})\)\s*(.*)/.exec(usuario.telefone);
  if (match) {
    ddd = match[1];
    telefone = match[2];
  }

  res.render('candidatos/meu-perfil', {
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    localidade: usuario.localidade,
    telefone,
    ddd,
    dataNascimento: new Date(usuario.dataNascimento).toISOString().split('T')[0],
    fotoPerfil: usuario.fotoPerfil,
    areas: usuario.areas || [],
    activePage: 'perfil',
    usuario
  });
};

exports.mostrarVagas = (req, res) => {
  const vagas = req.session.vagasPublicadas || [];
  res.render('candidatos/vagas', { vagas, activePage: 'vagas' });
};
