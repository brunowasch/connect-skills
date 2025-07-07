// controllers/candidatoController.js (refatorado com boas práticas e compatível com models)
const path = require('path');
const fs = require('fs');
const candidatoModel = require('../models/candidatoModel');

exports.telaNomeCandidato = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos', { usuario_id });
};

exports.salvarNomeCandidato = async (req, res) => {
  try {
    const { usuario_id, nome, sobrenome, data_nascimento } = req.body;
    await candidatoModel.criarCandidato({ usuario_id, nome, sobrenome, data_nascimento });
    res.redirect(`/candidato/localizacao?usuario_id=${usuario_id}`);
  } catch (err) {
    res.status(500).send('Erro ao salvar dados iniciais.');
  }
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/localizacao-login-candidato', { usuario_id });
};

exports.salvarLocalizacao = async (req, res) => {
  try {
    const { usuario_id, localidade } = req.body;
    if (!usuario_id || !localidade) return res.status(400).send('ID ou localidade ausente.');

    const partes = localidade.split(',').map(p => p.trim());
    if (partes.length < 3) return res.status(400).send('Formato inválido. Use: Cidade, Estado, País.');

    const [cidade, estado, pais] = partes;
    await candidatoModel.atualizarLocalizacao({ usuario_id, pais, estado, cidade });
    res.redirect(`/candidato/telefone?usuario_id=${usuario_id}`);
  } catch (err) {
    res.status(500).send('Erro ao salvar localização.');
  }
};

exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/telefone', { usuario_id });
};

exports.salvarTelefone = async (req, res) => {
  try {
    const { usuario_id, ddi, ddd, telefone } = req.body;
    if (!usuario_id || !ddi || !ddd || !telefone) return res.status(400).send('Campos obrigatórios ausentes.');

    const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;
    await candidatoModel.atualizarTelefone({ usuario_id, telefone: telefoneCompleto });
    res.redirect(`/candidato/foto-perfil?usuario_id=${usuario_id}`);
  } catch (err) {
    res.status(500).send('Erro ao salvar telefone.');
  }
};

exports.telaFotoPerfil = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/foto-perfil', { usuario_id });
};

exports.salvarFotoPerfil = async (req, res) => {
  try {
    const { usuario_id, fotoBase64 } = req.body;
    if (!fotoBase64 || !fotoBase64.startsWith('data:image')) return res.status(400).send('Imagem inválida.');

    const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const nomeArquivo = `${Date.now()}-foto-candidato.png`;
    const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const caminho = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminho, buffer);
    const caminhoFoto = `/uploads/${nomeArquivo}`;

    await candidatoModel.atualizarFotoPerfil({ usuario_id, foto_perfil: caminhoFoto });
    res.redirect(`/candidato/areas?usuario_id=${usuario_id}`);
  } catch (err) {
    res.status(500).send('Erro ao salvar foto.');
  }
};

exports.telaSelecionarAreas = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/selecionar-areas', { usuario_id });
};

exports.salvarAreas = async (req, res) => {
  try {
    const { usuario_id, areasSelecionadas } = req.body;
    const nomes = areasSelecionadas.split(',');

    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(usuario_id);
    if (!candidato) return res.status(404).send('Candidato não encontrado.');

    const ids = await candidatoModel.buscarIdsDasAreas({ nomes });
    if (ids.length !== 3) return res.status(400).send('Selecione exatamente 3 áreas.');

    await candidatoModel.salvarAreasDeInteresse({ candidato_id: candidato.id, areas: ids });
    req.session.usuario_id = usuario_id;

    res.redirect('/candidato/home');
  } catch (err) {
    res.status(500).send('Erro ao salvar áreas de interesse.');
  }
};

exports.telaHomeCandidato = (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

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
  if (!usuario) return res.redirect('/login');

  let { telefone } = usuario;
  let ddd = '';

  const match = /\((\d{2})\)\s*(.*)/.exec(telefone);
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
