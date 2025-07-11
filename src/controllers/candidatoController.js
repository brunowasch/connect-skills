const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const candidatoModel = require('../models/candidatoModel');
const vagaModel = require('../models/vagaModel');
const { cloudinary } = require('../config/cloudinary');

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
  const { usuario_id, ddi, ddd, numero } = req.body;

  if (!usuario_id || !ddi || !ddd || !numero) {
    return res.status(400).send("Preencha todos os campos de telefone.");
  }

  const telefoneFormatado = `${ddi}-${ddd}-${numero.replace('-', '')}`;

  try {
    await candidatoModel.atualizarTelefone({
      usuario_id: Number(usuario_id),
      telefone: telefoneFormatado
    });

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
  try {
    const { usuario_id } = req.body;

    // Verifica se o multer (Cloudinary) retornou o arquivo corretamente
    if (!req.file || !req.file.path) {
      return res.status(400).send('Nenhuma foto foi enviada.');
    }

    const caminhoFoto = req.file.path; // URL da imagem no Cloudinary

    // Atualiza no banco
    await prisma.candidato.update({
      where: { id: Number(usuario_id) },
      data: { foto_perfil: caminhoFoto }
    });

    // Atualiza a sessão
    req.session.candidato.foto_perfil = caminhoFoto;

    res.redirect('/candidato/cadastro/areas');
  } catch (error) {
    console.error('Erro ao salvar foto de perfil:', error);
    res.status(500).send('Erro interno ao salvar a foto.');
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
    // Buscar o candidato pelo usuário_id
    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    if (!candidato) return res.status(404).send("Candidato não encontrado.");

    // Busca os IDs das áreas de interesse com base nos nomes
    const ids = await candidatoModel.buscarIdsDasAreas({ nomes });

    if (ids.length !== 3) return res.status(400).send("Selecione exatamente 3 áreas válidas.");

    // Salva as áreas de interesse para o candidato
    await candidatoModel.salvarAreasDeInteresse({
      candidato_id: candidato.id,
      areas: ids
    });

    // Busca os dados atualizados do candidato
    const candidatoAtualizado = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));

    req.session.usuario = {
      id: candidato.id, 
      nome: candidato.nome,
      sobrenome: candidato.sobrenome,
      email: candidato.email,
      tipo: 'candidato',
      telefone: candidato.telefone,
      dataNascimento: candidato.data_nascimento,
      fotoPerfil: candidato.foto_perfil,
      localidade: `${candidato.cidade}, ${candidato.estado}, ${candidato.pais}`,
      areas: candidato.candidato_area?.map(rel => rel.area_interesse.nome) || []
    };


    return res.redirect('/candidatos/home');
  } catch (error) {
    console.error("Erro ao salvar áreas de interesse:", error);
    res.status(500).send("Erro ao salvar áreas de interesse.");
  }
};

exports.telaHomeCandidato = (req, res) => {
  const usuario = req.session.candidato;
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
  const usuario = req.session.candidato;
  if (!usuario) {
    console.warn('Sessão de candidato não encontrada em /meu-perfil');
    return res.redirect('/login');
  }

  // telefone armazenado como "DDI-DDD-NÚMERO"
  const [ddiRaw = '+55', dddRaw = '', numRaw = ''] = (usuario.telefone || '').split('-');
  const ddi    = ddiRaw;
  const ddd    = dddRaw;
  const numero = numRaw;

  res.render('candidatos/meu-perfil', {
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    localidade: usuario.localidade,
    ddi,
    ddd,
    numero,
    dataNascimento: usuario.dataNascimento
      ? new Date(usuario.dataNascimento).toISOString().split('T')[0]
      : '',
    // Usa a foto que vem do banco (campo foto_perfil)
    fotoPerfil: usuario.foto_perfil || 'https://via.placeholder.com/80',
    areas: usuario.areas || [],
    activePage: 'perfil'
  });
};

exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.candidato;
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

exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  const { nome, sobrenome, localidade, telefone, foto_perfil, data_nascimento } = sess;

  // Quebra telefone
  const [ddi = '', ddd = '', numero = ''] = (telefone || '').split('-');

  // Formata data como YYYY-MM-DD ou vazio
  const dataNascimento = data_nascimento
    ? new Date(data_nascimento).toISOString().slice(0, 10)
    : '';

  res.render('candidatos/editar-perfil', {
    nome,
    sobrenome,
    localidade,
    ddi,
    ddd,
    numero,
    fotoPerfil: foto_perfil,
    dataNascimento  // <-- agora disponível no EJS
  });
};

/**
 * POST /candidatos/editar-perfil
 * Recebe o form com nome, sobrenome, localidade e telefone dividido.
 */
exports.salvarEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  const candidato_id = Number(sess.id);
  const { nome, sobrenome, localidade, ddi, ddd, numero, dataNascimento, fotoBase64 } = req.body;

  const telefone = `${ddi}-${ddd}-${numero.replace('-', '')}`;
  const [cidade = '', estado = '', pais = ''] = localidade.split(',').map(s => s.trim());

  try {
    // Se a imagem foi enviada como base64
    let fotoUrl = sess.foto_perfil || '';
    if (req.file && req.file.path) {
      fotoUrl = req.file.path;
      await candidatoModel.atualizarFotoPerfil({
        candidato_id,
        foto_perfil: fotoUrl
      });
      sess.foto_perfil = fotoUrl;
    }

    // Atualiza dados básicos do perfil
    await candidatoModel.atualizarPerfilBasico({
      candidato_id,
      nome,
      sobrenome,
      pais,
      estado,
      cidade,
      telefone,
      data_nascimento: dataNascimento
    });

    // Atualiza a sessão
    sess.nome = nome;
    sess.sobrenome = sobrenome;
    sess.localidade = localidade;
    sess.telefone = telefone;
    sess.data_nascimento = dataNascimento;

    res.redirect('/candidatos/meu-perfil');
  } catch (err) {
    console.error('Erro ao atualizar perfil básico:', err);
    res.status(500).send('Não foi possível atualizar seu perfil.');
  }
};


exports.renderMeuPerfil = async (req, res) => {
  if (!req.session.candidato) return res.redirect('/login');

  // Busca candidato com áreas
  const candidato = await prisma.candidato.findUnique({
    where: { id: Number(req.session.candidato.id) },
    include: {
      candidato_area: {
        select: { area_interesse: { select: { nome: true } } }
      }
    }
  });
  if (!candidato) return res.redirect('/login');

  // Formata localidade
  const localidade = [candidato.cidade, candidato.estado, candidato.pais]
    .filter(Boolean)
    .join(', ');

  // Extrai nomes das áreas
  const areas = candidato.candidato_area.map(rel => rel.area_interesse.nome);

  // Quebra telefone
  const [ddi = '', ddd = '', numero = ''] = (candidato.telefone || '').split('-');
  
  // Formata data
  const dataNascimento = candidato.data_nascimento
    ? new Date(candidato.data_nascimento).toISOString().slice(0,10)
    : '';

  res.render('candidatos/meu-perfil', {
    candidato,
    fotoPerfil: candidato.foto_perfil || 'https://via.placeholder.com/80',
    localidade,
    areas,               // <-- passa aqui!
    ddi,
    ddd,
    numero,
    dataNascimento,
    activePage: 'perfil'
  });
};