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
  const usuarioId = req.query.usuario_id || req.body.usuario_id;
  res.render('candidatos/telefone', {
    usuarioId,
    error: null,
    telefoneData: {}
  });
};

exports.salvarTelefone = async (req, res) => {
  const usuarioId = req.body.usuario_id || req.query.usuario_id;
  const { ddi, ddd, telefone } = req.body;
  if (!usuarioId || !ddi || !ddd || !telefone) {
    return res.render('candidatos/telefone', {
      usuarioId,
      error: 'Preencha todos os campos de telefone.',
      telefoneData: { ddi, ddd, telefone }
    });
  }
  const telefoneSemHifen = telefone.replace(/-/g, '');
  const telefoneFormatado = `${ddi}-${ddd}-${telefoneSemHifen}`;
  try {
    await candidatoModel.atualizarTelefone({
      usuario_id: Number(usuarioId),
      telefone: telefoneFormatado
    });
    return res.redirect(`/candidato/cadastro/foto-perfil?usuario_id=${usuarioId}`);
  } catch (err) {
    console.error('Erro ao salvar telefone:', err);
    return res.render('candidatos/telefone', {
      usuarioId,
      error: 'Erro ao salvar telefone. Tente novamente.',
      telefoneData: { ddi, ddd, telefone }
    });
  }
};

exports.telaFotoPerfil = (req, res) => {
  const usuarioId = req.query.usuario_id || req.body.usuario_id;
  return res.render('candidatos/foto-perfil', {
    usuarioId,
    error: null
  });
};

exports.salvarFotoPerfil = async (req, res) => {
  const usuarioId = req.body.usuario_id || req.query.usuario_id;
  if (!req.file?.buffer) {
    return res.render('candidatos/foto-perfil', {
      usuarioId,
      error: 'Selecione uma foto antes de continuar.'
    });
  }

  try {
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'connect-skills/candidatos',
      public_id: `foto_candidato_${usuarioId}`,
      overwrite: true
    });

    const caminhoFoto = result.secure_url;

    const candidato = await prisma.candidato.findUnique({
      where: { usuario_id: Number(usuarioId) }
    });
    if (!candidato) throw new Error(`Candidato não existe (usuario_id ${usuarioId})`);

    await prisma.candidato.update({
      where: { id: candidato.id },
      data: { foto_perfil: caminhoFoto }
    });

    if (req.session.candidato) {
      req.session.candidato.foto_perfil = caminhoFoto;
    }

    return res.redirect(`/candidato/cadastro/areas?usuario_id=${usuarioId}`);
  } catch (err) {
    console.error('Erro ao salvar foto de perfil:', err);
    return res.render('candidatos/foto-perfil', {
      usuarioId,
      error: 'Erro interno ao salvar a foto. Tente novamente.'
    });
  }
};

exports.telaSelecionarAreas = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/selecionar-areas', { usuario_id });
};

exports.salvarAreas = async (req, res) => {
  const { usuario_id, areasSelecionadas, outra_area_input } = req.body;
  const nomes = JSON.parse(areasSelecionadas);

  if (nomes.length !== 3) {
    return res.status(400).send("Selecione exatamente 3 áreas válidas.");
  }

  try {
    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    if (!candidato) {
      return res.status(404).send("Candidato não encontrado.");
    }

    const nomesFinal = [...nomes];

    if (nomes.includes("Outro")) {
      if (!outra_area_input || outra_area_input.trim() === "") {
        return res.status(400).send("Você selecionou 'Outro', mas não preencheu a nova área.");
      }

      const novaArea = await candidatoModel.upsertNovaArea(outra_area_input.trim());
      const index = nomesFinal.indexOf("Outro");
      nomesFinal.splice(index, 1, novaArea.nome);
    }

    console.log("nomesFinal:", nomesFinal);
    const ids = await candidatoModel.buscarIdsDasAreas({ nomes: nomesFinal });
    console.log("ids encontrados:", ids);

    if (ids.length !== 3) {
      return res.status(400).send("Erro ao localizar todas as áreas selecionadas.");
    }

    await candidatoModel.salvarAreasDeInteresse({
      candidato_id: candidato.id,
      areas: ids
    });

    const cAtual = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    req.session.candidato = {
      id: cAtual.id,
      nome: cAtual.nome,
      sobrenome: cAtual.sobrenome,
      email: cAtual.email,
      tipo: 'candidato',
      telefone: cAtual.telefone,
      dataNascimento: cAtual.data_nascimento,
      foto_perfil: cAtual.foto_perfil,
      localidade: `${cAtual.cidade}, ${cAtual.estado}, ${cAtual.pais}`,
      areas: cAtual.candidato_area.map(r => r.area_interesse.nome)
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

exports.renderMeuPerfil = async (req, res) => {
  if (!req.session.candidato) return res.redirect('/login');
  const candidato = await prisma.candidato.findUnique({
    where: { id: Number(req.session.candidato.id) },
    include: { candidato_area: { select: { area_interesse: { select: { nome: true } } } } }
  });
  if (!candidato) return res.redirect('/login');

  const localidade = [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ');
  const areas = candidato.candidato_area.map(r => r.area_interesse.nome);
  const [ddi = '', ddd = '', numero = ''] = (candidato.telefone || '').split('-');
  const dataNascimento = candidato.data_nascimento
    ? new Date(candidato.data_nascimento).toISOString().slice(0, 10)
    : '';

  res.render('candidatos/meu-perfil', {
    candidato,
    fotoPerfil: candidato.foto_perfil || 'https://via.placeholder.com/80',
    localidade,
    areas,
    ddi,
    ddd,
    numero,
    dataNascimento,
    activePage: 'perfil'
  });
};

exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.candidato;
  if (!usuario) return res.redirect('/login');
  try {
    const vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(usuario.id);
    res.render('candidatos/vagas', { vagas, activePage: 'vagas' });
  } catch (err) {
    console.error('Erro ao buscar vagas para candidato:', err);
    res.status(500).send('Erro ao buscar vagas.');
  }
};

exports.telaEditarPerfil = (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');
  const [ddi = '', ddd = '', numero = ''] = (sess.telefone || '').split('-');
  const dataNascimento = sess.data_nascimento
    ? new Date(sess.data_nascimento).toISOString().slice(0, 10)
    : '';
  res.render('candidatos/editar-perfil', {
    nome: sess.nome,
    sobrenome: sess.sobrenome,
    localidade: sess.localidade,
    ddi,
    ddd,
    numero,
    fotoPerfil: sess.foto_perfil,
    dataNascimento
  });
};

exports.salvarEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');
  const candidato_id = Number(sess.id);
  const { nome, sobrenome, localidade, ddi, ddd, numero, dataNascimento } = req.body;
  const telefone = `${ddi}-${ddd}-${numero.replace(/-/g, '')}`;
  const [cidade = '', estado = '', pais = ''] = localidade.split(',').map(s => s.trim());

  try {
    if (req.file && req.file.buffer) {
      const uploadResult = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream({
          folder: 'connect-skills/candidatos',
          public_id: `foto_candidato_${candidato_id}`,
          overwrite: true,
          resource_type: 'image'
        }, (err, res) => err ? reject(err) : resolve(res));
        s.end(req.file.buffer);
      });
      sess.foto_perfil = uploadResult.secure_url;
      await candidatoModel.atualizarFotoPerfil({
        candidato_id,
        foto_perfil: sess.foto_perfil
      });
    }

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

exports.telaEditarAreas = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  try {
    // Carregar as áreas de interesse do candidato
    const candidato = await prisma.candidato.findUnique({
      where: { id: sess.id },
      include: {
        candidato_area: {
          include: {
            area_interesse: true
          }
        }
      }
    });

    const areasAtuais = candidato.candidato_area.map(r => r.area_interesse.nome);
    const todasAsAreas = await prisma.area_interesse.findMany(); // Carregar todas as áreas de interesse
    const outraArea = areasAtuais.includes("Outro") ? areasAtuais.find(area => area !== "Outro") : null;

    res.render('candidatos/editar-areas', {
      areasAtuais,
      todasAsAreas,
      usuarioId: sess.id,
      outraArea: outraArea, // Passando a variável 'outraArea' para a view
      activePage: 'editar-areas'
    });
  } catch (err) {
    console.error('Erro ao carregar as áreas de interesse:', err);
    res.status(500).send('Erro ao carregar as áreas de interesse.');
  }
};

exports.salvarEditarAreas = async (req, res) => {
  const usuario_id = req.body.usuario_id; // O ID do usuário vindo do corpo da requisição
  const areasEscolhidas = req.body.areasSelecionadas; // Áreas selecionadas, vindo do corpo da requisição

  // Certifique-se de que areasEscolhidas é um array válido
  if (!areasEscolhidas || areasEscolhidas.length === 0) {
    return res.status(400).send("Nenhuma área foi selecionada.");
  }

  try {
    // Garantir que areasEscolhidas seja um array
    const nomes = Array.isArray(areasEscolhidas) ? areasEscolhidas : JSON.parse(areasEscolhidas);

    // Verificar se nomes é realmente um array de strings
    if (!Array.isArray(nomes)) {
      return res.status(400).send("Formato inválido de áreas selecionadas.");
    }

    // Obter as IDs das áreas de interesse com base nos nomes
    const areas = await prisma.area_interesse.findMany({
      where: {
        nome: {
          in: nomes,  // Passando o array diretamente para o Prisma
        }
      },
      select: {
        id: true  // Somente as IDs das áreas
      }
    });

    if (areas.length !== nomes.length) {
      return res.status(400).send("Erro ao localizar algumas áreas selecionadas.");
    }

    // Remover as associações antigas
    await prisma.candidato_area.deleteMany({
      where: { candidato_id: Number(usuario_id) }
    });

    // Criar as novas associações
    const candidatoAreas = areas.map(area => ({
      candidato_id: Number(usuario_id),
      area_interesse_id: area.id
    }));

    await prisma.candidato_area.createMany({
      data: candidatoAreas
    });

    res.redirect('/candidatos/meu-perfil');  // Redirecionar após a atualização
  } catch (error) {
    console.error('Erro ao salvar áreas de interesse:', error);
    res.status(500).send("Erro ao salvar as áreas de interesse.");
  }
};
