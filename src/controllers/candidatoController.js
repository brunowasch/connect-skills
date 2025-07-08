const path = require('path');
const fs = require('fs');
const candidatoModel = require('../models/candidatoModel');
const vagaModel = require('../models/vagaModel');

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

  if (!usuario_id || !localidade) return res.status(400).send('ID ou localidade ausente.');

  const partes = localidade.split(',').map(p => p.trim());
  if (partes.length < 3) return res.status(400).send('Formato inválido. Use: Cidade, Estado, País.');

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
  const { usuario_id } = req.body;

  if (!req.file || !req.file.path) {
    return res.status(400).send('Imagem não foi enviada corretamente.');
  }

  const fotoUrl = req.file.path; // URL retornada pelo Cloudinary

  try {
    await candidatoModel.atualizarFotoPerfil({
      usuario_id: Number(usuario_id),
      foto_perfil: fotoUrl
    });

    // Atualiza a sessão do usuário, se necessário
    if (req.session.usuario) {
      req.session.usuario.fotoPerfil = fotoUrl;
    }

    res.redirect(`/candidato/areas?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar foto no Cloudinary:', err);
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

// Buscar dados atualizados do candidato
const candidatoAtualizado = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));

req.session.usuario = {
  id: usuario.id, 
  nome: candidato.nome,
  sobrenome: candidato.sobrenome,
  email: usuario.email,
  tipo: usuario.tipo,
  telefone: candidato.telefone,
  dataNascimento: candidato.data_nascimento,
  fotoPerfil: candidato.foto_perfil,
  localidade: `${candidato.cidade}, ${candidato.estado}, ${candidato.pais}`,
  areas: candidato.candidato_area?.map(rel => rel.area_interesse.nome) || []
};

res.redirect(`/candidato/home`);

  } catch (err) {
    console.error('Erro ao salvar áreas de interesse:', err);
    res.status(500).send("Erro ao salvar áreas de interesse.");
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
  if (!usuario) {
    console.warn('Sessão de candidato não encontrada em /meu-perfil');
    return res.redirect('/login');
  }

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


exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  try {
    const candidato_id = usuario.id;  // Pega o id do candidato após login

    // Chama a função correta para pegar as vagas
    const vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(candidato_id);

    res.render('candidatos/vagas', {
      vagas,
      activePage: 'vagas',
    });
  } catch (err) {
    console.error('Erro ao buscar vagas para candidato:', err);
    res.status(500).send('Erro ao buscar vagas.');
  }
};

