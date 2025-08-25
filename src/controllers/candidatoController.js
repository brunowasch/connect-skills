const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const candidatoModel = require('../models/candidatoModel');
const vagaModel = require('../models/vagaModel');
const { sugerirCompatibilidade } = require('../services/iaClient');
const vagaAvaliacaoModel = require('../models/vagaAvaliacaoModel');
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
    req.session.erro = 'Erro ao salvar seus dados iniciais. Tente novamente.';
    res.redirect(`/candidato/nome?usuario_id=${usuario_id}`);
  }
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  res.render('candidatos/localizacao-login-candidato', { usuario_id });
};

exports.salvarLocalizacao = async (req, res) => {
  const { usuario_id, localidade } = req.body;

  if (!usuario_id || !localidade) {
    req.session.erro = 'ID ou localidade ausente.';
    return res.redirect(`/candidato/localizacao?usuario_id=${usuario_id || ''}`);
  }

  const partes = localidade.split(',').map(p => p.trim());
  if (partes.length < 2 || partes.length > 3) {
    req.session.erro = 'Informe uma localidade válida. Ex: cidade e país, ou cidade, estado e país.';
    return res.redirect(`/candidato/localizacao?usuario_id=${usuario_id}`);
  }

  const [cidade, estado = '', pais = ''] = partes;

  try {
    await candidatoModel.atualizarLocalizacao({
      usuario_id: Number(usuario_id),
      cidade,
      estado,
      pais,
    });

    res.redirect(`/candidato/telefone?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    req.session.erro = 'Erro ao salvar localização. Tente novamente.';
    res.redirect(`/candidato/localizacao?usuario_id=${usuario_id}`);
  }
};

exports.telaTelefone = (req, res) => {
  const usuarioId = req.query.usuario_id || req.body.usuario_id;
  res.render('candidatos/telefone', { usuarioId, error: null, telefoneData: {} });
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
  return res.render('candidatos/foto-perfil', { usuarioId, error: null });
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

    const candidato = await prisma.candidato.findUnique({ where: { usuario_id: Number(usuarioId) } });
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

exports.telaSelecionarAreas = async (req, res) => {
  try {
    const usuario_id = req.query.usuario_id;

    const areas = await prisma.area_interesse.findMany({
      where: { padrao: true },
      orderBy: { nome: 'asc' }
    });

    res.render('candidatos/selecionar-areas', { usuario_id, areas });
  } catch (erro) {
    console.error('Erro ao carregar áreas:', erro);
    req.session.erro = 'Erro ao carregar áreas. Tente novamente.';
    res.redirect(`/candidato/cadastro/areas?usuario_id=${req.query.usuario_id || ''}`);
  }
};

exports.salvarAreas = async (req, res) => {
  const { usuario_id, areasSelecionadas, outra_area_input } = req.body;
  const nomes = JSON.parse(areasSelecionadas);

  if (nomes.length !== 3) {
    req.session.erro = 'Selecione exatamente 3 áreas válidas.';
    return res.redirect(`/candidato/cadastro/areas?usuario_id=${usuario_id}`);
  }

  try {
    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    if (!candidato) {
      req.session.erro = 'Candidato não encontrado.';
      return res.redirect(`/candidato/cadastro/areas?usuario_id=${usuario_id}`);
    }

    const nomesFinal = [...nomes];
    if (nomes.includes('Outro')) {
      if (!outra_area_input || outra_area_input.trim() === '') {
        req.session.erro = "Você selecionou 'Outro', mas não preencheu a nova área.";
        return res.redirect(`/candidato/cadastro/areas?usuario_id=${usuario_id}`);
      }
      const novaArea = await candidatoModel.upsertNovaArea(outra_area_input.trim());
      const index = nomesFinal.indexOf('Outro');
      nomesFinal.splice(index, 1, novaArea.nome);
    }

    const ids = await candidatoModel.buscarIdsDasAreas({ nomes: nomesFinal });
    if (ids.length !== 3) {
      req.session.erro = 'Erro ao localizar todas as áreas selecionadas.';
      return res.redirect(`/candidato/cadastro/areas?usuario_id=${usuario_id}`);
    }

    await candidatoModel.salvarAreasDeInteresse({ candidato_id: candidato.id, areas: ids });

    const cAtual = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));

    req.session.usuario = {
      id: cAtual.usuario_id, nome: cAtual.nome, sobrenome: cAtual.sobrenome, tipo: 'candidato'
    };
    req.session.candidato = {
      id: cAtual.id,
      nome: cAtual.nome,
      sobrenome: cAtual.sobrenome,
      email: cAtual.usuario?.email || '',
      tipo: 'candidato',
      telefone: cAtual.telefone,
      dataNascimento: cAtual.data_nascimento,
      foto_perfil: cAtual.foto_perfil,
      localidade: `${cAtual.cidade}, ${cAtual.estado}, ${cAtual.pais}`,
      areas: cAtual.candidato_area.map(r => r.area_interesse.nome)
    };

    req.session.sucessoCadastro = 'Áreas de interesse salvas com sucesso!';
    req.session.save(() => res.redirect('/candidatos/home'));
  } catch (error) {
    console.error('Erro ao salvar áreas de interesse:', error);
    req.session.erro = 'Erro ao salvar áreas de interesse. Tente novamente.';
    res.redirect(`/candidato/cadastro/areas?usuario_id=${req.body.usuario_id}`);
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
    usuario,
    candidato: usuario
  });
};

exports.renderMeuPerfil = async (req, res) => {
  if (!req.session.candidato) return res.redirect('/login');

  try {
    const candidato = await prisma.candidato.findUnique({
      where: { id: Number(req.session.candidato.id) },
      include: {
        candidato_area: {
          select: {
            area_interesse: {
              select: { nome: true }
            }
          }
        },
        usuario: { // 🔹 Não pedimos mais foto aqui
          select: {
            id: true,
            email: true,
            senha: true,
            tipo: true,
            email_verificado: true,
            nome: true,
            sobrenome: true
          }
        }
      }
    });

    if (!candidato) return res.redirect('/login');

    // Formatar telefone
    let ddi = '', ddd = '', numero = '';
    if (candidato.telefone) {
      if (candidato.telefone.includes('(')) {
        const match = candidato.telefone.match(/(\+\d+)\s+\((\d+)\)\s+(.*)/);
        if (match) {
          ddi = match[1];
          ddd = match[2];
          numero = match[3].replace(/\D/g, '');
        }
      } else {
        [ddi, ddd, numero] = candidato.telefone.split('-');
      }
    }

    const numeroFormatado = numero
      ? numero.length === 9
        ? `${numero.slice(0, 5)}-${numero.slice(5)}`
        : `${numero.slice(0, 4)}-${numero.slice(4)}`
      : '';

    const localidade = [candidato.cidade, candidato.estado, candidato.pais]
      .filter(Boolean)
      .join(', ');

    const areas = candidato.candidato_area.map(r => r.area_interesse.nome);

    const dataNascimento = candidato.data_nascimento
      ? new Date(candidato.data_nascimento).toISOString().slice(0, 10)
      : '';

    // Foto de perfil do candidato, com fallback para imagem padrão
    const fotoPerfil = candidato.foto_perfil && candidato.foto_perfil.trim() !== ''
      ? candidato.foto_perfil.trim()
      : '/img/avatar.png';

    // Renderiza a página
    res.render('candidatos/meu-perfil', {
      candidato,
      fotoPerfil,
      localidade,
      areas,
      ddi,
      ddd,
      numeroFormatado,
      dataNascimento,
      activePage: 'perfil'
    });
  } catch (error) {
    console.error('Erro ao carregar perfil do candidato:', error);
    req.session.erro = 'Erro ao carregar seu perfil.';
    return res.redirect('/candidatos/home');
  }
};



exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.candidato;
  if (!usuario) return res.redirect('/login');
  try {
    const vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(usuario.id);
    res.render('candidatos/vagas', { vagas, activePage: 'vagas' });
  } catch (err) {
    console.error('Erro ao buscar vagas para candidato:', err);
    req.session.erro = 'Erro ao buscar vagas. Tente novamente.';
    res.redirect('/candidatos/home');
  }
};

exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  try {
    const candidato = await prisma.candidato.findUnique({
      where: { id: sess.id },
      include: { usuario: { select: { nome: true, sobrenome: true } } }
    });
    if (!candidato) return res.redirect('/login');

    const nome = candidato.nome || candidato.usuario?.nome || '';
    const sobrenome = candidato.sobrenome || candidato.usuario?.sobrenome || '';

    let ddi = '', ddd = '', numero = '';
    if (candidato.telefone?.includes('(')) {
      const match = candidato.telefone.match(/(\+\d+)\s+\((\d+)\)\s+(.*)/);
      if (match) { ddi = match[1]; ddd = match[2]; numero = match[3].replace(/\D/g, ''); }
    } else {
      [ddi, ddd, numero] = candidato.telefone?.split('-') || [];
    }

    const numeroFormatado = numero?.length >= 9
      ? `${numero.slice(0, 5)}-${numero.slice(5)}`
      : numero;

    const localidade = [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ');
    const dataNascimento = candidato.data_nascimento
      ? new Date(candidato.data_nascimento).toISOString().slice(0, 10)
      : '';

    const fotoPerfil = candidato.foto_perfil || sess.foto_perfil;

    res.render('candidatos/editar-perfil', {
      nome, sobrenome, localidade, ddi, ddd,
      numero: numeroFormatado, dataNascimento, fotoPerfil
    });

  } catch (erro) {
    console.error('Erro ao carregar tela de edição de perfil:', erro);
    req.session.erro = 'Erro ao carregar dados do perfil.';
    res.redirect('/candidatos/meu-perfil');
  }
};

exports.salvarEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  const candidato_id = Number(sess.id);
  const { nome, sobrenome, localidade, ddi, ddd, numero, dataNascimento, removerFoto } = req.body;
  const telefone = `${ddi}-${ddd}-${(numero || '').replace(/-/g, '')}`;
  const [cidade = '', estado = '', pais = ''] = (localidade || '').split(',').map(s => s.trim());

  try {
    if (removerFoto) {
      await candidatoModel.atualizarFotoPerfil({ candidato_id, foto_perfil: null });
      sess.foto_perfil = '/img/avatar.png';
    } else if (req.file && req.file.buffer) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: 'connect-skills/candidatos',
          public_id: `foto_candidato_${candidato_id}`,
          overwrite: true,
          resource_type: 'image'
        }, (err, result) => err ? reject(err) : resolve(result));
        stream.end(req.file.buffer);
      });
      sess.foto_perfil = uploadResult.secure_url;
      await candidatoModel.atualizarFotoPerfil({ candidato_id, foto_perfil: sess.foto_perfil });
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

    req.session.sucessoPerfil = 'Perfil atualizado com sucesso!';
    res.redirect('/candidatos/meu-perfil');
  } catch (err) {
    console.error('Erro ao atualizar perfil básico:', err);
    res.status(500).render('candidatos/editar-perfil', {
      nome, sobrenome, localidade, ddd, numero, dataNascimento,
      fotoPerfil: sess.foto_perfil,
      errorMessage: 'Não foi possível atualizar seu perfil. Tente novamente.'
    });
  }
};

exports.telaEditarAreas = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  try {
    const candidato = await prisma.candidato.findUnique({
      where: { id: sess.id },
      include: { candidato_area: { include: { area_interesse: true } } }
    });

    const areasAtuais = candidato.candidato_area.map(r => r.area_interesse.nome);
    const todasAsAreas = await prisma.area_interesse.findMany();
    const outraArea = areasAtuais.includes('Outro') ? areasAtuais.find(area => area !== 'Outro') : null;

    res.render('candidatos/editar-areas', {
      areasAtuais,
      todasAsAreas,
      candidatoId: sess.id,
      outraArea,
      activePage: 'editar-areas'
    });

  } catch (err) {
    console.error('Erro ao carregar as áreas de interesse:', err);
    req.session.erro = 'Erro ao carregar as áreas de interesse.';
    res.redirect('/candidatos/meu-perfil');
  }
};

exports.salvarEditarAreas = async (req, res) => {
  const candidato_id = Number(req.body.candidato_id);
  let nomesSelecionados;

  try {
    nomesSelecionados = Array.isArray(req.body.areasSelecionadas)
      ? req.body.areasSelecionadas
      : JSON.parse(req.body.areasSelecionadas);
  } catch {
    req.session.erro = 'Formato inválido de áreas selecionadas.';
    return res.redirect('/candidatos/editar-areas');
  }

  if (!Array.isArray(nomesSelecionados) || nomesSelecionados.length === 0) {
    req.session.erro = 'Nenhuma área foi selecionada.';
    return res.redirect('/candidatos/editar-areas');
  }
  if (nomesSelecionados.length > 3) {
    req.session.erro = 'Você só pode selecionar até 3 áreas.';
    return res.redirect('/candidatos/editar-areas');
  }

  try {
    const nomesCorrigidos = nomesSelecionados.map(nome => {
      if (nome === 'Outro') {
        const outra = req.body.outra_area_input?.trim();
        if (!outra) {
          throw new Error("Você selecionou 'Outro', mas não preencheu a nova área.");
        }
        return outra;
      }
      return nome;
    });

    const ids = await candidatoModel.buscarIdsDasAreas({ nomes: nomesCorrigidos });
    if (ids.length !== nomesCorrigidos.length) {
      req.session.erro = 'Erro ao localizar todas as áreas selecionadas.';
      return res.redirect('/candidatos/editar-areas');
    }

    await prisma.candidato_area.deleteMany({ where: { candidato_id } });
    await prisma.candidato_area.createMany({
      data: ids.map(area_id => ({ candidato_id, area_interesse_id: area_id }))
    });

    req.session.sucesso = 'Áreas de interesse atualizadas!';
    return res.redirect('/candidatos/meu-perfil');
  } catch (error) {
    console.error('Erro ao salvar áreas de interesse:', error.message);
    req.session.erro = 'Erro ao salvar as áreas de interesse.';
    return res.redirect('/candidatos/editar-areas');
  }
};

exports.exibirComplementarGoogle = async (req, res) => {
  if (!req.session.usuario || req.session.usuario.tipo !== 'candidato') {
    return res.redirect('/login');
  }

  const usuario_id = req.session.usuario.id;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuario_id } });

    res.render('candidatos/cadastro-complementar-google', {
      title: 'Completar Cadastro - Connect Skills',
      erro: null,
      nome: usuario?.nome || '',
      sobrenome: usuario?.sobrenome || '',
      usuario_id
    });
  } catch (error) {
    console.error('Erro ao buscar usuário para complementar cadastro:', error);
    res.render('candidatos/cadastro-complementar-google', {
      title: 'Completar Cadastro - Connect Skills',
      erro: 'Erro ao carregar os dados. Tente novamente.',
      nome: '',
      sobrenome: '',
      usuario_id
    });
  }
};

exports.complementarGoogle = async (req, res) => {
  try {
    const usuarioId = req.session.usuario?.id;
    if (!usuarioId) return res.redirect('/login');

    let { nome, sobrenome, data_nascimento, localidade, foto_perfil } = req.body;
    const [cidade = '', estado = '', pais = ''] = (localidade || '').split(',').map(p => p.trim());

    const { ddi, ddd, numero } = req.body;
    const numeroLimpo = (numero || '').replace(/\D/g, '');
    const numeroFormatado = numeroLimpo.length === 9
      ? `${numeroLimpo.slice(0, 5)}-${numeroLimpo.slice(5)}`
      : numeroLimpo.length === 8
        ? `${numeroLimpo.slice(0, 4)}-${numeroLimpo.slice(4)}`
        : numeroLimpo;

    const telefoneFormatado = (ddd && numeroFormatado)
      ? `${ddi || '+55'} (${ddd}) ${numeroFormatado}`
      : '';

    const dataNascimentoConvertida = new Date(data_nascimento);

    if (!foto_perfil || foto_perfil.trim() === '') {
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { avatarUrl: true }
      });
      foto_perfil = usuario?.avatarUrl || null;
    }

    if (!nome || !sobrenome) {
      req.session.erro = 'Nome e sobrenome são obrigatórios.';
      return res.redirect('/candidatos/cadastro/google/complementar');
    }

    await candidatoModel.complementarCadastroGoogle(usuarioId, {
      nome, sobrenome, data_nascimento: dataNascimentoConvertida,
      pais, estado, cidade, telefone: telefoneFormatado, foto_perfil
    });

    await prisma.usuario.update({ where: { id: usuarioId }, data: { nome, sobrenome } });

    const [candidatoCompleto, usuarioCompleto] = await Promise.all([
      candidatoModel.obterCandidatoPorUsuarioId(usuarioId),
      prisma.usuario.findUnique({ where: { id: usuarioId }, select: { avatarUrl: true } })
    ]);

    req.session.usuario = { id: usuarioId, nome, sobrenome, tipo: 'candidato' };
    req.session.candidato = {
      id: candidatoCompleto.id,
      usuario_id: usuarioId,
      nome: candidatoCompleto.nome,
      sobrenome: candidatoCompleto.sobrenome,
      email: candidatoCompleto.email,
      tipo: 'candidato',
      telefone: candidatoCompleto.telefone,
      dataNascimento: candidatoCompleto.data_nascimento,
      foto_perfil: candidatoCompleto.foto_perfil || usuarioCompleto.avatarUrl || null,
      localidade: `${candidatoCompleto.cidade}, ${candidatoCompleto.estado}, ${candidatoCompleto.pais}`,
      areas: []
    };

    req.session.save(() => res.redirect(`/candidato/cadastro/areas?usuario_id=${usuarioId}`));
  } catch (erro) {
    console.error('Erro ao complementar cadastro com Google:', erro.message, erro);
    req.session.erro = 'Erro ao salvar informações do candidato.';
    res.redirect('/candidatos/cadastro/google/complementar');
  }
};

exports.restaurarFotoGoogle = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  const usuario = await prisma.usuario.findUnique({
    where: { id: sess.usuario_id },
    select: { avatarUrl: true }
  });

  if (!usuario || !usuario.avatarUrl) {
    console.warn('Usuário não tem avatar do Google para restaurar.');
    return res.redirect('/candidato/editar-perfil');
  }

  try {
    await candidatoModel.atualizarFotoPerfil({ candidato_id: sess.id, foto_perfil: usuario.avatarUrl });
    sess.foto_perfil = usuario.avatarUrl;
    req.session.sucesso = 'Foto restaurada com sucesso!';
    res.redirect('/candidato/editar-perfil');
  } catch (err) {
    console.error('Erro ao restaurar foto do Google:', err.message);
    req.session.erro = 'Não foi possível restaurar a foto.';
    res.redirect('/candidato/editar-perfil');
  }
};


exports.avaliarCompatibilidade = async (req, res) => {
  const existe = await prisma.vaga_avaliacao.findFirst({
  where: { vaga_id: vagaId, candidato_id: candidatoId },
  select: { id: true }
  });
  if (existe) {
    return res.status(409).json({
      ok: false,
      error: 'Você já realizou o teste desta vaga.'
    });
  }
  try {
    if (!req.session.candidato) {
      return res.status(401).json({ ok: false, error: 'Não autenticado' });
    }

    const candidatoId = Number(req.session.candidato.id);
    const vagaId = Number(req.params.id);

    // Carrega pergunta/opção da vaga
    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      select: { pergunta: true, opcao: true }
    });
    if (!vaga) return res.status(404).json({ ok: false, error: 'Vaga não encontrada.' });

    // Normaliza perguntas (1 por linha)
    const perguntas = (vaga.pergunta || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    // Lê respostas do body: array (preferencial) ou única
    const { respostas, resposta } = req.body;

    let questions = '';
    if (Array.isArray(respostas)) {
      // une pergunta + resposta em cada linha
      const linhas = perguntas.length
        ? perguntas.map((q, i) => `${q} ${(respostas[i] || '').trim()}`.trim())
        : (respostas.map(r => r.trim()).filter(Boolean)); // fallback se não houver perguntas salvas
      questions = linhas.filter(Boolean).join('\n');
    } else {
      // fallback: usa primeira pergunta + texto único
      const txt = (resposta || '').trim();
      const q0  = perguntas[0] || (vaga.pergunta || 'Pergunta');
      questions = `${q0} ${txt}`.trim();
    }

    if (!questions) {
      return res.status(400).json({ ok: false, error: 'Nenhuma resposta informada.' });
    }

    // Monta items a partir das opções da vaga
    const opcoes = (vaga.opcao || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);

    if (!opcoes.length) {
      return res.status(400).json({ ok: false, error: 'Vaga sem opções configuradas.' });
    }

    const items = opcoes.map((t, i) => `Item ${i + 1}: ${t}`).join('\n');

    // Chama sua API
    const { data } = await axios.post(
      'http://159.203.185.226:4000/suggest',
      { questions, items },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    if (!data || !Array.isArray(data.results)) {
      return res.status(502).json({ ok: false, error: 'Resposta inesperada da IA.' });
    }

    // Nota final (média dos ratings)
    const ratings = data.results
      .map(r => (typeof r.rating === 'number' ? r.rating : null))
      .filter(v => v !== null);

    const score = ratings.length
      ? Math.max(0, Math.min(100, Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)))
      : 0;

    // Salva/atualiza a avaliação
    await prisma.vaga_avaliacao.upsert({
      where: { vaga_candidato_unique: { vaga_id: vagaId, candidato_id: candidatoId } },
      create: {
        vaga_id: vagaId,
        candidato_id: candidatoId,
        score,
        resposta: questions,       
        breakdown: data.results   
      },
      update: {
        score,
        resposta: questions,
        breakdown: data.results
      }
    });
    return res.json({ ok: true, score, results: data.results });
  } catch (err) {
    console.error('Erro ao avaliar compatibilidade:', err?.message || err);
    const reason = err?.code === 'ECONNABORTED'
      ? 'Tempo limite excedido. Tente novamente.'
      : 'Falha ao contatar o serviço de análise.';
    return res.status(500).json({ ok: false, error: reason });
  }
};


exports.avaliarCompatibilidade = async (req, res) => {
  try {
    const sess = req.session.candidato;
    if (!sess) {
      return res.status(401).json({ ok: false, error: 'Não autenticado' });
    }

    const candidato_id = Number(sess.id);
    const vaga_id = Number(req.params.id);

    // Se quiser BLOQUEAR reenvio no back:
    const existente = await prisma.vaga_avaliacao.findFirst({
      where: { vaga_id, candidato_id },
      select: { id: true }
    });
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Você já realizou o teste desta vaga.' });
    }

    // Carrega pergunta/opção
    const vaga = await prisma.vaga.findUnique({
      where: { id: vaga_id },
      select: { pergunta: true, opcao: true }
    });
    if (!vaga) return res.status(404).json({ ok: false, error: 'Vaga não encontrada.' });

    // Perguntas por linha
    const perguntas = (vaga.pergunta || '').split('\n').map(s => s.trim()).filter(Boolean);

    // Body (array de respostas ou única)
    const respostasArray = Array.isArray(req.body.respostas)
      ? req.body.respostas.map(r => String(r || '').trim())
      : null;
    const respostaUnica = typeof req.body.resposta === 'string'
      ? req.body.resposta.trim() : '';

    const temArrayValido = Array.isArray(respostasArray) && respostasArray.some(v => v.length > 0);
    const temUnica = !!respostaUnica;
    if (!temArrayValido && !temUnica) {
      return res.status(400).json({ ok: false, error: 'Resposta é obrigatória.' });
    }

    // Monta `questions`
    let questions = '';
    if (temArrayValido) {
      if (perguntas.length) {
        questions = perguntas.map((q, i) => {
          const r = (respostasArray[i] || '').trim();
          return (q + (r ? ' ' + r : '')).trim();
        }).filter(Boolean).join('\n');
      } else {
        questions = respostasArray.filter(Boolean).join('\n');
      }
    } else {
      const q0 = perguntas[0] || (vaga.pergunta || 'Pergunta');
      questions = (q0 + (respostaUnica ? ' ' + respostaUnica : '')).trim();
    }
    if (!questions) {
      return res.status(400).json({ ok: false, error: 'Nenhuma resposta informada.' });
    }

    // Monta `items` a partir de `opcao` (| separado)
    const opcoes = (vaga.opcao || '').split('|').map(s => s.trim()).filter(Boolean);
    if (!opcoes.length) {
      return res.status(400).json({ ok: false, error: 'Vaga sem opções configuradas.' });
    }
    const items = opcoes.map((t, i) => `Item ${i + 1}: ${t}`).join('\n');

    // Chamada à IA
    const resp = await axios.post(
      'http://159.203.185.226:4000/suggest',
      { questions, items },
      { timeout: 45000, headers: { 'Content-Type': 'application/json' } }
    );

    let raw = resp.data;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) {}
    }

    // Aceita {results}, {result}, {items}, array, ou {data:{results|items}}
    let results =
      (raw && raw.results) ||
      (raw && raw.result)  ||
      (raw && raw.items)   ||
      (raw && raw.data && (raw.data.results || raw.data.items)) ||
      (Array.isArray(raw) ? raw : null);

    if (typeof results === 'string') {
      try { results = JSON.parse(results); } catch (_) {}
    }
    if (!Array.isArray(results)) {
      console.warn('[IA] Formato inesperado:', JSON.stringify(raw).slice(0, 400));
      return res.status(502).json({ ok: false, error: 'Resposta inesperada da IA.' });
    }

    // Normaliza itens e rating
    const normalized = results
      .map((r) => {
        const Item = r?.Item ?? r?.item ?? r?.titulo ?? '';
        let rating = r?.rating ?? r?.score ?? r?.nota;
        if (typeof rating === 'string') {
          const m = rating.match(/-?\d+(\.\d+)?/);
          rating = m ? Number(m[0]) : null;
        }
        if (typeof rating === 'number') {
          if (!Number.isFinite(rating)) rating = null;
          else rating = Math.round(rating);
        }
        return { Item: String(Item), rating };
      })
      .filter(x => x.Item);

    // Score final = média dos ratings válidos
    const ratings = normalized
      .map(x => (typeof x.rating === 'number' ? x.rating : null))
      .filter(v => v !== null);
    const score = ratings.length
      ? Math.max(0, Math.min(100, Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)))
      : 0;

    // Persiste (se quiser sempre sobrescrever, use upsert; se quiser bloquear, já retornamos 409 antes)
    await prisma.vaga_avaliacao.upsert({
      where: { vaga_candidato_unique: { vaga_id, candidato_id } },
      create: { vaga_id, candidato_id, score, resposta: questions, breakdown: normalized },
      update: { score, resposta: questions, breakdown: normalized }
    });

    return res.json({ ok: true, score, results: normalized });
  } catch (err) {
    console.error('Erro ao avaliar compatibilidade:', err?.message || err);
    const reason =
      err?.code === 'ECONNABORTED'
        ? 'Tempo limite excedido. Tente novamente.'
        : 'Falha ao contatar o serviço de análise.';
    return res.status(500).json({ ok: false, error: reason });
  }
};