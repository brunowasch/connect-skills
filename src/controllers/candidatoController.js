const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const candidatoModel = require('../models/candidatoModel');
const vagaModel = require('../models/vagaModel');
const { sugerirCompatibilidade } = require('../services/iaClient');
const vagaAvaliacaoModel = require('../models/vagaAvaliacaoModel');
const { cloudinary } = require('../config/cloudinary');
const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');
const { encodeId, decodeId } = require('../utils/idEncoder');

const escapeNL = (v) => (typeof v === 'string' ? v.replace(/\r?\n/g, '\\n') : v);

const escapeQAArray = (arr) =>
  (Array.isArray(arr) ? arr : []).map(x => ({
    question: escapeNL(x?.question ?? ''),
    answer:   escapeNL(x?.answer   ?? ''),
  }));

const escapeDAArray = (arr) =>
  (Array.isArray(arr) ? arr : []).map(x => ({
    question: escapeNL(x?.question ?? ''),
    answer:   escapeNL(x?.answer   ?? ''),
  }));

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

const normUrl = (u) => {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return 'https://' + s;
  return s;
};

function parseTelefoneBR(telRaw) {
  const tel = (telRaw || '').trim();
  if (!tel) return { ddi: '', ddd: '', numeroFormatado: '' };

  // 1) Nosso formato salvo: +DD-XX-<resto...>
  if (tel.includes('-')) {
    const partes = tel.split('-').map(p => p.trim()).filter(Boolean);
    let ddi = partes[0] || '';
    let ddd = partes[1] || '';
    const resto = partes.slice(2).join('');
    const numeros = resto.replace(/\D/g, '');

    let numeroFormatado = '';
    if (numeros.length >= 9) {
      numeroFormatado = `${numeros.slice(0, 5)}-${numeros.slice(5, 9)}`;
    } else if (numeros.length === 8) {
      numeroFormatado = `${numeros.slice(0, 4)}-${numeros.slice(4, 8)}`;
    } else {
      numeroFormatado = partes.slice(2).join('-'); // fallback
    }

    ddi = ddi.startsWith('+') ? ddi : (ddi ? `+${ddi}` : '+55');
    ddd = ddd.replace(/\D/g, '');
    return { ddi, ddd, numeroFormatado };
  }

  // 2) Formatos soltos: "+55 (51) 99217-9330" etc.
  const m = tel.match(/^(\+\d+)?\s*\(?(\d{2,3})\)?\s*([\d\- ]{7,})$/);
  if (m) {
    const ddi = (m[1] || '+55').trim();
    const ddd = (m[2] || '').trim();
    const numeros = (m[3] || '').replace(/\D/g, '');

    let numeroFormatado = '';
    if (numeros.length >= 9) {
      numeroFormatado = `${numeros.slice(0, 5)}-${numeros.slice(5, 9)}`;
    } else if (numeros.length === 8) {
      numeroFormatado = `${numeros.slice(0, 4)}-${numeros.slice(4, 8)}`;
    } else {
      numeroFormatado = numeros;
    }
    return { ddi, ddd, numeroFormatado };
  }

  // 3) Fallback
  return { ddi: '', ddd: '', numeroFormatado: '' };
}

function sanitizeDdi(ddi) {
  const s = String(ddi || '').toLowerCase().trim();
  if (!s || s.includes('undefined')) return '+55';
  const only = s.replace(/[^+\d]/g, '');
  if (!/\d/.test(only)) return '+55';
  return only.startsWith('+') ? only : `+${only}`;
}

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

async function isVagaFechada(vaga_id) {
  const ultimo = await prisma.vaga_status.findFirst({
    where: { vaga_id: Number(vaga_id) },
    orderBy: { criado_em: 'desc' },
    select: { situacao: true }
  });
  return (ultimo?.situacao || 'aberta').toLowerCase() === 'fechada';
}

exports.telaNomeCandidato = (req, res) => {
  const { uid, usuario_id } = req.query;

  if (!uid && usuario_id && /^\d+$/.test(usuario_id)) {
    const safeUid = encodeId(Number(usuario_id));
    return res.redirect(`/candidatos/cadastro/nome?uid=${safeUid}`);
  }

  if (!uid) {
    req.session.erro = 'Identificador inválido.';
    return res.redirect('/cadastro');
  }

  try {
    const id = decodeId(uid);
    if (!id || !Number.isFinite(id)) throw new Error('uid inválido');
  } catch (err) {
    console.error('Erro ao decodificar UID:', err);
    req.session.erro = 'Link inválido.';
    return res.redirect('/cadastro');
  }

  return res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos', { uid });
};

exports.salvarNomeCandidato = async (req, res) => {
  const rawUid = req.body.uid || req.body.usuario_id || req.query.uid || req.query.usuario_id;
  const usuario_id = typeof rawUid === 'string' && !/^\d+$/.test(rawUid) ? decodeId(rawUid) : Number(rawUid);

  const { nome, sobrenome, data_nascimento } = req.body;

  try {
    await candidatoModel.criarCandidato({
      usuario_id: Number(usuario_id),
      nome,
      sobrenome,
      data_nascimento: new Date(data_nascimento),
    });

    const uid = encodeId(usuario_id);
    return res.redirect(`/candidato/localizacao?uid=${uid}`);
  } catch (err) {
    console.error('Erro ao salvar nome e sobrenome:', err);
    const uid = encodeId(usuario_id);
    req.session.erro = 'Erro ao salvar seus dados iniciais. Tente novamente.';
    return res.redirect(`/candidato/nome?uid=${uid}`);
  }
};

exports.telaLocalizacao = (req, res) => {
  const uid = req.query.uid || null;
  res.render('candidatos/localizacao-login-candidato', { uid });
};

exports.salvarLocalizacao = async (req, res) => {
  const rawUid = req.body.uid || req.body.usuario_id || req.query.uid || req.query.usuario_id;
  const usuario_id = typeof rawUid === 'string' && !/^\d+$/.test(rawUid) ? decodeId(rawUid) : Number(rawUid);
  const uid = usuario_id ? encodeId(usuario_id) : '';

  const { localidade } = req.body;

  if (!usuario_id || !localidade) {
    req.session.erro = 'ID ou localidade ausente.';
    return res.redirect(`/candidato/localizacao?uid=${uid}`);
  }

  const partes = localidade.split(',').map(p => p.trim());
  if (partes.length < 2 || partes.length > 3) {
    req.session.erro = 'Informe uma localidade válida. Ex: cidade e país, ou cidade, estado e país.';
    return res.redirect(`/candidato/localizacao?uid=${uid}`);
  }

  const [cidade, estado = '', pais = ''] = partes;

  try {
    await candidatoModel.atualizarLocalizacao({
      usuario_id: Number(usuario_id),
      cidade,
      estado,
      pais,
    });

    return res.redirect(`/candidato/telefone?uid=${uid}`);
  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    req.session.erro = 'Erro ao salvar localização. Tente novamente.';
    return res.redirect(`/candidato/localizacao?uid=${uid}`);
  }
};

exports.telaTelefone = (req, res) => {
  const uid = req.query.uid || req.body.uid || null;
  res.render('candidatos/telefone', { uid, error: null, telefoneData: {} });
};

exports.salvarTelefone = async (req, res) => {
  const rawUid = req.body.uid || req.query.uid || req.body.usuario_id || req.query.usuario_id;
  const usuario_id = typeof rawUid === 'string' && !/^\d+$/.test(rawUid) ? decodeId(rawUid) : Number(rawUid);
  const uid = usuario_id ? encodeId(usuario_id) : '';

  const { ddi, ddd, telefone } = req.body;
  if (!usuario_id || !ddi || !ddd || !telefone) {
    return res.render('candidatos/telefone', {
      uid,
      error: 'Preencha todos os campos de telefone.',
      telefoneData: { ddi, ddd, telefone }
    });
  }

  const telefoneSemHifen = telefone.replace(/-/g, '');
  const telefoneFormatado = `${ddi}-${ddd}-${telefoneSemHifen}`;

  try {
    await candidatoModel.atualizarTelefone({
      usuario_id: Number(usuario_id),
      telefone: telefoneFormatado
    });
    return res.redirect(`/candidato/cadastro/foto-perfil?uid=${uid}`);
  } catch (err) {
    console.error('Erro ao salvar telefone:', err);
    return res.render('candidatos/telefone', {
      uid,
      error: 'Erro ao salvar telefone. Tente novamente.',
      telefoneData: { ddi, ddd, telefone }
    });
  }
};

exports.telaFotoPerfil = (req, res) => {
  const uid = req.query.uid || req.body.uid || null;
  return res.render('candidatos/foto-perfil', { uid, error: null });
};

exports.salvarFotoPerfil = async (req, res) => {
  const uidValue = req.body.uid || req.query.uid || req.body.usuario_id || req.query.usuario_id;
  const rawUid = Array.isArray(uidValue) ? uidValue[0] : uidValue;
  const usuario_id = typeof rawUid === 'string' && !/^\d+$/.test(rawUid) ? decodeId(rawUid) : Number(rawUid);

  if (isNaN(usuario_id)) {
    console.error('Erro ao salvar foto: ID do usuário inválido ou ausente.', { rawUid });
    return res.render('candidatos/foto-perfil', {
      uid: '',
      error: 'Sessão inválida ou ID do usuário não fornecido. Tente fazer login novamente.'
    });
  }

  const uid = usuario_id ? encodeId(usuario_id) : ''; 

  if (!req.file?.buffer) {
    return res.render('candidatos/foto-perfil', {
      uid,
      error: 'Selecione uma foto antes de continuar.'
    });
  }

  try {
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'connect-skills/candidatos',
      public_id: `foto_candidato_${usuario_id}`,
      overwrite: true
    });

    const caminhoFoto = result.secure_url;

    const candidato = await prisma.candidato.findUnique({ where: { usuario_id: usuario_id } });

    if (!candidato) throw new Error(`Candidato não existe (usuario_id ${usuario_id})`);

    await prisma.candidato.update({
      where: { id: candidato.id },
      data: { foto_perfil: caminhoFoto }
    });

    if (req.session.candidato) {
      req.session.candidato.foto_perfil = caminhoFoto;
    }

    return res.redirect(`/candidato/cadastro/areas?uid=${uid}`);
  } catch (err) {
    console.error('Erro ao salvar foto de perfil:', err);
    return res.render('candidatos/foto-perfil', {
      uid,
      error: 'Erro interno ao salvar a foto. Tente novamente.'
    });
  }
};

exports.telaSelecionarAreas = async (req, res) => {
  try {
    const uid = req.query.uid || req.query.usuario_id || null; 
    const usuario_id = typeof uid === 'string' && !/^\d+$/.test(uid) ? decodeId(uid) : Number(uid);
    const safeUid = usuario_id ? encodeId(usuario_id) : '';

    const areas = await prisma.area_interesse.findMany({
      where: { padrao: true },
      orderBy: { nome: 'asc' }
    });

    res.render('candidatos/selecionar-areas', { uid: safeUid, areas });
  } catch (erro) {
    console.error('Erro ao carregar áreas:', erro);
    const backUid = req.query.uid || '';
    req.session.erro = 'Erro ao carregar áreas. Tente novamente.';
    res.redirect(`/candidato/cadastro/areas?uid=${backUid}`);
  }
};

exports.salvarAreas = async (req, res) => {
  const rawUid = req.body.uid || req.query.uid || req.body.usuario_id || req.query.usuario_id;
  const usuario_id = typeof rawUid === 'string' && !/^\d+$/.test(rawUid) ? decodeId(rawUid) : Number(rawUid);
  const uid = usuario_id ? encodeId(usuario_id) : '';

  const { areasSelecionadas, outra_area_input } = req.body;
  const nomes = JSON.parse(areasSelecionadas || '[]');

  if (nomes.length !== 3) {
    req.session.erro = 'Selecione exatamente 3 áreas válidas.';
    return res.redirect(`/candidato/cadastro/areas?uid=${uid}`);
  }

  try {
    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    if (!candidato) {
      req.session.erro = 'Candidato não encontrado.';
      return res.redirect(`/candidato/cadastro/areas?uid=${uid}`);
    }

    const nomesFinal = [...nomes];
    if (nomes.includes('Outro')) {
      if (!outra_area_input || outra_area_input.trim() === '') {
        req.session.erro = "Você selecionou 'Outro', mas não preencheu a nova área.";
        return res.redirect(`/candidato/cadastro/areas?uid=${uid}`);
      }
      const novaArea = await candidatoModel.upsertNovaArea(outra_area_input.trim());
      const index = nomesFinal.indexOf('Outro');
      nomesFinal.splice(index, 1, novaArea.nome);
    }

    const ids = await candidatoModel.buscarIdsDasAreas({ nomes: nomesFinal });
    if (ids.length !== 3) {
      req.session.erro = 'Erro ao localizar todas as áreas selecionadas.';
      return res.redirect(`/candidato/cadastro/areas?uid=${uid}`);
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
    res.redirect(`/candidatos/cadastro/areas?uid=${uid}`);
  }
};

exports.telaHomeCandidato = async (req, res) => {
  const usuario = req.session.candidato;
  if (!usuario) return res.redirect('/login');

  try {
    // 1) Carrega o candidato do banco com as áreas (garante dados frescos)
    const candDb = await prisma.candidato.findUnique({
      where: { id: Number(usuario.id) }, // aqui é o ID do candidato (não usuario_id)
      include: {
        candidato_area: { include: { area_interesse: true } }
      }
    });

    const areas = (candDb?.candidato_area || [])
      .map(r => r?.area_interesse?.nome)
      .filter(Boolean);

    // 2) Sincroniza sessão (opcional, mas ajuda outras telas)
    try {
      req.session.candidato = {
        ...req.session.candidato,
        // mantém o que já existe…
        nome: candDb?.nome ?? req.session.candidato.nome,
        sobrenome: candDb?.sobrenome ?? req.session.candidato.sobrenome,
        telefone: candDb?.telefone ?? req.session.candidato.telefone,
        data_nascimento: candDb?.data_nascimento ?? req.session.candidato.data_nascimento,
        foto_perfil: candDb?.foto_perfil ?? req.session.candidato.foto_perfil,
        localidade:
          req.session.candidato.localidade ||
          [candDb?.cidade, candDb?.estado, candDb?.pais].filter(Boolean).join(', '),
        areas // <- importante para a view e para outras páginas
      };
    } catch (e) {
      // segue o baile mesmo se não conseguir salvar sessão agora
      console.warn('[home] não foi possível atualizar sessão do candidato:', e?.message || e);
    }

    // 3) Vagas recomendadas
    let vagas = [];
    try {
      // usa o ID do candidato (não usuario_id)
      vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(Number(usuario.id));
    } catch (e) {
      console.warn('[home] falha ao buscar vagas recomendadas:', e.message);
      vagas = [];
    }

    // 4) Histórico (aplicações do candidato)
    const avaliacoes = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id: Number(usuario.id) },
      orderBy: { id: 'desc' },
      include: {
        vaga: {
          include: {
            empresa: {
              select: { id: true, nome_empresa: true, foto_perfil: true, cidade: true, estado: true, pais: true }
            }
          }
        }
      }
    });

    // Simplifica para o widget da home (usa os campos que a view espera)
    const historico = (avaliacoes || [])
      .filter(a => a.vaga) // evita órfãos
      .map(a => {
        const v = a.vaga;
        const emp = v.empresa || {};
        return {
          vaga: { id: v.id, cargo: v.cargo },
          empresa: { id: emp.id, nome: emp.nome_empresa, nome_empresa: emp.nome_empresa },
          created_at: a.created_at || a.criado_em || new Date().toISOString(),
          status: a.status || 'em_analise'
        };
      });

      const appliedIds = new Set(historico.map(h => h.vaga.id));
      vagas = (vagas || []).filter(v => !appliedIds.has(v.id));

    // 5) Render da home — agora passando 'areas' para a view
    res.render('candidatos/home-candidatos', {
      nome: req.session.candidato.nome,
      sobrenome: req.session.candidato.sobrenome,
      localidade:
        req.session.candidato.localidade ||
        [candDb?.cidade, candDb?.estado, candDb?.pais].filter(Boolean).join(', '),
      activePage: 'home',

      // objetos que a view já usa
      usuario: req.session.usuario || req.session.candidato, // mantém compatibilidade com includes
      candidato: req.session.candidato, // contém .areas atualizadas
      vagas,
      historico,
      candidaturasAplicadasCount: historico.length,

      // chave ESSENCIAL para a barra de progresso reconhecer as áreas
      areas
    });
  } catch (err) {
    console.error('[telaHomeCandidato] erro:', err?.message || err);
    req.session.erro = 'Não foi possível carregar sua home.';
    return res.redirect('/login');
  }
};

exports.renderMeuPerfil = async (req, res) => {
  const candidatoSessao =
    req.session.candidato ||
    (req.session.usuario?.tipo === 'candidato' ? req.session.usuario : null);
  if (!candidatoSessao) return res.redirect('/login');

  try {
    const candidato = await prisma.candidato.findUnique({
      where: { id: Number(candidatoSessao.id) },
      include: {
        candidato_area: {
          include: { area_interesse: { select: { id: true, nome: true } } }
        },
        usuario: { select: { id: true, email: true, nome: true, sobrenome: true } },
        candidato_link: { orderBy: { ordem: 'asc' }, select: { id: true, label: true, url: true, ordem: true } },
        candidato_arquivo: {
          orderBy: { criadoEm: 'desc' },
          select: { id: true, nome: true, mime: true, tamanho: true, url: true, criadoEm: true }
        },
        vaga_avaliacao: true
      }
    });

    if (!candidato) {
      return res.status(404).render('shared/404', { mensagem: 'Candidato não encontrado.' });
    }

    const areas = (candidato.candidato_area || [])
      .map((ca) => ca.area_interesse?.nome)
      .filter(Boolean);

    const fotoPerfil =
      (candidato.foto_perfil && String(candidato.foto_perfil).trim() !== '')
        ? String(candidato.foto_perfil).trim()
        : '/img/avatar.png';

    const localidade =
      [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ')
      || (req.session?.candidato?.localidade || '');

    const arquivos = candidato.candidato_arquivo || [];
    const anexos = arquivos;

    // ---------- TELEFONE (robusto) ----------
    function parseTelefoneBR(telRaw) {
      const tel = (telRaw || '').trim();
      if (!tel) return { ddi: '', ddd: '', numeroFormatado: '' };

      // 1) Formato normalizado por nós: +DD-XX-<resto...>
      if (tel.includes('-')) {
        const partes = tel.split('-').map(p => p.trim()).filter(Boolean);
        let ddi = partes[0] || '';
        let ddd = partes[1] || '';
        const resto = partes.slice(2).join('');
        const numeros = resto.replace(/\D/g, '');

        let numeroFormatado = '';
        if (numeros.length >= 9) {
          numeroFormatado = `${numeros.slice(0, 5)}-${numeros.slice(5, 9)}`;
        } else if (numeros.length === 8) {
          numeroFormatado = `${numeros.slice(0, 4)}-${numeros.slice(4, 8)}`;
        } else {
          numeroFormatado = partes.slice(2).join('-');
        }

        ddi = ddi.startsWith('+') ? ddi : (ddi ? `+${ddi}` : '+55');
        ddd = ddd.replace(/\D/g, '');

        return { ddi, ddd, numeroFormatado };
      }

      // 2) Formatos soltos, ex: "+55 (51) 99217-9330"
      const m = tel.match(/^(\+\d+)?\s*\(?(\d{2,3})\)?\s*([\d\- ]{7,})$/);
      if (m) {
        const ddi = (m[1] || '+55').trim();
        const ddd = (m[2] || '').trim();
        const numeros = (m[3] || '').replace(/\D/g, '');

        let numeroFormatado = '';
        if (numeros.length >= 9) {
          numeroFormatado = `${numeros.slice(0, 5)}-${numeros.slice(5, 9)}`;
        } else if (numeros.length === 8) {
          numeroFormatado = `${numeros.slice(0, 4)}-${numeros.slice(4, 8)}`;
        } else {
          numeroFormatado = numeros;
        }
        return { ddi, ddd, numeroFormatado };
      }

      // 3) Fallback genérico
      return { ddi: '', ddd: '', numeroFormatado: '' };
    }

    function sanitizeDdi(ddi) {
      const s = String(ddi || '').toLowerCase().trim();
      if (!s || s.includes('undefined')) return '+55';
      const only = s.replace(/[^+\d]/g, '');
      if (!/\d/.test(only)) return '+55';
      return only.startsWith('+') ? only : `+${only}`;
    }

    let { ddi, ddd, numeroFormatado } = parseTelefoneBR(candidato.telefone);
    ddi = sanitizeDdi(ddi);

    // ---------- IDs/URL criptografados (para botão copiar link) ----------
    const encCandidatoId = encodeId(Number(candidato.id));
    const perfilShareUrl = `${req.protocol}://${req.get('host')}/candidatos/perfil/${encCandidatoId}`;

    res.render('candidatos/meu-perfil', {
      candidato,
      usuario: candidato.usuario,
      areas,
      links: candidato.candidato_link || [],
      arquivos,
      anexos,
      fotoPerfil,
      localidade,
      humanFileSize,
      ddi,
      ddd,
      numeroFormatado,
      encCandidatoId,
      perfilShareUrl,
    });
  } catch (err) {
    console.error('Erro em renderMeuPerfil:', err);
    return res.status(500).render('shared/500', { erro: err?.message || 'Erro interno' });
  }
};


exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.candidato;
  if (!usuario) return res.redirect('/login');

  const q = (req.query.q || '').trim();
  const ordenar = (req.query.ordenar || 'recentes').trim();

  try {
    let vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(usuario.id);

    vagas = await prisma.vaga.findMany({
      where: { id: { in: vagas.map(v => v.id) } },
      include: {
        empresa: true,
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        vaga_arquivo: true,
        vaga_link: true,
      }
    });

    // filtra somente vagas abertas
    const vagaIds = vagas.map(v => v.id);
    let abertasSet = new Set(vagaIds);
    if (vagaIds.length) {
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: vagaIds } },
        orderBy: { criado_em: 'desc' },
        select: { vaga_id: true, situacao: true }
      });
      const latest = new Map();
      for (const s of statusList) {
        if (!latest.has(s.vaga_id)) latest.set(s.vaga_id, (s.situacao || 'aberta').toLowerCase());
      }
      abertasSet = new Set(
        vagaIds.filter(id => (latest.get(id) || 'aberta') !== 'fechada')
      );
    }
    vagas = vagas.filter(v => abertasSet.has(v.id));

    // filtro por busca (cargo, descrição, empresa ou áreas)
    if (q) {
      const termo = q.toLowerCase();
      vagas = vagas.filter(v =>
        v.cargo?.toLowerCase().includes(termo) ||
        v.descricao?.toLowerCase().includes(termo) ||
        v.empresa?.nome_empresa?.toLowerCase().includes(termo) ||
        v.vaga_area?.some(rel => rel.area_interesse?.nome?.toLowerCase().includes(termo))
      );
    }

    const aplicadas = await prisma.vaga_avaliacao.findMany({
    where: { candidato_id: Number(usuario.id) },
    select: { vaga_id: true }
    });

    const appliedSet = new Set(aplicadas.map(a => a.vaga_id));
    vagas = (vagas || []).filter(v => !appliedSet.has(v.id));

    switch (ordenar) {
      case 'antigos':
        vagas.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'mais_salario':
        vagas.sort((a, b) => (b.salario || 0) - (a.salario || 0));
        break;
      case 'menos_salario':
        vagas.sort((a, b) => (a.salario || 0) - (b.salario || 0));
        break;
      default:
        vagas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const vagaIdsAbertas = vagas.map(v => v.id);
    const avaliacoes = vagaIdsAbertas.length
      ? await prisma.vaga_avaliacao.findMany({
          where: { candidato_id: Number(usuario.id), vaga_id: { in: vagaIdsAbertas } },
          select: { vaga_id: true, resposta: true }
        })
      : [];
    const mapAval = new Map(avaliacoes.map(a => [a.vaga_id, a.resposta || '']));
    for (const vaga of vagas) {
      const texto = mapAval.get(vaga.id) || '';
      if (!texto) continue;
      const linhas = texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const apenasRespostas = linhas.map(l => {
        const m = l.match(/\?\s*(.*)$/);
        return m ? m[1].trim() : '';
      }).filter(Boolean);
      vaga.respostas_previas = apenasRespostas;
      vaga.resposta_unica = apenasRespostas[0] || '';
    }

    const cand = await prisma.candidato.findUnique({
    where: { id: Number(usuario.id) },
    include: { candidato_area: { include: { area_interesse: true } } }
  });
  const areas = (cand?.candidato_area || [])
    .map(r => r.area_interesse?.nome)
    .filter(Boolean);

  res.render('candidatos/vagas', {
    vagas,
    filtros: { q, ordenar },
    activePage: 'vagas',
    candidato: req.session.candidato,
    areas
  });
  } catch (err) {
    console.error('Erro ao buscar vagas para candidato:', err);
    req.session.erro = 'Erro ao buscar vagas. Tente novamente.';
    res.redirect('/candidatos/home');
  }
};

exports.historicoAplicacoes = async (req, res) => {
  try {
    const sess = req.session?.candidato;
    if (!sess) return res.redirect('/login');
    const candidato_id = Number(sess.id);

    const q = (req.query.q || '').trim();
    const ordenar = (req.query.ordenar || 'recentes').trim();

    const avaliacoes = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id },
      orderBy: { id: 'desc' },
      include: {
        vaga: {
          include: {
            empresa: {
              select: { id: true, nome_empresa: true, foto_perfil: true, cidade: true, estado: true, pais: true }
            },
            vaga_area:       { include: { area_interesse: { select: { id: true, nome: true } } } },
            vaga_soft_skill: { include: { soft_skill:     { select: { id: true, nome: true } } } },
          }
        }
      }
    });

    // Nada aplicado ainda (ou antes de filtrar)
    if (!avaliacoes.length) {
      return res.render('candidatos/historico-aplicacoes', {
        items: [],
        filtros: { q, ordenar },
        activePage: 'vagas',
      });
    }

    // Status atual por vaga
    const vagaIds = [...new Set(avaliacoes.map(a => a.vaga?.id).filter(Boolean))];
    let statusMap = new Map();
    if (vagaIds.length) {
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: vagaIds } },
        orderBy: { criado_em: 'desc' },
        select: { vaga_id: true, situacao: true }
      });
      for (const s of statusList) {
        if (!statusMap.has(s.vaga_id)) statusMap.set(s.vaga_id, (s.situacao || 'aberta').toLowerCase());
      }
    }

    // Helpers para montar perguntas/respostas completas
    const tryParseJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };
    const ensureQmark = (str) => {
      const t = String(str || '').trim();
      if (!t) return '';
      return t.replace(/\s*([?.!…:])?\s*$/, '?');
    };

    // Normaliza dados para a view
    let items = avaliacoes
      .filter(a => a.vaga) // evita órfãos
      .map(a => {
        const v = a.vaga;
        const empresa = v.empresa || {};
        const publicadoEm = v.created_at ? new Date(v.created_at) : null;
        const publicadoEmBR = publicadoEm
          ? publicadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '-';

        const areas  = (v.vaga_area || []).map(x => x.area_interesse?.nome).filter(Boolean);
        const skills = (v.vaga_soft_skill || []).map(x => x.soft_skill?.nome).filter(Boolean);

        let beneficios = [];
        if (Array.isArray(v.beneficio)) beneficios = v.beneficio;
        else if (v.beneficio) beneficios = String(v.beneficio).split(/[|,]/).map(s => s.trim()).filter(Boolean);

        // 1) Tenta montar do breakdown (qa/da) — fonte de verdade
        const breakdown = typeof a.breakdown === 'string' ? (tryParseJSON(a.breakdown) || {}) : (a.breakdown || {});
        const qa = Array.isArray(breakdown?.qa) ? breakdown.qa : [];
        const da = Array.isArray(breakdown?.da) ? breakdown.da : [];

        let respostas = [];
        if (da.length || qa.length) {
          const toItem = (r) => ({
            pergunta: ensureQmark(r?.question || ''),
            resposta: String(r?.answer || '').trim()
          });
          // Prioriza DA (DISC/Auto) e depois QA (extras), preservando ordem
          respostas = [
            ...da.filter(x => x && (x.question || x.answer)).map(toItem),
            ...qa.filter(x => x && (x.question || x.answer)).map(toItem),
          ];
        }

        // 2) Fallback: texto consolidado salvo em a.resposta (linhas "pergunta? resposta")
        if (!respostas.length) {
          const respostasTexto = String(a.resposta || '').trim();
          if (respostasTexto) {
            respostas = respostasTexto
              .replace(/\r\n/g, '\n')
              .replace(/\\r\\n/g, '\n')
              .replace(/\\n/g, '\n')
              .split('\n')
              .map(l => l.trim())
              .filter(Boolean)
              .map(l => {
                const idx = l.indexOf('?');
                if (idx !== -1) {
                  const pergunta = ensureQmark(l.slice(0, idx + 1).trim());
                  const resposta = l.slice(idx + 1).trim();
                  return { pergunta, resposta };
                }
                return { pergunta: '', resposta: l };
              });
          }
        }

        const statusAtual = statusMap.get(v.id) || 'aberta';

        return {
          idAvaliacao: a.id,
          score: a.score ?? 0,
          created_at: v.created_at || a.created_at || a.criado_em || null, // usado para ordenar
          vaga: {
            id: v.id,
            cargo: v.cargo,
            descricao: v.descricao,
            tipo: v.tipo_local_trabalho,
            escala: v.escala_trabalho,
            diasPresenciais: v.dias_presenciais ?? null,
            diasHomeOffice: v.dias_home_office ?? null,
            salario: v.salario ?? null,
            moeda: v.moeda || '',
            publicadoEmBR,
            beneficios,
            areas,
            skills,
            statusAtual,
          },
          empresa: {
            id: empresa.id,
            nome: empresa.nome_empresa,
            foto: (empresa.foto_perfil && !['null','undefined'].includes(String(empresa.foto_perfil).trim()))
            ? empresa.foto_perfil
            : '/img/empresa-padrao.png',
            localidade: [empresa.cidade, empresa.estado, empresa.pais].filter(Boolean).join(', '),
          },
          respostas
        };
      });

    if (q) {
      const termo = q.toLowerCase();
      items = items.filter(it =>
        it.vaga.cargo?.toLowerCase().includes(termo) ||
        it.vaga.descricao?.toLowerCase().includes(termo) ||
        it.empresa?.nome?.toLowerCase().includes(termo) ||
        (it.vaga.areas || []).some(nome => nome?.toLowerCase().includes(termo))
      );
    }

    switch (ordenar) {
      case 'antigos':
        items.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        break;
      case 'mais_salario':
        items.sort((a, b) => (b.vaga.salario || 0) - (a.vaga.salario || 0));
        break;
      case 'menos_salario':
        items.sort((a, b) => (a.vaga.salario || 0) - (b.vaga.salario || 0));
        break;
      default:
        items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return res.render('candidatos/historico-aplicacoes', {
      items,
      filtros: { q, ordenar },
      activePage: 'vagas',
    });
  } catch (err) {
    console.error('[historicoAplicacoes] erro:', err?.message || err);
    req.session.erro = 'Não foi possível carregar seu histórico.';
    return res.redirect('/candidatos/vagas/historico');
  }
};


exports.telaEditarPerfil = async (req, res) => {
  if (!req.session.candidato) return res.redirect('/login');

  try {
    const cand = await prisma.candidato.findUnique({
      where: { id: req.session.candidato.id },
      include: {
        candidato_link: true,
        candidato_arquivo: { orderBy: { criadoEm: 'desc' } }
      }
    });

    if (!cand) return res.redirect('/login');

    const arquivos = cand.candidato_arquivo || [];
    const anexos = arquivos;
    const partes = (cand.telefone || '').split('-');
    const ddd = partes[1] || '';
    const numero = partes.length > 2 ? partes.slice(2).join('-') : '';

    res.render('candidatos/editar-perfil', {
      nome: cand.nome || '',
      sobrenome: cand.sobrenome || '',
      localidade: cand.cidade ? `${cand.cidade}, ${cand.estado}, ${cand.pais}` : '',
      ddd,
      numero,
      dataNascimento: cand.data_nascimento ? cand.data_nascimento.toISOString().split('T')[0] : '',
      fotoPerfil: cand.foto_perfil || '',
      links: cand.candidato_link || [],
      anexos,
      arquivos,
      humanFileSize,
      descricao: cand.descricao || ''
    }); 
  } catch (err) {
    console.error('Erro ao carregar tela editar perfil:', err);
    res.status(500).send('Erro interno do servidor');
  }
};

exports.salvarEditarPerfil = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');

  const candidato_id = Number(sess.id);
  const { nome, sobrenome, localidade, ddi, ddd, numero, dataNascimento, removerFoto, descricao } = req.body;

  const nomeTrim       = (nome || '').trim();
  const sobrenomeTrim  = (sobrenome || '').trim();
  const localidadeTrim = (localidade || '').trim();
  const dddTrim        = (ddd || '').replace(/\D/g, '');        // só dígitos
  const numeroTrim     = (numero || '').replace(/\D/g, '');     // só dígitos para validação
  const numeroVisivel  = (numero || '').trim().replace(/[^\d-]/g, ''); // mantém hífen do usuário

  // Só consideramos telefone se tiver DDD (>=2) e número com >=8 dígitos
  const hasTelefone = (dddTrim.length >= 2 && numeroTrim.length >= 8);

  // Localidade (só se veio algo)
  let cidade, estado, pais;
  if (localidadeTrim) {
    const partes = localidadeTrim.split(',').map(s => s.trim());
    [cidade = '', estado = '', pais = ''] = partes;
  }

  // DateTime: converter string -> Date apenas se for válida
  let parsedDate = null;
  if (typeof dataNascimento === 'string' && dataNascimento.trim()) {
    const d = new Date(dataNascimento.trim());
    if (!isNaN(d.getTime())) parsedDate = d; // válido
  }

  try {
    // Foto
    if (removerFoto) {
      await candidatoModel.atualizarFotoPerfil({ candidato_id, foto_perfil: null });
      sess.foto_perfil = '/img/avatar.png';
    } else if (req.file && req.file.buffer) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'connect-skills/candidatos',
            public_id: `foto_candidato_${candidato_id}`,
            overwrite: true,
            resource_type: 'image'
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(req.file.buffer);
      });
      sess.foto_perfil = uploadResult.secure_url;
      await candidatoModel.atualizarFotoPerfil({ candidato_id, foto_perfil: sess.foto_perfil });
    }

    // Atualização parcial
    const updateData = {};
    if (nomeTrim) updateData.nome = nomeTrim;
    if (sobrenomeTrim) updateData.sobrenome = sobrenomeTrim;
    if (parsedDate) updateData.data_nascimento = parsedDate;
    if (localidadeTrim && (cidade || estado || pais)) {
      updateData.cidade = cidade || null;
      updateData.estado = estado || null;
      updateData.pais   = pais   || null;
    }
    if (hasTelefone) {
      const ddiFinal = (ddi || '+55').toString().trim() || '+55';
      // Guarda exatamente como o usuário digitou (com hífen no meio do número)
      updateData.telefone = `${ddiFinal}-${dddTrim}-${numeroVisivel}`;
    }
    if (typeof descricao === 'string') {
      const descTrim = descricao.trim();
      updateData.descricao = descTrim.length ? descTrim : null;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.candidato.update({
        where: { id: candidato_id },
        data: updateData
      });

      // Atualiza sessão só com o que persistiu
      if (updateData.nome) sess.nome = updateData.nome;
      if (updateData.sobrenome) sess.sobrenome = updateData.sobrenome;
      if (localidadeTrim && (cidade || estado || pais)) {
        const locPieces = [];
        if (cidade) locPieces.push(cidade);
        if (estado) locPieces.push(estado);
        if (pais)   locPieces.push(pais);
        sess.localidade = locPieces.join(', ');
      }
      if (updateData.telefone) sess.telefone = updateData.telefone;
      if (updateData.data_nascimento) sess.data_nascimento = updateData.data_nascimento;
    }

    // LINKS — substitui só se houver ao menos 1 URL válida
    const urls = Array.isArray(req.body['link_url[]'])
      ? req.body['link_url[]']
      : Array.isArray(req.body.link_url)
        ? req.body.link_url
        : (req.body.link_url ? [req.body.link_url] : []);

    const links = [];
    for (let i = 0; i < urls.length; i++) {
      const url = normUrl(urls[i] || '');
      if (!url) continue;
      links.push({ label: 'Link', url, ordem: i });
    }
    if (links.length > 5) links.length = 5;
    if (links.length > 0) {
      await candidatoModel.substituirLinksDoCandidato(candidato_id, links);
    }

    req.session.sucessoPerfil = 'Perfil atualizado com sucesso!';
    res.redirect('/candidatos/meu-perfil');
  } catch (err) {
    console.error('Erro ao atualizar perfil básico:', err);

    // Recarrega dados atuais para não quebrar a view
    let cand = null;
    try {
      cand = await prisma.candidato.findUnique({
        where: { id: candidato_id },
        include: {
          candidato_link: true,
          candidato_arquivo: { orderBy: { criadoEm: 'desc' } }
        }
      });
    } catch {}

    const arquivos = cand?.candidato_arquivo || [];
    const anexos   = arquivos;
    const links    = cand?.candidato_link   || [];

    res.status(500).render('candidatos/editar-perfil', {
      nome,
      sobrenome,
      localidade,
      ddd,
      numero, // mantém o que o usuário digitou (com hífen) em caso de erro
      dataNascimento,
      fotoPerfil: sess.foto_perfil,
      links,
      anexos,
      arquivos,
      humanFileSize,
      descricao,
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
      activePage: 'editar-areas',
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
  try {
    const sess = req.session?.candidato;
    if (!sess) {
      return res.status(401).json({ ok: false, error: 'Não autenticado' });
    }
    const candidato_id = Number(sess.id);
    const vaga_id = Number(req.params.id);

    if (await isVagaFechada(vaga_id)) {
      return res.status(403).json({ ok: false, error: 'Esta vaga está fechada no momento.' });
    }

    const existente = await prisma.vaga_avaliacao.findFirst({
      where: { vaga_id, candidato_id },
      select: { id: true }
    });
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Você já realizou o teste desta vaga.' });
    }

    const qaRaw = Array.isArray(req.body.qa) ? req.body.qa : [];
    let itemsStr = typeof req.body.items === 'string' ? req.body.items.trim() : '';
    const skillsRaw = Array.isArray(req.body.skills) ? req.body.skills : [];

    if (!itemsStr) {
      const vagaDb = await prisma.vaga.findUnique({
        where: { id: vaga_id },
        select: { descricao: true }
      });
      if (vagaDb?.descricao?.trim()) {
        itemsStr = vagaDb.descricao.trim();
      }
    }

    const qaNormalized = qaRaw
      .map(x => ({
        question: typeof x?.question === 'string' ? x.question.trim() : '',
        answer:   typeof x?.answer   === 'string' ? x.answer.trim()   : ''
      }))
      .filter(x => x.question || x.answer);

    let skills = skillsRaw
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    if (!skills.length) {
      const vagaDbSkills = await prisma.vaga.findUnique({
        where: { id: vaga_id },
        select: { vaga_soft_skill: { include: { soft_skill: true } } }
      });
      skills = (vagaDbSkills?.vaga_soft_skill || [])
        .map(vs => vs.soft_skill?.nome)
        .filter(Boolean);
    }

    const discQuestions = (getDiscQuestionsForSkills(skills) || []).map(q =>
      String(q || '').trim().toLowerCase()
    );

    const findAnswer = (question) => {
      const qnorm = String(question || '').trim().toLowerCase();
      const hit = qaNormalized.find(item => String(item.question || '').trim().toLowerCase() === qnorm);
      return hit ? String(hit.answer || '').trim() : '';
    };

    const da = (getDiscQuestionsForSkills(skills) || []).map(q => ({
      question: q,
      answer: findAnswer(q)
    }));

    const qa = qaNormalized.filter(item => {
      const key = String(item.question || '').trim().toLowerCase();
      return key && !discQuestions.includes(key);
    });

    if (!qa.length && !(da.some(x => (x.answer || '').trim()))) {
      // exige pelo menos algo respondido em QA não-DISC ou em DA (DISC)
      return res.status(400).json({ ok: false, error: 'É obrigatório enviar ao menos uma pergunta respondida.' });
    }
    if (!itemsStr) {
      return res.status(400).json({ ok: false, error: 'Campo "items" (descrição do candidato ideal) é obrigatório.' });
    }

    const ensureQmark = (s) => String(s||'').trim().replace(/\s*([?.!…:])?\s*$/, '?');

    const toLine = ({ question, answer }) => {
      const q = ensureQmark(question || '');
      const a = (answer || '').trim();
      return [q, a || '—'].join(' ');
    };


    const linesDa = (da || [])
      .filter(x => (x.question || '').trim())
      .map(toLine);

    const linesQa = (qa || [])
      .filter(x => (x.question || '').trim())
      .map(toLine);

    // agora "resposta" inclui TUDO, garantindo que o modal liste todas as perguntas
    const respostaFlattenAll = [...linesDa, ...linesQa].filter(Boolean).join('\n');

    // --- ESCAPE APENAS PARA O PAYLOAD ENVIADO --- //
    const payload = {
      qa:     escapeQAArray(qa),
      items:  escapeNL(itemsStr),
      skills: skills,
      da:     escapeDAArray(da)
    };

    console.log('[Compat] Payload a enviar para /suggest:', JSON.stringify(payload, null, 2));

    const url = process.env.IA_SUGGEST_URL || 'http://159.203.185.226:4000/suggest';
    const axiosResp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    // ---------- NORMALIZAÇÃO DA RESPOSTA ----------
    const respData = (axiosResp && typeof axiosResp === 'object') ? axiosResp.data : axiosResp;
    const raw = safeParse(respData);
    const results = normalizeResults(raw);

    // 1) Novo formato DISC (score + score_D/I/S/C)
    const isDisc =
      raw && typeof raw === 'object' &&
      typeof raw.score === 'number' &&
      ['score_D', 'score_I', 'score_S', 'score_C'].every(k => typeof raw[k] === 'number');

    if (!results.length && isDisc) {
      const score = Math.max(0, Math.min(100, Number(raw.score) || 0));

      await vagaAvaliacaoModel.upsertAvaliacao({
        vaga_id,
        candidato_id,
        score,
        // salva TODAS as perguntas no texto consolidado
        resposta: respostaFlattenAll,
        // guarda DISC + extras + as perguntas originais para renderização completa
        breakdown: { ...raw, skills, qa, da }
      });

      return res.json({
        ok: true,
        score,
        score_D: Number(raw.score_D) || 0,
        score_I: Number(raw.score_I) || 0,
        score_S: Number(raw.score_S) || 0,
        score_C: Number(raw.score_C) || 0,
        matchedSkills: Array.isArray(raw.matchedSkills) ? raw.matchedSkills : [],
        suggestions:  Array.isArray(raw.suggestions)  ? raw.suggestions  : [],
        explanation:  raw.explanation || '',
        skills
      });
    }

    // 2) Formato antigo baseado em results (mapPair + média)
    if (results.length) {
      const score = avgScore0to100(results);

      await vagaAvaliacaoModel.upsertAvaliacao({
        vaga_id,
        candidato_id,
        score,
        resposta: respostaFlattenAll,
        breakdown: { skills, results, qa, da }
      });

      return res.json({ ok: true, score, results, skills });
    }

    // 3) Nenhum formato reconhecido
    await vagaAvaliacaoModel.upsertAvaliacao({
      vaga_id,
      candidato_id,
      score: 0,
      resposta: respostaFlattenAll,
      breakdown: { erro: '[IA] Formato inesperado', raw, payload, qa, da, skills }
    });

    try {
      console.warn('[IA] Formato inesperado:', JSON.stringify(raw).slice(0, 800));
    } catch {
      console.warn('[IA] Formato inesperado (string):', String(raw).slice(0, 800));
    }
    return res.status(422).json({ ok: false, error: '[IA] Formato inesperado', raw });

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

    if (await isVagaFechada(vaga_id)) {
      return res.status(403).json({ ok: false, erro: 'Esta vaga está fechada no momento.' });
    }

    const qaRaw = Array.isArray(req.body.qa) ? req.body.qa : [];
    let itemsStr = typeof req.body.items === 'string' ? req.body.items.trim() : '';
    const skillsRaw = Array.isArray(req.body.skills) ? req.body.skills : [];

    if (!itemsStr) {
      const vagaDb = await prisma.vaga.findUnique({
        where: { id: vaga_id },
        select: { descricao: true }
      });
      if (vagaDb?.descricao?.trim()) {
        itemsStr = vagaDb.descricao.trim();
      }
    }

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

    let skills = skillsRaw
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    if (!skills.length) {
      const vagaDbSkills = await prisma.vaga.findUnique({
        where: { id: vaga_id },
        select: { vaga_soft_skill: { include: { soft_skill: true } } }
      });
      skills = (vagaDbSkills?.vaga_soft_skill || [])
        .map(vs => vs.soft_skill?.nome)
        .filter(Boolean);
    }

    const findAnswer = (question) => {
      const qnorm = String(question || '').trim().toLowerCase();
      const hit = qa.find(item => String(item.question || '').trim().toLowerCase() === qnorm);
      return hit ? String(hit.answer || '').trim() : '';
    };

    const seen = new Set();
    let da = [];

    // DISC
    for (const skillName of skills) {
      const discQs = getDiscQuestionsForSkills([skillName]) || [];
      for (const q of discQs) {
        const key = String(q).trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          da.push({ question: q, answer: findAnswer(q) });
        }
      }
    }

    // Personalizadas
    for (const { question } of qa) {
      const key = String(question || '').trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        da.push({ question, answer: findAnswer(question) });
      }
    }

    // texto “humano” (mantém \n real)
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

    // --- ESCAPE SÓ PARA O PAYLOAD ENVIADO --- //
    const payload = {
      qa:     escapeQAArray(qa),
      items:  escapeNL(itemsStr),
      skills: skills,
      da:     escapeDAArray(da)
    };

    console.log('[Compat] Payload a enviar para /suggest:', JSON.stringify(payload, null, 2));

    const url = process.env.IA_SUGGEST_URL || 'http://159.203.185.226:4000/suggest_new';
    const axiosResp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const raw = safeParse(axiosResp.data);
    const results = normalizeResults(raw);

    if (!results.length) {
      await vagaAvaliacaoModel.upsertAvaliacao({
        vaga_id,
        candidato_id,
        score: 0,
        resposta: respostaFlatten,
        breakdown: { skills, results }
      });

      return res.status(422).json({
        ok: false,
        erro: '[IA] Formato inesperado',
        raw
      });
    }

    const media = avgScore0to100(results);

    await vagaAvaliacaoModel.upsertAvaliacao({
      vaga_id,
      candidato_id,
      score: media,
      resposta: respostaFlatten,
      breakdown: { skills, results }
    });

    return res.json({ ok: true, score: media, results, skills });
  } catch (err) {
    console.error('[avaliarVagaIa] erro:', err?.message || err);
    return res.status(500).json({ ok: false, erro: 'Erro interno ao avaliar a vaga.' });
  }
};


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

exports.vagaDetalhes = async (req, res) => {
  const { encodeId, decodeId } = require('../utils/idEncoder');

  try {
    // ID seguro: aceita hash ou numérico (middleware já canonicaliza GET)
    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const id = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(id)) return res.status(400).send('ID inválido');

    const vaga = await prisma.vaga.findUnique({
      where: { id },
      include: {
        empresa: {
          include: {
            usuario: { select: { id: true, nome: true, sobrenome: true, email: true } }
          }
        },
        vaga_area:       { include: { area_interesse: { select: { id: true, nome: true } } } },
        vaga_soft_skill: { include: { soft_skill: { select: { id: true, nome: true } } } },
        vaga_arquivo: true,
        vaga_link: true,
      }
    });

    if (!vaga) return res.status(404).send('Vaga não encontrada');

    const publicadoEm = vaga.created_at ? new Date(vaga.created_at) : null;
    const publicadoEmBR = publicadoEm
      ? publicadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';

    const beneficios = Array.isArray(vaga.beneficio)
      ? vaga.beneficio
      : (vaga.beneficio ? String(vaga.beneficio).split('|').map(s => s.trim()).filter(Boolean) : []);

    const areas  = (vaga.vaga_area || []).map(va => va.area_interesse?.nome).filter(Boolean);
    const skills = (vaga.vaga_soft_skill || []).map(vs => vs.soft_skill?.nome).filter(Boolean);

    const diasPresenciais = vaga.dias_presenciais || '';
    const diasHomeOffice  = vaga.dias_home_office  || '';

    const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');
    const discQs = (typeof getDiscQuestionsForSkills === 'function'
      ? (getDiscQuestionsForSkills(skills) || [])
      : []);

    const extraRaw = String(vaga.pergunta || '').trim();
    const extraQs = extraRaw
      ? extraRaw
          .replace(/\r\n/g, '\n')
          .replace(/\\r\\n/g, '\n')
          .replace(/\\n/g, '\n')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    const perguntasLista = Array.from(new Set([...discQs, ...extraQs]));

    // ID do candidato (prioriza sessão do candidato)
    const candId = Number(req.session?.candidato?.id || req.session?.usuario?.id || 0);

    // Verifica se já aplicou (candidatura) OU já tem avaliação (fallback)
    let jaAplicou = false;
    if (candId && vaga?.id) {
      const [candidatura, avaliacao] = await Promise.all([
        prisma.vaga_candidato?.findFirst?.({
          where: { candidato_id: candId, vaga_id: id },
          select: { id: true }
        }) ?? null,
        prisma.vaga_avaliacao?.findFirst?.({
          where: { candidato_id: candId, vaga_id: id },
          select: { id: true }
        }) ?? null
      ]);
      jaAplicou = !!(candidatura || avaliacao);
    }

    // IDs codificados para usar nos hrefs da view
    const encId = encodeId(id);
    const encEmpresaId = encodeId(Number(vaga?.empresa?.id || 0));

    return res.render('candidatos/vaga-detalhes', {
      tituloPagina: 'Detalhes da vaga',
      vaga,
      publicadoEmBR,
      beneficios,
      areas,
      skills,
      diasPresenciais,
      diasHomeOffice,
      perguntasLista,
      jaAplicou,
      usuarioSessao: req.session?.usuario || null,
      encId,
      encEmpresaId,
    });

  } catch (err) {
    console.error('Erro ao carregar detalhes da vaga:', err);
    return res.status(500).send('Erro interno ao carregar a vaga');
  }
};

exports.pularCadastroCandidato = async (req, res) => {
  if (!req.session.usuario) req.session.usuario = {};
  req.session.usuario.skipCadastro = true;
  if (req.session.candidato) req.session.candidato.skipCadastro = true;

  // cookie persistente (1 ano)
  res.cookie('cs_skipCadastro', '1', {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 31536000000
  });
  
  try {
    const usuarioId = Number(
      req.query.usuario_id || req.body.usuario_id || req.session?.usuario?.id
    );
    if (!usuarioId) return res.redirect('/login');

    // Garante que exista um registro de candidato (em muitos casos já existe)
    let cand = await prisma.candidato.findUnique({
      where: { usuario_id: usuarioId },
      include: {
        usuario: { select: { email: true, nome: true, sobrenome: true } },
        candidato_area: { include: { area_interesse: true } }
      }
    });

    if (!cand) {
      // Cria com dados mínimos (nome/sobrenome se já tiver no usuario)
      const usr = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      cand = await prisma.candidato.create({
        data: {
          usuario_id: usuarioId,
          nome: usr?.nome || 'Candidato',
          sobrenome: usr?.sobrenome || '',
          data_nascimento: null,
          pais: '', estado: '', cidade: '',
          telefone: '',
          foto_perfil: ''
        },
        include: {
          usuario: { select: { email: true } },
          candidato_area: { include: { area_interesse: true } }
        }
      });
    }

    // Salva sessão mínima e segue pra home
    const localidade = [cand.cidade, cand.estado, cand.pais].filter(Boolean).join(', ');
    const areas = (cand.candidato_area || []).map(r => r.area_interesse?.nome).filter(Boolean);

    req.session.usuario = {
      id: usuarioId,
      tipo: 'candidato',
      nome: cand.nome,
      sobrenome: cand.sobrenome
    };
    req.session.candidato = {
      id: cand.id,
      usuario_id: usuarioId,
      nome: cand.nome,
      sobrenome: cand.sobrenome,
      email: cand.usuario?.email || '',
      tipo: 'candidato',
      telefone: cand.telefone || '',
      dataNascimento: cand.data_nascimento || null,
      foto_perfil: cand.foto_perfil || '',
      localidade,
      areas
    };

    return req.session.save(() => res.redirect('/candidatos/home'));
  } catch (err) {
    console.error('[pularCadastroCandidato] erro:', err?.message || err);
    req.session.erro = 'Não foi possível pular o complemento agora.';
    return res.redirect('/login');
  }
};

exports.perfilPublicoCandidato = async (req, res) => {
  const { encodeId, decodeId } = require('../utils/idEncoder');

  try {
    // 1) ID seguro (aceita hash ou numérico); GET numérico -> 301 p/ hash
    const raw = String(req.params.id || '');
    const dec = decodeId(raw);
    const candidatoId = Number.isFinite(dec) ? dec : (/^\d+$/.test(raw) ? Number(raw) : NaN);

    if (!Number.isFinite(candidatoId) || candidatoId <= 0) {
      return res.status(400).render('shared/404', { mensagem: 'ID de candidato inválido.' });
    }

    if (req.method === 'GET' && /^\d+$/.test(raw)) {
      const enc = encodeId(candidatoId);
      const canonical = req.originalUrl.replace(raw, enc);
      if (canonical !== req.originalUrl) {
        return res.redirect(301, canonical);
      }
    }

    // 2) Carrega candidato
    const candidato = await prisma.candidato.findUnique({
      where: { id: candidatoId },
      include: {
        usuario: { select: { email: true, nome: true, sobrenome: true } },
        candidato_area: { include: { area_interesse: { select: { id: true, nome: true } } } },
        candidato_link: { orderBy: { ordem: 'asc' }, select: { id: true, label: true, url: true, ordem: true } },
        candidato_arquivo: {
          orderBy: { criadoEm: 'desc' },
          select: { id: true, nome: true, mime: true, tamanho: true, url: true, criadoEm: true }
        }
      }
    });

    if (!candidato) {
      return res.status(404).render('shared/404', { mensagem: 'Candidato não encontrado.' });
    }

    // 3) Dados de exibição
    const fotoPerfil = (candidato.foto_perfil && String(candidato.foto_perfil).trim() !== '')
      ? String(candidato.foto_perfil).trim()
      : '/img/avatar.png';

    const localidade = [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ');

    let { ddi, ddd, numeroFormatado } = parseTelefoneBR(candidato.telefone);
    ddi = sanitizeDdi(ddi);
    const telefoneExibicao = (ddd && numeroFormatado)
      ? `${ddi} (${ddd}) ${numeroFormatado}`
      : (String(candidato.telefone || '').replace(/\+undefined/gi, '').trim());

    const areas = (candidato.candidato_area || [])
      .map(ca => ca.area_interesse?.nome)
      .filter(Boolean);

    const telefone = (candidato.telefone || '').trim(); // mantido para compat

    // 4) IDs codificados e URL canônica para compartilhar
    const encCandidatoId = encodeId(candidatoId);
    const perfilShareUrl = `${req.protocol}://${req.get('host')}/candidatos/perfil/${encCandidatoId}`;

    // 5) Render
    return res.render('candidatos/perfil-publico-candidatos', {
      candidato,
      fotoPerfil,
      localidade,
      areas,
      links: candidato.candidato_link || [],
      arquivos: candidato.candidato_arquivo || [],
      telefoneExibicao,
      encCandidatoId,
      perfilShareUrl,
    });
  } catch (err) {
    console.error('Erro ao carregar perfil público do candidato:', err?.message || err);
    return res.status(500).render('shared/500', { erro: 'Erro interno do servidor' });
  }
};

exports.aplicarVaga = async (req, res) => {
  try {
    const usuario = req.session?.candidato;
    if (!usuario?.id) {
      req.session.erro = 'Você precisa estar logado como candidato para aplicar.';
      return res.redirect('/login');
    }

    const vagaId = Number(req.params.id);

    // Evita duplicadas
    const jaExiste = await prisma.vaga_candidato.findFirst({
      where: { vaga_id: vagaId, candidato_id: usuario.id }
    });
    if (jaExiste) {
      req.session.erro = 'Você já aplicou para esta vaga.';
      return res.redirect(`/candidatos/vaga/${vagaId}`);
    }

    await prisma.vaga_candidato.create({
      data: {
        vaga_id: vagaId,
        candidato_id: usuario.id,
        status: 'em_analise'
      }
    });

    req.session.sucesso = 'Aplicação realizada com sucesso!';
    res.redirect(`/candidatos/vaga/${vagaId}`);
  } catch (err) {
    console.error('[aplicarVaga] erro:', err);
    req.session.erro = 'Não foi possível aplicar à vaga. Tente novamente.';
    res.redirect('/candidatos/vagas');
  }
};
