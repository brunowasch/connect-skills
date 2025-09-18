const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const candidatoModel = require('../models/candidatoModel');
const vagaModel = require('../models/vagaModel');
const { sugerirCompatibilidade } = require('../services/iaClient');
const vagaAvaliacaoModel = require('../models/vagaAvaliacaoModel');
const { cloudinary } = require('../config/cloudinary');

/* =========================
 * Helpers (API de compatibilidade + utilitários)
 * ========================= */
const ensureQmark = (q) => {
  const t = (q || '').trim();
  if (!t) return '';
  return t.endsWith('?') ? t : t + '?';
};

const safeParse = (x) => {
  if (x == null) return x;
  if (typeof x !== 'string') return x;
  const s = x.replace(/^\uFEFF/, '').trim();
  if (!s) return s;
  try { return JSON.parse(s); } catch { return x; }
};

const toRating = (val) => {
  if (val == null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return Math.round(val);
  const m = String(val).match(/-?\d+(\.\d+)?/);
  return m ? Math.round(Number(m[0])) : null;
};

const cleanItem = (t) => String(t ?? '').replace(/^Item\s*\d+\s*:\s*/i, '').trim();

const mapPair = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  const item = obj.Item ?? obj.item ?? obj.titulo ?? obj.title;
  const rating = toRating(obj.rating ?? obj.Rating ?? obj.score ?? obj.nota);
  const txt = cleanItem(item);
  if (!txt) return null;
  return { Item: String(txt), rating: rating ?? null };
};

const normalizeResults = (raw) => {
  let results =
    (raw && typeof raw === 'object' && (raw.results || raw.result || raw.Items || raw.items)) ??
    (Array.isArray(raw) ? raw : null);

  if (typeof results === 'string') {
    results = safeParse(results);
  }

  // Objeto único {Item, rating}
  if (!Array.isArray(results)) {
    const single = mapPair(raw);
    results = single ? [single] : [];
  } else {
    results = results.map(mapPair).filter(Boolean);
  }

  return Array.isArray(results) ? results : [];
};

const avgScore0to100 = (results) => {
  const ratings = results
    .map(x => (typeof x.rating === 'number' ? x.rating : null))
    .filter(v => v !== null);

  return ratings.length
    ? Math.max(0, Math.min(100, Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)))
    : 0;
};

// normalizador de URL para os links do perfil
const normUrl = (u) => {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return 'https://' + s;
  return s;
};

// util tamanho legível
function humanFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  do { bytes /= thresh; ++u; } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

/* =========================
 * Fluxo de cadastro: nome
 * ========================= */
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

/* =========================
 * Fluxo de cadastro: localização
 * ========================= */
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

/* =========================
 * Fluxo de cadastro: telefone
 * ========================= */
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

/* =========================
 * Fluxo de cadastro: foto de perfil
 * ========================= */
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

/* =========================
 * Fluxo de cadastro: áreas
 * ========================= */
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

/* =========================
 * Home e Perfil
 * ========================= */
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
            area_interesse: { select: { nome: true } }
          }
        },
        usuario: {
          select: {
            id: true,
            email: true,
            nome: true,
            sobrenome: true
          }
        },
        // links do perfil
        candidato_link: {
          orderBy: { ordem: 'asc' },
          select: { id: true, label: true, url: true, ordem: true }
        },
        // *** AQUI: anexos (nome do relacionamento correto) ***
        anexos: {
          orderBy: { criadoEm: 'desc' }
        }
      }
    });

    if (!candidato) return res.redirect('/login');

    // formatar telefone (opcional, mantive simples pois já vem pronto na sessão/banco)
    let ddi = '', ddd = '', numero = '';
    if (candidato.telefone) {
      const [ddiRaw, dddRaw, numRaw] = String(candidato.telefone).split('-');
      const clean = v => (v && v !== 'undefined' && v !== 'null') ? String(v).trim() : '';
      ddi = clean(ddiRaw);                // vira '' se vier 'undefined'
      ddd = clean(dddRaw);
      numero = clean(numRaw).replace(/\D/g, '');  // só dígitos
    }

    const numeroFormatado = numero
      ? (numero.length >= 9 ? `${numero.slice(0,5)}-${numero.slice(5,9)}` : numero)
      : '';

    const localidade = [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ');
    const areas = candidato.candidato_area.map(r => r.area_interesse.nome);
    const dataNascimento = candidato.data_nascimento
      ? new Date(candidato.data_nascimento).toISOString().slice(0, 10)
      : '';
    const fotoPerfil = (candidato.foto_perfil && candidato.foto_perfil.trim() !== '')
      ? candidato.foto_perfil.trim()
      : '/img/avatar.png';

    res.render('candidatos/meu-perfil', {
      candidato,
      fotoPerfil,
      localidade,
      areas,
      ddi,
      ddd,
      numeroFormatado,
      dataNascimento,
      activePage: 'perfil',
      links: candidato.candidato_link || [],
      anexos: candidato.anexos || [],
      humanFileSize
    });
  } catch (error) {
    console.error('Erro ao carregar perfil do candidato:', error);
    req.session.erro = 'Erro ao carregar seu perfil.';
    return res.redirect('/candidatos/home');
  }
};

/* =========================
 * Vagas
 * ========================= */
exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.candidato;
  if (!usuario) return res.redirect('/login');
  try {
    const vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(usuario.id);

    // ids de vagas na página
    const vagaIds = vagas.map(v => v.id);
    // pega avaliações existentes do usuário nessas vagas
    const avaliacoes = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id: Number(usuario.id), vaga_id: { in: vagaIds } },
      select: { vaga_id: true, resposta: true }
    });
    const mapAval = new Map(avaliacoes.map(a => [a.vaga_id, a.resposta || '']));

    // ajusta respostas prévias (para inputs e textarea única)
    for (const vaga of vagas) {
      const texto = mapAval.get(vaga.id) || '';
      if (!texto) continue;

      const linhas = texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const apenasRespostas = linhas.map(l => {
        const m = l.match(/\?\s*(.*)$/);
        return m ? m[1].trim() : '';
      }).filter(x => x.length > 0);

      vaga.respostas_previas = apenasRespostas;
      vaga.resposta_unica = apenasRespostas[0] || '';
    }

    res.render('candidatos/vagas', { vagas, activePage: 'vagas' });
  } catch (err) {
    console.error('Erro ao buscar vagas para candidato:', err);
    req.session.erro = 'Erro ao buscar vagas. Tente novamente.';
    res.redirect('/candidatos/home');
  }
};

/* =========================
 * Editar Perfil (inclui links) + anexos no render
 * ========================= */
exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  try {
    const cand = await prisma.candidato.findUnique({
      where: { id: Number(sess.id) },
      include: {
        usuario: { select: { nome: true, sobrenome: true } },
        candidato_link: { orderBy: { ordem: 'asc' } },
        // *** AQUI: anexos (nome do relacionamento correto) ***
        anexos: { orderBy: { criadoEm: 'desc' } }
      }
    });
    if (!cand) return res.redirect('/login');

    const nome = cand.nome || cand.usuario?.nome || '';
    const sobrenome = cand.sobrenome || cand.usuario?.sobrenome || '';

    // telefone
    let ddi = '', ddd = '', numero = '';
    if (cand.telefone) {
      const partes = cand.telefone.split('-');
      ddi = partes[0] || '';
      ddd = partes[1] || '';
      numero = partes[2] || '';
    }

    const numeroFormatado = numero
      ? (numero.length >= 9 ? `${numero.slice(0,5)}-${numero.slice(5)}` : numero)
      : '';

    const localidade = [cand.cidade, cand.estado, cand.pais].filter(Boolean).join(', ');
    const dataNascimento = cand.data_nascimento
      ? new Date(cand.data_nascimento).toISOString().slice(0, 10)
      : '';
    const fotoPerfil = cand.foto_perfil || sess.foto_perfil || '';

    // links atuais
    const links = cand.candidato_link || [];

    res.render('candidatos/editar-perfil', {
      nome,
      sobrenome,
      localidade,
      ddi: ddi || '+55',
      ddd,
      numero: numeroFormatado,
      dataNascimento,
      fotoPerfil,
      links,
      anexos: cand.anexos || [],
      humanFileSize
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
    // foto
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

    // básicos
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

    // sessão
    sess.nome = nome;
    sess.sobrenome = sobrenome;
    sess.localidade = localidade;
    sess.telefone = telefone;
    sess.data_nascimento = dataNascimento;

    /* ===== LINKS ===== */
    const labels = Array.isArray(req.body.link_label)
      ? req.body.link_label
      : (req.body.link_label ? [req.body.link_label] : []);
    const urls = Array.isArray(req.body.link_url)
      ? req.body.link_url
      : (req.body.link_url ? [req.body.link_url] : []);

    const links = [];
    for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
      const label = String(labels[i] || '').trim();
      const url = normUrl(urls[i] || '');
      if (!label && !url) continue;    // ignorar linha vazia
      if (!url) continue;              // precisa ter URL válida
      links.push({ label: label || 'Link', url, ordem: i });
    }
    if (links.length > 5) links.length = 5; // limitar a 5 links

    await candidatoModel.substituirLinksDoCandidato(candidato_id, links);

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

/* =========================
 * Editar Áreas
 * ========================= */
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

/* =========================
 * Complementar Google
 * ========================= */
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

/* =========================
 * Compatibilidade com IA (API formatada robusta)
 * ========================= */
exports.avaliarCompatibilidade = async (req, res) => {
  try {
    // 1) Sessão e ids
    const sess = req.session?.candidato;
    if (!sess) {
      return res.status(401).json({ ok: false, error: 'Não autenticado' });
    }
    const candidato_id = Number(sess.id);
    const vaga_id = Number(req.params.id);

    // 2) Bloquear reenvio
    const existente = await prisma.vaga_avaliacao.findFirst({
      where: { vaga_id, candidato_id },
      select: { id: true }
    });
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Você já realizou o teste desta vaga.' });
    }

    // 3) array {question, answer}), items (descrição do candidato ideal), skills (soft skills)
    const qaRaw = Array.isArray(req.body.qa) ? req.body.qa : [];
    const itemsStr = typeof req.body.items === 'string' ? req.body.items.trim() : '';
    const skillsRaw = Array.isArray(req.body.skills) ? req.body.skills : [];

    // 3.1) Validações mínimas
    const qa = qaRaw
      .map(x => ({
        question: typeof x?.question === 'string' ? x.question.trim() : '',
        answer: typeof x?.answer === 'string' ? x.answer.trim() : ''
      }))
      .filter(x => x.question || x.answer);

    if (!qa.length) {
      return res.status(400).json({ ok: false, error: 'É obrigatório enviar ao menos uma pergunta/resposta em qa.' });
    }
    if (!itemsStr) {
      return res.status(400).json({ ok: false, error: 'Campo "items" (descrição do candidato ideal) é obrigatório.' });
    }

    const skills = skillsRaw
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    // 4) Flatten para salvar em "resposta"
    const lines = qa
      .map(({ question, answer }) => {
        const q = ensureQmark(question);
        const a = (answer || '').trim();
        return [q, a].filter(Boolean).join(' ');
      })
      .filter(Boolean);

    const respostaFlatten = lines.join('\n');
    if (!respostaFlatten) {
      return res.status(400).json({ ok: false, error: 'Nenhuma resposta válida encontrada em qa.' });
    }

    // 5) Chamada à IA com novo payload
    const payload = { qa, items: itemsStr, skills };
    const url = process.env.IA_SUGGEST_URL || 'http://159.203.185.226:4000/suggest';
    const axiosResp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    // 6) Parse + normalização
    const raw = safeParse(axiosResp.data);
    const results = normalizeResults(raw);

    if (!results.length) {
      await prisma.vaga_avaliacao.upsert({
        where: { vaga_candidato_unique: { vaga_id, candidato_id } },
        create: {
          vaga_id,
          candidato_id,
          score: 0,
          resposta: respostaFlatten,
          breakdown: { erro: '[IA] Formato inesperado', raw, payload }
        },
        update: {
          score: 0,
          resposta: respostaFlatten,
          breakdown: { erro: '[IA] Formato inesperado', raw, payload }
        }
      });

      console.warn('[IA] Formato inesperado:', JSON.stringify(raw).slice(0, 800));
      return res.status(422).json({ ok: false, error: '[IA] Formato inesperado', raw });
    }

    // 7) Score final
    const score = avgScore0to100(results);

    // 8) Persistir
    await prisma.vaga_avaliacao.upsert({
      where: { vaga_candidato_unique: { vaga_id, candidato_id } },
      create: {
        vaga_id,
        candidato_id,
        score,
        resposta: respostaFlatten,
        breakdown: { skills, results }
      },
      update: {
        score,
        resposta: respostaFlatten,
        breakdown: { skills, results }
      }
    });

    // 9) Resposta
    return res.json({ ok: true, score, results, skills });
  } catch (err) {
    console.error('Erro ao avaliar compatibilidade:', err?.message || err);
    const reason =
      err?.code === 'ECONNABORTED'
        ? 'Tempo limite excedido. Tente novamente.'
        : 'Falha ao contatar o serviço de análise.';
    return res.status(500).json({ ok: false, error: reason });
  }
};

exports.avaliarVagaIa = async (req, res) => {
  try {
    if (!req.session?.candidato) {
      return res.status(401).json({ ok: false, erro: 'Não autenticado' });
    }

    const candidato_id = Number(req.session.candidato.id);
    const vaga_id = Number(req.params.vagaId);

    // Espera o mesmo contrato do avaliarCompatibilidade “robusto”:
    // req.body.qa (array {question, answer}), req.body.items (string), req.body.skills (array)
    const qaRaw = Array.isArray(req.body.qa) ? req.body.qa : [];
    const itemsStr = typeof req.body.items === 'string' ? req.body.items.trim() : '';
    const skillsRaw = Array.isArray(req.body.skills) ? req.body.skills : [];

    const qa = qaRaw
      .map(x => ({
        question: typeof x?.question === 'string' ? x.question.trim() : '',
        answer: typeof x?.answer === 'string' ? x.answer.trim() : ''
      }))
      .filter(x => x.question || x.answer);

    if (!qa.length) {
      return res.status(400).json({ ok: false, erro: 'É obrigatório enviar ao menos uma pergunta/resposta em qa.' });
    }
    if (!itemsStr) {
      return res.status(400).json({ ok: false, erro: 'Campo "items" (descrição do candidato ideal) é obrigatório.' });
    }

    const skills = skillsRaw
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    const lines = qa
      .map(({ question, answer }) => {
        const q = ensureQmark(question);
        const a = (answer || '').trim();
        return [q, a].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    const respostaFlatten = lines.join('\n');
    if (!respostaFlatten) {
      return res.status(400).json({ ok: false, erro: 'Nenhuma resposta válida encontrada em qa.' });
    }

    const payload = { qa, items: itemsStr, skills };
    const url = process.env.IA_SUGGEST_URL || 'http://159.203.185.226:4000/suggest';
    const axiosResp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const raw = safeParse(axiosResp.data);
    const results = normalizeResults(raw);

    if (!results.length) {
      await prisma.vaga_avaliacao.upsert({
        where: { vaga_candidato_unique: { vaga_id, candidato_id } },
        create: {
          vaga_id,
          candidato_id,
          score: 0,
          resposta: respostaFlatten,
          breakdown: { erro: '[IA] Formato inesperado', raw, payload }
        },
        update: {
          score: 0,
          resposta: respostaFlatten,
          breakdown: { erro: '[IA] Formato inesperado', raw, payload }
        }
      });

      return res.status(422).json({
        ok: false,
        erro: '[IA] Formato inesperado',
        raw
      });
    }

    const media = avgScore0to100(results);

    await prisma.vaga_avaliacao.upsert({
      where: { vaga_candidato_unique: { vaga_id, candidato_id } },
      create: {
        vaga_id,
        candidato_id,
        score: media,
        resposta: respostaFlatten,
        breakdown: { skills, results }
      },
      update: {
        score: media,
        resposta: respostaFlatten,
        breakdown: { skills, results }
      }
    });

    return res.json({ ok: true, score: media, results, skills });
  } catch (err) {
    console.error('[avaliarVagaIa] erro:', err?.message || err);
    return res.status(500).json({ ok: false, erro: 'Erro interno ao avaliar a vaga.' });
  }
};

/* =========================
 * Exclusão de Conta
 * ========================= */
exports.excluirConta = async (req, res) => {
  try {
    const candidato = await prisma.candidato.findUnique({
      where: { id: req.session.candidato.id },
    });

    if (!candidato) {
      req.session.erro = 'Usuário não autenticado.';
      return res.redirect('/login');
    }

    if (!candidato.usuario_id) {
      req.session.erro = 'Usuário não encontrado.';
      return res.redirect('/login');
    }

    console.log('Excluindo candidato:', candidato);

    // Dependências
    await prisma.candidato_area.deleteMany({
      where: { candidato_id: candidato.id },
    });
    await prisma.vaga_avaliacao.deleteMany({
      where: { candidato_id: candidato.id },
    });
    await prisma.candidato_link.deleteMany({
      where: { candidato_id: candidato.id },
    });

    // Candidato
    await prisma.candidato.delete({
      where: { id: candidato.id },
    });

    // Usuário
    await prisma.usuario.delete({
      where: { id: candidato.usuario_id },
    });

    // Sessão
    req.session.destroy((err) => {
      if (err) {
        console.error('Erro ao destruir a sessão:', err);
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error('Erro ao excluir conta do candidato:', err);
    req.session.erro = 'Erro ao excluir conta. Tente novamente.';
    return res.redirect('/candidato/meu-perfil');
  }
};