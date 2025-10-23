const fs = require('fs');
const path = require('path');
const axios = require('axios');
const empresaModel = require('../models/empresaModel');
const vagaModel = require('../models/vagaModel');
const vagaAvaliacaoModel = require('../models/vagaAvaliacaoModel');
const { cloudinary } = require('../config/cloudinary');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const vagaArquivoController = require('./vagaArquivoController');

function getEmpresaFromSession(req) {
  const s = req.session || {};
  const e = s.empresa || s.usuario || {};
  return e && (e.tipo ? String(e.tipo) === 'empresa' : true) ? e : null;
}

function vagaIncludeFull() {
  return {
    empresa: true,
    vaga_area: { include: { area_interesse: true } },
    vaga_soft_skill: { include: { soft_skill: true } },
    vaga_hard_skill: { include: { hard_skill: true } },
  };
}

async function obterStatusDaVaga(vagaId) {
  const ultimo = await prisma.vaga_status.findFirst({
    where: { vaga_id: vagaId },
    orderBy: { criado_em: 'desc' },
    select: { situacao: true }
  });
  return ultimo?.situacao || 'aberta';
}

async function getEmpresaIdDaSessao(req) {
  if (req.session?.empresa?.id) return Number(req.session.empresa.id);
  // fallback: quando só temos usuario na sessão
  if (req.session?.usuario?.tipo === 'empresa') {
    const emp = await prisma.empresa.findFirst({
      where: { usuario_id: Number(req.session.usuario.id) },
      select: { id: true }
    });
    return emp?.id || null;
  }
  return null;
}

exports.telaCadastro = (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica');
};

exports.cadastrarEmpresa = (req, res) => {
  const { email, senha } = req.body;
  req.session.empresa = { email, senha };
  res.redirect('/empresa/nome-empresa');
};

exports.telaNomeEmpresa = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    req.session.erro = 'ID do usuário não foi informado.';
    return res.redirect('/cadastro');
  }
  res.render('empresas/nome-empresa', { usuario_id });
};

exports.salvarNomeEmpresa = async (req, res) => {
  try {
    let { usuario_id, nome_empresa, descricao } = req.body;

    if (!usuario_id || !nome_empresa || !descricao) {
      req.session.erro = 'Todos os campos são obrigatórios.';
      return res.redirect(`/empresa/nome-empresa?usuario_id=${usuario_id || ''}`);
    }

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) {
      req.session.erro = 'ID do usuário inválido.';
      return res.redirect('/cadastro');
    }

    const empresaExistente = await empresaModel.obterEmpresaPorUsuarioId(usuario_id);
    if (empresaExistente) {
      req.session.erro = 'Empresa já cadastrada para esse usuário.';
      return res.redirect('/empresa/home');
    }

    await empresaModel.criarEmpresa({ usuario_id, nome_empresa, descricao });
    res.redirect(`/empresa/localizacao?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao inserir empresa:', err);
    req.session.erro = 'Erro ao salvar os dados da empresa.';
    res.redirect(`/empresa/nome-empresa?usuario_id=${req.body.usuario_id || ''}`);
  }
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    req.session.erro = 'ID do usuário não informado.';
    return res.redirect('/cadastro');
  }
  res.render('empresas/localizacao-login-juridica', { usuario_id });
};

exports.salvarLocalizacao = async (req, res) => {
  try {
    let { usuario_id, localidade } = req.body;

    if (!usuario_id || !localidade) {
      req.session.erro = 'Informe sua localidade.';
      return res.redirect(`/empresa/localizacao?usuario_id=${usuario_id || ''}`);
    }
    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) {
      req.session.erro = 'ID do usuário inválido.';
      return res.redirect('/cadastro');
    }

    const partes = localidade.split(',').map(p => p.trim());
    if (partes.length < 2 || partes.length > 3) {
      req.session.erro = 'Informe uma localidade válida. Ex: cidade e país, ou cidade, estado e país.';
      return res.redirect(`/empresa/localizacao?usuario_id=${usuario_id}`);
    }

    const [cidade, estado = '', pais = ''] = partes;

    await empresaModel.atualizarLocalizacao({ usuario_id, pais, estado, cidade });
    res.redirect(`/empresa/telefone?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    req.session.erro = 'Erro ao salvar localização.';
    res.redirect(`/empresa/localizacao?usuario_id=${req.body.usuario_id || ''}`);
  }
};

exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    req.session.erro = 'ID do usuário não informado.';
    return res.redirect('/cadastro');
  }
  res.render('empresas/telefone-empresa', { usuario_id });
};

exports.salvarTelefone = async (req, res) => {
  try {
    let { usuario_id, ddi, ddd, telefone } = req.body;

    if (!usuario_id || !ddi || !ddd || !telefone) {
      req.session.erro = 'Preencha todos os campos de telefone.';
      return res.redirect(`/empresa/telefone?usuario_id=${usuario_id || ''}`);
    }

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) {
      req.session.erro = 'ID do usuário inválido.';
      return res.redirect('/cadastro');
    }

    const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;
    await empresaModel.atualizarTelefone({ usuario_id, telefone: telefoneCompleto });

    res.redirect(`/empresas/foto-perfil?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar telefone:', err);
    req.session.erro = 'Erro ao salvar telefone.';
    res.redirect(`/empresa/telefone?usuario_id=${req.body.usuario_id || ''}`);
  }
};

exports.telaFotoPerfil = (req, res) => {
  const { usuario_id } = req.query;
  res.render('empresas/foto-perfil-empresa', { usuario_id });
};

exports.salvarFotoPerfil = async (req, res) => {
  const usuario_id = req.body.usuario_id || req.query.usuario_id;

  if (!req.file?.path) {
    return res.render('empresas/foto-perfil-empresa', {
      usuario_id,
      error: 'Selecione uma foto antes de continuar.'
    });
  }

  try {
    const empresa = await prisma.empresa.findUnique({ where: { usuario_id: Number(usuario_id) } });
    if (!empresa) {
      req.session.erro = 'Empresa não encontrada.';
      return res.redirect(`/empresas/foto-perfil?usuario_id=${usuario_id}`);
    }

    const resultadoCloudinary = await cloudinary.uploader.upload(req.file.path, {
      folder: 'connect-skills/empresas',
      public_id: `empresa_${empresa.id}_foto_perfil`,
      use_filename: true,
      unique_filename: false,
    });

    const urlImagem = resultadoCloudinary.secure_url;

    await prisma.empresa.update({
      where: { id: empresa.id },
      data: { foto_perfil: urlImagem }
    });

    req.session.empresa = {
      id: empresa.id,
      usuario_id: empresa.usuario_id,
      nome_empresa: empresa.nome_empresa,
      descricao: empresa.descricao,
      cidade: empresa.cidade,
      estado: empresa.estado,
      pais: empresa.pais,
      telefone: empresa.telefone,
      foto_perfil: urlImagem
    };

    req.session.usuario = { id: empresa.usuario_id, tipo: 'empresa', nome: empresa.nome_empresa };

    req.session.sucessoCadastro = 'Foto de perfil salva com sucesso!';
    req.session.save(() => res.redirect('/empresa/home'));
  } catch (err) {
    console.error('Erro ao salvar foto de perfil da empresa:', err);
    return res.render('empresas/foto-perfil-empresa', {
      usuario_id,
      error: 'Erro interno ao salvar a foto. Tente novamente.'
    });
  }
};

exports.homeEmpresa = async (req, res) => {
  try {
    let empresa = req.session.empresa;

    if (!empresa) {
      const usuario_id = parseInt(req.query.usuario_id, 10);
      if (isNaN(usuario_id)) return res.redirect('/login');

      const empDb = await prisma.empresa.findUnique({ where: { usuario_id } });
      if (!empDb) return res.redirect('/login');

      const usuario = await prisma.usuario.findUnique({
        where: { id: usuario_id },
        select: { email: true, nome: true }
      });

      req.session.empresa = {
        id: empDb.id,
        usuario_id: empDb.usuario_id,
        nome_empresa: empDb.nome_empresa,
        descricao: empDb.descricao,
        cidade: empDb.cidade,
        estado: empDb.estado,
        pais: empDb.pais,
        telefone: empDb.telefone,
        foto_perfil: empDb.foto_perfil || '',
        email: usuario?.email || ''
      };
      empresa = req.session.empresa;
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.session.empresa.usuario_id },
      select: { email: true }
    });

    req.session.empresa.email = usuario?.email || '';
    req.session.usuario = {
      id: req.session.empresa.usuario_id,
      tipo: 'empresa',
      nome: req.session.empresa.nome_empresa,
      email: usuario?.email || ''
    };

    const localidade = [empresa.cidade, empresa.estado, empresa.pais].filter(Boolean).join(', ') || 'Localidade não informada';

    const empresaId = Number(empresa.id);

    const vagasAll = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      include: {
        vaga_area:       { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        empresa: { select: { nome_empresa: true, foto_perfil: true, cidade: true, estado: true, pais: true } },
        vaga_link: true,
      },
      orderBy: { created_at: 'desc' }
    });

    const vagaIds = vagasAll.map(v => v.id);

    let countsMap = new Map();
    if (vagaIds.length) {
      const grouped = await prisma.vaga_avaliacao.groupBy({
        by: ['vaga_id'],
        where: { vaga_id: { in: vagaIds } },
        _count: { vaga_id: true }
      });
      countsMap = new Map(grouped.map(g => [g.vaga_id, g._count.vaga_id]));
    }

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

    const vagasDecoradas = vagasAll.map(v => ({
      ...v,
      total_candidatos: countsMap.get(v.id) || 0,
      status: statusMap.get(v.id) || 'aberta'
    }));

    const totalVagas = vagasDecoradas.length;
    const totalCandidatos = vagasDecoradas.reduce((acc, v) => acc + (v.total_candidatos || 0), 0);

    // ===== Avatar padrão e Progress =====
    const fotoPerfil =
      empresa.foto_perfil && empresa.foto_perfil.trim() !== ''
        ? empresa.foto_perfil
        : '/img/avatar.png';

    const checklistEmp = [
      !!(empresa.nome_empresa && empresa.nome_empresa.trim() !== ''),
      !!(empresa.descricao && empresa.descricao.trim() !== ''),
      localidade !== 'Localidade não informada',
      !!(empresa.telefone && empresa.telefone.trim() !== ''),
      !!(empresa.foto_perfil && empresa.foto_perfil.trim() !== '')
    ];
    const profileCompletion = Math.round((checklistEmp.filter(Boolean).length / checklistEmp.length) * 100);

    res.render('empresas/home-empresas', {
      nome: empresa.nome_empresa,
      descricao: empresa.descricao,
      telefone: empresa.telefone,
      localidade,
      fotoPerfil,                  // <- usa avatar se vazio
      usuario: req.session.usuario,
      empresa,
      vagasRecentes: vagasDecoradas,
      totais: { totalVagas, totalCandidatos },
      activePage: 'home',
      profileCompletion           // <- para a view mostrar condicionalmente
    });
  } catch (err) {
    console.error('Erro ao exibir home da empresa:', err);
    req.session.erro = 'Erro ao carregar home.';
    res.redirect('/login');
  }
};

exports.telaPerfilEmpresa = async (req, res) => {
  const sess = req.session.empresa;
  if (!sess) return res.redirect('/login');

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(sess.id) },
      include: {
        empresa_link: { orderBy: { ordem: 'asc' } },
        empresa_arquivo: { orderBy: { criadoEm: 'desc' } },
      },
    });

    const vagasDaEmpresa = await prisma.vaga.findMany({
      where: { empresa_id: empresa.id },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
      },
    });

    res.render('empresas/meu-perfil', {
      empresa,
      vagasPublicadas: vagasDaEmpresa,
      links: empresa.empresa_link,
      anexos: empresa.empresa_arquivo
    });
  } catch (error) {
    console.error('Erro ao buscar vagas/empresa:', error);
    req.session.erro = 'Erro ao carregar perfil.';
    res.redirect('/empresa/home');
  }
};

exports.telaPublicarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

    const areas = await prisma.area_interesse.findMany({
      where: { padrao: true },
      orderBy: { nome: 'asc' }
    });

    const habilidades = await prisma.soft_skill.findMany({ orderBy: { nome: 'asc' } });

    res.render('empresas/publicar-vaga', { areas, habilidades });
  } catch (err) {
    console.error('Erro ao carregar áreas e habilidades:', err);
    req.session.erro = 'Erro ao carregar o formulário.';
    res.redirect('/empresa/home');
  }
};

exports.salvarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

    const rawAreas = req.body.areasSelecionadas ?? req.body.areas ?? '[]';
    let areasBrutas;
    try {
      areasBrutas = Array.isArray(rawAreas) ? rawAreas : JSON.parse(rawAreas);
    } catch {
      areasBrutas = [];
    }

    if (!Array.isArray(areasBrutas) || areasBrutas.length === 0) {
      const areasList  = await prisma.area_interesse.findMany({ where: { padrao: true }, orderBy: { nome: 'asc' } });
      const skillsList = await prisma.soft_skill.findMany({ orderBy: { nome: 'asc' } });

      return res.status(400).render('empresas/publicar-vaga', {
        erroAreas: 'Selecione ao menos uma área de atuação.',
        erroHabilidades: null,
        vaga: {
          cargo: req.body.cargo || '',
          tipo_local_trabalho: req.body.tipo || '',
          escala_trabalho: req.body.escala || '',
          dias_presenciais: req.body.diasPresenciais || null,
          dias_home_office: req.body.diasHomeOffice || null,
          salario: req.body.salario || '',
          moeda: req.body.moeda || '',
          descricao: req.body.descricao || '',
          beneficio: Array.isArray(req.body.beneficio) ? req.body.beneficio : [req.body.beneficio || ''],
          beneficioOutro: req.body.beneficioOutro || '',
          pergunta: req.body.pergunta || '',
          opcao: req.body.opcao || ''
        },
        areas: areasList,
        skills: skillsList,
        selectedAreas: [],
        selectedSkills: []
      });
    }

    const areas_ids = [];
    for (const item of areasBrutas) {
      const s = String(item);
      if (s.startsWith('nova:')) {
        const nomeNova = s.slice(5).trim();
        if (!nomeNova) continue;
        let nova = await prisma.area_interesse.findFirst({ where:{ nome: nomeNova } });
        if (!nova) {
          nova = await prisma.area_interesse.create({ data:{ nome: nomeNova } });
        }
        areas_ids.push(nova.id);
      } else {
        areas_ids.push(Number(item));
      }
    }

    const rawSkills = req.body.habilidadesSelecionadas ?? '[]';
    let skillsBrutas;
    try { skillsBrutas = Array.isArray(rawSkills) ? rawSkills : JSON.parse(rawSkills); }
    catch { skillsBrutas = []; }

    const soft_skills_ids = skillsBrutas.map(Number);

    const empresa_id = req.session.empresa.id;
    const { cargo, tipo, escala, diasPresenciais, diasHomeOffice, salario, moeda, descricao, beneficio, beneficioOutro, pergunta, opcao } = req.body;

    let beneficiosArr = Array.isArray(beneficio) ? beneficio : [beneficio];
    if (beneficioOutro?.trim()) beneficiosArr.push(beneficioOutro.trim());
    const beneficiosTexto = beneficiosArr.join(', ');

    let salarioFormatado = null;
    if (salario) {
      const bruto = salario.toString().replace(/\./g,'').replace(',','.');
      salarioFormatado = parseFloat(bruto);
    }

    const vagaCriada = await prisma.vaga.create({
      data: {
        empresa_id,
        cargo,
        tipo_local_trabalho: tipo,
        escala_trabalho: escala,
        dias_presenciais: (diasPresenciais ?? '') === '' ? null : parseInt(diasPresenciais, 10),
        dias_home_office: (diasHomeOffice ?? '') === '' ? null : parseInt(diasHomeOffice, 10),
        salario: salarioFormatado,
        moeda,
        descricao,
        beneficio: beneficiosTexto,
        pergunta,
        opcao,
        vaga_area:      { createMany: { data: areas_ids.map(id=>({ area_interesse_id: id })) } },
        vaga_soft_skill:{ createMany: { data: soft_skills_ids.map(id=>({ soft_skill_id: id })) } }
      }
    });

    const titulos = Array.isArray(req.body.linksTitulo) ? req.body.linksTitulo : [];
    const urls    = Array.isArray(req.body.linksUrl)    ? req.body.linksUrl    : [];

    const toHttp = (u) => {
      if (!u) return '';
      const s = String(u).trim();
      return /^https?:\/\//i.test(s) ? s : 'https://' + s;
    };

    const linksData = [];
    for (let i = 0; i < Math.max(titulos.length, urls.length); i++) {
      const titulo = String(titulos[i] || '').trim();
      const url    = toHttp(urls[i] || '');
      if (!titulo || !url) continue;
      linksData.push({ vaga_id: vagaCriada.id, titulo: titulo.slice(0,120), url: url.slice(0,1024), ordem: i+1 });
    }

    if (linksData.length) {
      await prisma.vaga_link.createMany({ data: linksData });
    }

    if (req.files?.length) {
      await vagaArquivoController.uploadAnexosDaPublicacao(req, res, vagaCriada.id);
    }

    req.session.sucessoVaga = 'Vaga publicada com sucesso!';
    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('[ERRO] salvarVaga:', err);
    req.session.erro = 'Erro ao salvar vaga.';
    return res.redirect('/empresa/publicar-vaga');
  }
};

exports.mostrarPerfil = async (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');

  try {
    const vagas = await prisma.vaga.findMany({
      where: { empresa_id: req.session.empresa.id },
      include: {
        empresa: true,
        vaga_area: { include: { area_interesse: true } },
        vaga_arquivo: true,
        vaga_link: true,
      }
    });

    res.render('empresas/meu-perfil', {
      empresa,
      nome: empresa.nome_empresa,
      vagasPublicadas: vagas,
      activePage: 'perfil'
    });
  } catch (error) {
    console.error('Erro ao carregar perfil da empresa:', error);
    req.session.erro = 'Erro ao carregar perfil.';
    res.redirect('/empresa/home');
  }
};

exports.excluirVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

    const { id } = req.params;
    await vagaModel.excluirVaga(id);

    req.session.sucessoVaga = 'Vaga excluída com sucesso!';
    res.redirect('/empresa/meu-perfil');
  } catch (error) {
    console.error('Erro ao excluir vaga:', error);
    req.session.erro = 'Não foi possível excluir a vaga.';
    res.redirect('/empresa/meu-perfil');
  }
};

exports.telaEditarVaga = async (req, res) => {
  try {
    const vagaId = Number(req.params.id);
    const empresaId = req.session.empresa.id;

    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        vaga_arquivo: true,
        vaga_link: true,
      }
    });

    if (!vaga || vaga.empresa_id !== empresaId) {
      req.session.erro = 'Acesso negado.';
      return res.redirect('/empresa/meu-perfil');
    }

    const normalizaTipo = (t) => {
      switch (String(t || '').trim()) {
        case 'Presencial': return 'Presencial';
        case 'Home Office':
        case 'Home_Office': return 'Home_Office';
        case 'Híbrido':
        case 'Hibrido':
        case 'H_brido':     return 'H_brido';
        default:            return 'Presencial';
      }
    };
    vaga.tipo_local_trabalho = normalizaTipo(vaga.tipo_local_trabalho);

    const areaIdsSelecionadas = vaga.vaga_area.map(v => v.area_interesse_id);

    const areas = await prisma.area_interesse.findMany({
      where: { OR: [{ padrao: true }, { id: { in: areaIdsSelecionadas } }] },
      orderBy: { nome: 'asc' }
    });

    const skills = await prisma.soft_skill.findMany();

    const selectedAreas  = vaga.vaga_area.map(a => a.area_interesse_id);
    const selectedSkills = vaga.vaga_soft_skill.map(s => s.soft_skill_id);

    res.render('empresas/editar-vaga', { vaga, areas, skills, selectedAreas, selectedSkills });
  } catch (err) {
    console.error('Erro na tela de editar vaga:', err);
    req.session.erro = 'Erro ao carregar edição de vaga.';
    res.redirect('/empresa/meu-perfil');
  }
};

exports.salvarEditarVaga = async (req, res) => {
  try {
    const vagaId = Number(req.params.id);
    const empresaId = req.session.empresa.id;

    const {
      cargo,
      tipo,
      escala,
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda,
      descricao,

      pergunta,
      opcao,

      beneficio,
      beneficioOutro,

      areasSelecionadas,
      habilidadesSelecionadas
    } = req.body;

    const areaIds = [];
    try {
      const areasBrutas = JSON.parse(areasSelecionadas || '[]');
      for (const area of areasBrutas) {
        const valor = String(area);
        if (valor.startsWith('nova:')) {
          const nomeNova = valor.slice(5).trim();
          if (!nomeNova) continue;
          let nova = await prisma.area_interesse.findFirst({ where: { nome: nomeNova } });
          if (!nova) {
            nova = await prisma.area_interesse.create({ data: { nome: nomeNova, padrao: false } });
          }
          areaIds.push(nova.id);
        } else {
          areaIds.push(Number(valor));
        }
      }
    } catch (e) {
      console.error('[ERRO] Falha no parse de areasSelecionadas:', e);
      req.session.erro = 'Erro ao processar áreas selecionadas.';
      return res.redirect(`/empresa/vagas/${vagaId}/editar`);
    }

    const skillIds = (() => {
      try { return JSON.parse(habilidadesSelecionadas || '[]').map(Number); }
      catch { return []; }
    })();

    let beneficiosArr = Array.isArray(beneficio) ? beneficio : (beneficio ? [beneficio] : []);
    if (beneficioOutro?.trim()) beneficiosArr.push(beneficioOutro.trim());
    const beneficiosTexto = beneficiosArr.join(', ');

    const salarioNum = salario
      ? parseFloat(String(salario).replace(/\./g, '').replace(',', '.'))
      : null;

    await prisma.vaga_area.deleteMany({ where: { vaga_id: vagaId } });
    await prisma.vaga_soft_skill.deleteMany({ where: { vaga_id: vagaId } });

    await prisma.vaga.update({
      where: { id: vagaId, empresa_id: empresaId },
      data: {
        cargo,
        tipo_local_trabalho: tipo,
        escala_trabalho: escala,
        dias_presenciais: (diasPresenciais ?? '') === '' ? null : parseInt(diasPresenciais, 10),
        dias_home_office: (diasHomeOffice ?? '') === '' ? null : parseInt(diasHomeOffice, 10),
        salario: salarioNum,
        moeda,
        descricao,
        beneficio: beneficiosTexto,
        pergunta,
        opcao
      }
    });

    // Recria relações com limite de 3 áreas
    const areaIdsLimitadas = areaIds.slice(0, 3);
    if (areaIdsLimitadas.length) {
      await prisma.vaga_area.createMany({
        data: areaIdsLimitadas.map(id => ({ vaga_id: vagaId, area_interesse_id: id }))
      });
    }
    if (skillIds.length) {
      await prisma.vaga_soft_skill.createMany({
        data: skillIds.map(id => ({ vaga_id: vagaId, soft_skill_id: id }))
      });
    }

    if (req.files?.length) {
      await vagaArquivoController.uploadAnexosDaPublicacao(req, res, vagaId);
    }

    const titulos = Array.isArray(req.body.linksTitulo) ? req.body.linksTitulo : [];
    const urls    = Array.isArray(req.body.linksUrl)    ? req.body.linksUrl    : [];
    const toHttp = (u) => /^https?:\/\//i.test(String(u||'').trim()) ? String(u).trim() : ('https://' + String(u||'').trim());

    const novos = [];
    for (let i = 0; i < Math.max(titulos.length, urls.length); i++) {
      const titulo = String(titulos[i] || '').trim();
      const url    = toHttp(urls[i] || '');
      if (!titulo || !url) continue;
      novos.push({ vaga_id: vagaId, titulo: titulo.slice(0,120), url: url.slice(0,1024), ordem: i+1 });
    }
    if (novos.length) {
      await prisma.vaga_link.createMany({ data: novos });
    }

    req.session.sucessoVaga = 'Vaga atualizada com sucesso!';
    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('[ERRO] Falha ao editar vaga:', err);
    req.session.erro = 'Não foi possível editar a vaga.';
    return res.redirect('/empresa/meu-perfil');
  }
};


// Ranking
exports.rankingCandidatos = async (req, res) => {
  try {
    const params = {
      vaga_id: Number(req.params.vagaId),
      empresa_id: await getEmpresaIdDaSessao(req)
    };
    if (!params.empresa_id) {
      req.session.erro = 'Faça login como empresa para ver o ranking.';
      return res.redirect('/login');
    }

    // valida a vaga/empresa
    const vaga = await prisma.vaga.findFirst({
      where: { id: params.vaga_id, empresa_id: params.empresa_id },
      include: { empresa: true }
    });
    if (!vaga) {
      req.session.erro = 'Vaga não encontrada ou não pertence a esta empresa.';
      return res.redirect('/empresa/vagas');
    }

    // busca avaliações dessa vaga
    const avaliacoes = await vagaAvaliacaoModel.listarPorVaga({ vaga_id: params.vaga_id });

    // monta linhas para a view
    const rows = avaliacoes.map((a, idx) => {
      const c = a.candidato || {};
      const u = c.usuario || {};

      const nome =
        [c.nome, c.sobrenome].filter(Boolean).join(' ').trim() ||
        u.nome ||
        u.email ||
        `Candidato #${c.id || ''}`.trim();

      const local = [c.cidade, c.estado, c.pais].filter(Boolean).join(', ') || '—';
      const telefone = c.telefone || '—';
      const foto_perfil = c.foto_perfil || '/img/avatar.png';
      const email = u.email || '';

      let questions = '';
      // 1) API atual: campo questions no próprio registro
      if (a.questions && typeof a.questions === 'string') {
        questions = a.questions.trim();
      }
      // 2) Formato antigo: texto consolidado em a.resposta (linhas "Pergunta? Resposta")
      if (!questions && a.resposta && typeof a.resposta === 'string') {
        questions = a.resposta.trim();
      }
      // 3) Algum JSON stringificado que contenha { questions: "..." }
      const tryParse = (s) => {
        try {
          const obj = JSON.parse(s);
          if (obj && obj.questions && typeof obj.questions === 'string') {
            return obj.questions.trim();
          }
        } catch (_) {}
        return '';
      };
      if (!questions && typeof a.payload === 'string') {
        questions = tryParse(a.payload);
      }
      if (!questions && typeof a.api_result === 'string') {
        questions = tryParse(a.api_result);
      }
      if (!questions && typeof a.result === 'string') {
        questions = tryParse(a.result);
      }

      return {
        pos: idx + 1,
        candidato_id: c.id,
        nome,
        local,
        telefone,
        email,
        score: Number(a.score) || 0,
        foto_perfil,
        questions
      };
    });

    return res.render('empresas/ranking-candidatos', {
      vaga,
      rows
    });
  } catch (err) {
    console.error('Erro ao carregar ranking:', err?.message || err);
    req.session.erro = 'Erro ao carregar ranking.';
    return res.redirect('/empresa/vagas');
  }
};

exports.excluirConta = async (req, res) => {
  try {
    const empresa = req.session.empresa;
    if (!empresa) {
      req.session.erro = 'Usuário não autenticado.';
      return res.redirect('/login');
    }

    // Verificar se a empresa tem um usuario_id associado
    if (!empresa.usuario_id) {
      req.session.erro = 'Usuário não encontrado.';
      return res.redirect('/login');
    }

    // Carregar as vagas associadas à empresa
    const vagas = await prisma.vaga.findMany({
      where: { empresa_id: empresa.id },
    });

    // Verificar se a empresa tem vagas associadas antes de tentar excluir
    if (vagas.length > 0) {
      const vagaIds = vagas.map(vaga => vaga.id);

      // Excluir as relações de vagas antes de excluir a empresa
      await prisma.vaga_area.deleteMany({
        where: { vaga_id: { in: vagaIds } },
      });

      await prisma.vaga_soft_skill.deleteMany({
        where: { vaga_id: { in: vagaIds } },
      });

      // Excluir as vagas
      await prisma.vaga.deleteMany({
        where: { empresa_id: empresa.id },
      });
    }

    // Excluir a empresa
    await prisma.empresa.delete({
      where: { id: empresa.id },
    });

    // Excluir o usuário associado à empresa
    await prisma.usuario.delete({
      where: { id: empresa.usuario_id },
    });

    // Destruir a sessão após excluir a empresa e o usuário
    req.session.destroy((err) => {
      if (err) {
        console.error('Erro ao destruir a sessão:', err);
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error('Erro ao excluir conta da empresa:', err);
    req.session.erro = 'Erro ao excluir conta. Tente novamente.';
    res.redirect('/empresa/meu-perfil');
  }
};

exports.telaAnexosEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) return res.redirect('/login');

  try {
    const anexos = await prisma.empresa_arquivo.findMany({
      where: { empresa_id: Number(sess.id) },
      orderBy: { criadoEm: 'desc' },
    });

    const erro = req.flash ? req.flash('erro') : [];
    const msg  = req.flash ? req.flash('msg')  : [];

    res.render('empresas/anexos', { anexos, erro, msg });
  } catch (e) {
    console.error('Erro ao carregar anexos da empresa:', e);
    if (req.flash) req.flash('erro', 'Não foi possível carregar anexos.');
    res.redirect('/empresa/meu-perfil');
  }
};

exports.telaVagaDetalhe = async (req, res) => {
  const empresaSess = getEmpresaFromSession(req);
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(404).render('shared/404', { url: req.originalUrl });
  }

  try {
    const vaga = await prisma.vaga.findFirst({
      where: {
        id,
        ...(empresaSess?.id ? { empresa_id: Number(empresaSess.id) } : {}),
      },
      include: {
        empresa: true,
        vaga_area:      { include: { area_interesse: true } },
        vaga_soft_skill:{ include: { soft_skill: true } },
        vaga_arquivo:   true,
        vaga_link: true,
      },
    });

    if (!vaga) {
      return res.status(404).render('shared/404', { url: req.originalUrl });
    }

    // último status no histórico
    const statusAtual = await obterStatusDaVaga(id); // 'aberta' | 'fechada'
    const shareUrl = `${req.protocol}://${req.get('host')}/vagas/${id}`; // link público para candidatos

    return res.render('empresas/vaga-detalhe', { vaga, statusAtual, shareUrl });
  } catch (err) {
    console.error('Erro telaVagaDetalhe', err);
    return res.status(500).render('shared/500', { erro: 'Falha ao carregar a vaga.' });
  }
};

exports.fecharVaga = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const empresaId = await getEmpresaIdDaSessao(req);

    // Confere se a vaga existe e pertence à empresa logada
    const vaga = await prisma.vaga.findFirst({
      where: { id, ...(empresaId ? { empresa_id: empresaId } : {}) },
      select: { id: true }
    });
    if (!vaga) {
      req.session.erro = 'Vaga não encontrada ou não pertence a esta empresa.';
      return res.redirect('/empresa/meu-perfil');
    }

    // Se já está fechada, só redireciona
    const statusAtual = await obterStatusDaVaga(id);
    if (statusAtual === 'fechada') {
      return res.redirect(`/empresa/vaga/${id}`);
    }

    // Grava evento "fechada"
    await prisma.vaga_status.create({
      data: { vaga_id: id, situacao: 'fechada' }
    });

    return res.redirect(`/empresa/vaga/${id}`);
  } catch (err) {
    console.error('Erro fecharVaga:', err?.message || err);
    req.session.erro = 'Não foi possível fechar a vaga.';
    return res.redirect(`/empresa/vaga/${id}`);
  }
};

exports.reabrirVaga = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const empresaId = await getEmpresaIdDaSessao(req);

    const vaga = await prisma.vaga.findFirst({
      where: { id, ...(empresaId ? { empresa_id: empresaId } : {}) },
      select: { id: true }
    });
    if (!vaga) {
      req.session.erro = 'Vaga não encontrada ou não pertence a esta empresa.';
      return res.redirect('/empresa/meu-perfil');
    }

    const statusAtual = await obterStatusDaVaga(id);
    if (statusAtual === 'aberta') {
      return res.redirect(`/empresa/vaga/${id}`);
    }

    await prisma.vaga_status.create({
      data: { vaga_id: id, situacao: 'aberta' }
    });

    return res.redirect(`/empresa/vaga/${id}`);
  } catch (err) {
    console.error('Erro reabrirVaga:', err?.message || err);
    req.session.erro = 'Não foi possível reabrir a vaga.';
    return res.redirect(`/empresa/vaga/${id}`);
  }
};

exports.excluirVaga = async (req, res) => {
  const empresaSess = getEmpresaFromSession(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect('/empresa/meu-perfil?erro=vaga_invalida');
  }

  try {
    // Confere se a vaga existe e pertence à empresa logada (quando houver)
    const vaga = await prisma.vaga.findFirst({
      where: { id, ...(empresaSess?.id ? { empresa_id: Number(empresaSess.id) } : {}) },
      select: { id: true },
    });
    if (!vaga) return res.redirect('/empresa/meu-perfil?erro=vaga_nao_encontrada');

    // Monta a transação dinamicamente, só com modelos que existem no Prisma Client
    const tx = [
      prisma.vaga_area.deleteMany({ where: { vaga_id: id } }),
      prisma.vaga_soft_skill.deleteMany({ where: { vaga_id: id } }),
    ];

    if (prisma.vaga_hard_skill?.deleteMany) {
      tx.push(prisma.vaga_hard_skill.deleteMany({ where: { vaga_id: id } }));
    }
    if (prisma.vaga_status?.deleteMany) {
      tx.push(prisma.vaga_status.deleteMany({ where: { vaga_id: id } }));
    }
    if (prisma.vaga_avaliacao?.deleteMany) {
      tx.push(prisma.vaga_avaliacao.deleteMany({ where: { vaga_id: id } }));
    }

    // Por último, a própria vaga
    tx.push(prisma.vaga.delete({ where: { id } }));

    await prisma.$transaction(tx);

    req.session.sucessoVaga = 'Vaga excluída com sucesso!';
    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('Erro excluirVaga', err);
    return res.redirect('/empresa/meu-perfil?erro=nao_foi_possivel_excluir');
  }
};

exports.perfilPublico = async (req, res) => {
  const empresaId = parseInt(req.params.id, 10);
  if (Number.isNaN(empresaId)) {
    req.session.erro = 'ID de empresa inválido.';
    return res.redirect('/');
  }

  try {
    // Carrega a empresa já com links e anexos
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      include: {
        empresa_link:    { orderBy: { ordem: 'asc' } },
        empresa_arquivo: { orderBy: { criadoEm: 'desc' } },
      }
    });

    if (!empresa) {
      req.session.erro = 'Empresa não encontrada.';
      return res.redirect('/');
    }

    const vagasPublicadasAll = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        vaga_arquivo: true,
        vaga_link: true,
      }
    });

    const ids = vagasPublicadasAll.map(v => v.id);
    let vagasPublicadas = vagasPublicadasAll;
    if (ids.length) {
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: ids } },
        orderBy: { criado_em: 'desc' },
        select: { vaga_id: true, situacao: true, criado_em: true }
      });
      const latest = new Map();
      for (const s of statusList) {
        if (!latest.has(s.vaga_id)) latest.set(s.vaga_id, (s.situacao || 'aberta').toLowerCase());
      }
      vagasPublicadas = vagasPublicadasAll.filter(v => (latest.get(v.id) || 'aberta') !== 'fechada');
    }

    const podeTestar = !!req.session?.candidato;
    const somentePreview = !podeTestar;

    if (podeTestar && vagasPublicadas.length) {
      const candidatoId = Number(req.session.candidato.id);
      const idsAbertas = vagasPublicadas.map(v => v.id);

      const avals = await prisma.vaga_avaliacao.findMany({
        where: { candidato_id: candidatoId, vaga_id: { in: idsAbertas } },
        select: { vaga_id: true, resposta: true }
      });
      const mapResp = new Map(avals.map(a => [a.vaga_id, a.resposta || '']));

      for (const vaga of vagasPublicadas) {
        const texto = mapResp.get(vaga.id) || '';
        if (!texto) continue;
        const linhas = texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const apenasRespostas = linhas.map(L => {
          const m = L.match(/\?\s*(.*)$/);
          return m ? m[1].trim() : '';
        }).filter(Boolean);

        vaga.respostas_previas = apenasRespostas;
        vaga.resposta_unica   = apenasRespostas[0] || '';
      }
    }

    // >>> Envia links e anexos para a view <<<
    return res.render('empresas/perfil-publico', {
      empresa,
      vagasPublicadas,
      somentePreview,
      podeTestar,
      links:  empresa.empresa_link || [],
      anexos: empresa.empresa_arquivo || []
    });
  } catch (error) {
    console.error('Erro ao carregar perfil público:', error);
    req.session.erro = 'Erro ao carregar perfil.';
    return res.redirect('/');
  }
};


exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.empresa;
  const humanFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return '0 B';
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) return bytes + ' B';
    const units = ['KB','MB','GB','TB'];
    let u = -1;
    do { bytes /= thresh; ++u; } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
  };
  if (!sess) return res.redirect('/login');

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(sess.id) },
      include: {
        empresa_link: { orderBy: { ordem: 'asc' } },
        empresa_arquivo: { orderBy: { criadoEm: 'desc' } },
      }
    });

    const localidade = [empresa.cidade, empresa.estado, empresa.pais].filter(Boolean).join(', ');

    res.render('empresas/editar-empresa', {
      empresa,
      descricao: empresa.descricao || '',
      humanFileSize,
      localidade,
      links: empresa.empresa_link,
      anexos: empresa.empresa_arquivo
    });
  } catch (err) {
    console.error('Erro ao abrir edição de empresa:', err);
    req.session.erro = 'Erro ao carregar dados.';
    res.redirect('/empresa/meu-perfil');
  }
};

exports.salvarEdicaoPerfil = async (req, res) => {
  try {
    const sess = req.session.empresa;
    if (!sess) return res.redirect('/login');

    const { nome, descricao, localidade, ddd, numero, removerFoto, fotoBase64 } = req.body;

    // Localidade
    let cidade = '', estado = '', pais = '';
    if (localidade) {
      const partes = String(localidade).split(',').map(p => p.trim());
      [cidade, estado = '', pais = ''] = partes;
    }

    // Telefone
    let telefone = req.body.telefone || '';
    const dddDigits = (ddd || '').replace(/\D/g, '');
    const numDigits = (numero || '').replace(/\D/g, '');
    if (dddDigits && numDigits) {
      let numeroFmt;
      if (numDigits.length >= 9) {
        numeroFmt = `${numDigits.slice(0, 5)}-${numDigits.slice(5, 9)}`; // celular
      } else if (numDigits.length >= 8) {
        numeroFmt = `${numDigits.slice(0, 4)}-${numDigits.slice(4, 8)}`; // fixo
      } else {
        numeroFmt = numDigits;
      }
      telefone = `+55 (${dddDigits}) ${numeroFmt}`;
    }

    let novaFotoUrl = null;

    if (String(removerFoto).toLowerCase() === 'true') {
      novaFotoUrl = '';
    }

    if (!novaFotoUrl && fotoBase64 && /^data:image\/(png|jpe?g|webp);base64,/.test(fotoBase64)) {
      try {
        const mod = require('../config/cloudinary');
        const cloud = mod?.cloudinary || mod;
        const uploader = cloud?.uploader;

        if (uploader && typeof uploader.upload === 'function') {
          const uploadRes = await uploader.upload(fotoBase64, {
            folder: 'connect-skills/empresa',
            overwrite: true,
            invalidate: true,
          });
          novaFotoUrl = uploadRes.secure_url || uploadRes.url || '';
        } else {
          console.warn('[editar-empresa] Cloudinary não configurado ou sem uploader. Pulando upload.');
        }
      } catch (e) {
        console.warn('[editar-empresa] Falha ao enviar foto para Cloudinary:', e.message);
      }
    }

    const dataUpdate = {
      nome_empresa: nome,
      descricao,
      cidade, estado, pais,
      telefone
    };
    if (novaFotoUrl !== null) {
      dataUpdate.foto_perfil = novaFotoUrl;
    }

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: Number(sess.id) },
      data: dataUpdate
    });

    const urls = Array.isArray(req.body['link_url[]']) ? req.body['link_url[]'] :
                 Array.isArray(req.body.link_url) ? req.body.link_url :
                 (req.body.link_url ? [req.body.link_url] : []);
    const labels = Array.isArray(req.body['link_label[]']) ? req.body['link_label[]'] :
                   Array.isArray(req.body.link_label) ? req.body.link_label :
                   (req.body.link_label ? [req.body.link_label] : []);

    await prisma.empresa_link.deleteMany({ where: { empresa_id: Number(sess.id) } });

    const creates = [];
    let ordem = 1;
    for (let i = 0; i < urls.length; i++) {
      const url = (urls[i] || '').trim();
      if (!url) continue;
      const label = (labels[i] || 'Link').toString().trim();
      if (!/^https?:\/\//i.test(url)) continue;
      creates.push({ empresa_id: Number(sess.id), label, url, ordem });
      ordem++;
    }
    if (creates.length) {
      await prisma.empresa_link.createMany({ data: creates });
    }

    req.session.empresa = {
      ...req.session.empresa,
      nome_empresa: empresaAtualizada.nome_empresa,
      descricao: empresaAtualizada.descricao,
      cidade: empresaAtualizada.cidade,
      estado: empresaAtualizada.estado,
      pais: empresaAtualizada.pais,
      telefone: empresaAtualizada.telefone,
      foto_perfil: empresaAtualizada.foto_perfil || req.session.empresa.foto_perfil
    };

    req.session.sucessoCadastro = 'Perfil atualizado com sucesso.';
    res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('Erro ao salvar edição da empresa:', err);
    req.session.erro = 'Erro ao salvar o perfil. Tente novamente.';
    res.redirect('/empresa/editar-empresa');
  }
};

exports.mostrarVagas = async (req, res) => {
  if (!req.session?.empresa) return res.redirect('/login');
  const empresaId = Number(req.session.empresa.id);

  const q = (req.query.q || '').trim();
  const ordenar = (req.query.ordenar || 'recentes').trim();

  const tipo = (req.query.tipo || '').trim();          
  const escala = (req.query.escala || '').trim();
  const salMin = req.query.sal_min ? Number(req.query.sal_min) : null;
  const salMax = req.query.sal_max ? Number(req.query.sal_max) : null;
  let areaIds = req.query.area_ids || [];
  if (!Array.isArray(areaIds)) areaIds = [areaIds];
  areaIds = areaIds.filter(Boolean).map(x => Number(x)).filter(Number.isFinite);

  const where = { empresa_id: empresaId };

  if (q) {
    where.OR = [
      { cargo:     { contains: q } },
      { descricao: { contains: q } },
      { vaga_area: { some: { area_interesse: { nome: { contains: q } } } } },
    ];
  }

  if (tipo)   where.tipo_local_trabalho = tipo;
  if (escala) where.escala_trabalho = { contains: escala };
  if (areaIds.length > 0) {
    where.vaga_area = { some: { area_interesse_id: { in: areaIds } } };
  }
  if (salMin != null || salMax != null) {
    where.salario = {};
    if (salMin != null) where.salario.gte = salMin;
    if (salMax != null) where.salario.lte = salMax;
  }

  try {
    let orderBy = { created_at: 'desc' };
    if (ordenar === 'antigos') orderBy = { created_at: 'asc' };

    const vagas = await prisma.vaga.findMany({
      where,
      include: {
        vaga_area: { include: { area_interesse: true } },
        empresa: { select: { nome_empresa: true, foto_perfil: true, cidade: true, estado: true, pais: true } },
        vaga_arquivo: true,
        vaga_link: true,
      },
      orderBy
    });

    const vagaIds = vagas.map(v => v.id);
    let countsMap = new Map();
    if (vagaIds.length) {
      const grouped = await prisma.vaga_avaliacao.groupBy({
        by: ['vaga_id'],
        where: { vaga_id: { in: vagaIds } },
        _count: { vaga_id: true }
      });
      countsMap = new Map(grouped.map(g => [g.vaga_id, g._count.vaga_id]));
    }

    let vagasComTotal = vagas.map(v => ({
      ...v,
      total_candidatos: countsMap.get(v.id) || 0,
      total_anexos: v.vaga_arquivo?.length || 0,
    }));

    switch (ordenar) {
      case 'mais_candidatos':
        vagasComTotal.sort((a, b) => (b.total_candidatos - a.total_candidatos) || (b.created_at - a.created_at));
        break;
      case 'menos_candidatos':
        vagasComTotal.sort((a, b) => (a.total_candidatos - b.total_candidatos) || (b.created_at - a.created_at));
        break;
      case 'maior_salario':
        vagasComTotal.sort((a, b) => (Number(b.salario || 0) - Number(a.salario || 0)) || (b.created_at - a.created_at));
        break;
      case 'menor_salario':
        vagasComTotal.sort((a, b) => (Number(a.salario || 0) - Number(b.salario || 0)) || (b.created_at - a.created_at));
        break;
    }

    res.render('empresas/vagas', {
      vagas: vagasComTotal,
      empresa: vagas[0]?.empresa || req.session.empresa || {},
      filtros: { q, ordenar },
      tipos: [
        { value: 'Presencial',  label: 'Presencial' },
        { value: 'Home_Office', label: 'Home Office' },
        { value: 'H_brido',     label: 'Híbrido' }
      ],
      escalas: [],
      areas:   []
    });
  } catch (err) {
    console.error('Erro ao listar vagas com filtros:', err);
    req.session.erro = 'Erro ao carregar suas vagas.';
    res.redirect('/empresa/home');
  }
};


exports.telaComplementarGoogle = (req, res) => {
  const usuarioId = req.session?.usuario?.id;
  if (!usuarioId) return res.redirect('/login');
  return res.redirect(`/empresas/nome-empresa?usuario_id=${usuarioId}`);
};

exports.salvarComplementarGoogle = (req, res) => {
  const usuarioId = req.session?.usuario?.id;
  if (!usuarioId) return res.redirect('/login');
  return res.redirect(`/empresas/nome-empresa?usuario_id=${usuarioId}`);
};

exports.pularCadastroEmpresa = async (req, res) => {
  if (!req.session.usuario) req.session.usuario = {};
  req.session.usuario.skipCadastro = true;
  if (req.session.candidato) req.session.candidato.skipCadastro = true;

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

    // Garante que exista um registro de empresa
    let emp = await prisma.empresa.findUnique({
      where: { usuario_id: usuarioId },
      include: {
        usuario: { select: { email: true } }
      }
    });

    if (!emp) {
      const usr = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      emp = await prisma.empresa.create({
        data: {
          usuario_id: usuarioId,
          nome_empresa: usr?.nome || 'Empresa',
          descricao: '',
          pais: '', estado: '', cidade: '',
          telefone: '',
          foto_perfil: ''
        },
        include: { usuario: { select: { email: true } } }
      });
    }

    // Prepara localidade formatada
    const localidade = [emp.cidade, emp.estado, emp.pais].filter(Boolean).join(', ');

    // Salva na sessão
    req.session.usuario = {
      id: usuarioId,
      tipo: 'empresa',
      nome: emp.nome_empresa,
      email: emp.usuario?.email || ''
    };
    req.session.empresa = {
      id: emp.id,
      usuario_id: usuarioId,
      nome_empresa: emp.nome_empresa,
      descricao: emp.descricao,
      email: emp.usuario?.email || '',
      telefone: emp.telefone || '',
      foto_perfil: emp.foto_perfil || '',
      cidade: emp.cidade || '',
      estado: emp.estado || '',
      pais: emp.pais || '',
      localidade
    };

    return req.session.save(() => res.redirect('/empresa/home'));
  } catch (err) {
    console.error('[pularCadastroEmpresa] erro:', err?.message || err);
    req.session.erro = 'Não foi possível pular o complemento agora.';
    return res.redirect('/login');
  }
};

exports.uploadAnexosEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) {
    req.session.erro = 'Faça login para enviar anexos.';
    return res.redirect('/login');
  }

  try {
    // Cloudinary é obrigatório para anexos (guarda a URL pública)
    if (!cloudinary?.uploader) {
      req.session.erro = 'Storage não configurado para anexos (Cloudinary).';
      return res.redirect('/empresa/editar-empresa');
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      req.session.erro = 'Nenhum arquivo selecionado.';
      return res.redirect('/empresa/editar-empresa');
    }

    let enviados = 0;
    for (const f of files) {
      // Faz upload (aceita imagens, PDFs, DOCX, etc.)
      const opts = { folder: 'connect-skills/empresa/anexos', resource_type: 'auto' };

      // suporta tanto storage em disco (f.path) quanto em memória (f.buffer)
      const upRes = f?.path
        ? await cloudinary.uploader.upload(f.path, opts)
        : await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(opts, (err, r) => err ? reject(err) : resolve(r));
            stream.end(f.buffer);
          });

      const finalUrl  = upRes?.secure_url || upRes?.url || null;
      const finalMime = f?.mimetype || 'application/octet-stream';
      const finalName = f?.originalname || 'arquivo';
      const finalSize = typeof f?.size === 'number' ? f.size : (upRes?.bytes || 0);

      if (!finalUrl) throw new Error('Falha ao obter URL do anexo no Cloudinary.');

      await prisma.empresa_arquivo.create({
        data: {
          empresa_id: Number(sess.id),
          nome: String(finalName).slice(0, 255),
          mime: String(finalMime).slice(0, 100),
          tamanho: Number(finalSize) || 0,
          url: finalUrl
        }
      });

      enviados++;
    }

    req.session.sucessoCadastro = `${enviados} arquivo(s) enviado(s) com sucesso.`;
    return res.redirect('/empresa/editar-empresa');
  } catch (e) {
    console.error('uploadAnexosEmpresa erro:', e);
    req.session.erro = 'Falha ao enviar anexos. Verifique o arquivo e tente novamente.';
    return res.redirect('/empresa/editar-empresa');
  }
};

exports.abrirAnexoEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) return res.redirect('/login');

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send('ID inválido.');

  try {
    const ax = await prisma.empresa_arquivo.findFirst({
      where: { id, empresa_id: Number(sess.id) },
      select: { url: true }
    });
    if (!ax) {
      req.session.erro = 'Anexo não encontrado.';
      return res.redirect('/empresa/editar-empresa');
    }
    if (!ax.url || ax.url === '#') {
      req.session.erro = 'Arquivo sem URL válida.';
      return res.redirect('/empresa/editar-empresa');
    }
    return res.redirect(ax.url); // navegador abre (PDF/IMG) ou baixa (demais)
  } catch (e) {
    console.error('abrirAnexoEmpresa erro:', e);
    req.session.erro = 'Falha ao abrir o anexo.';
    return res.redirect('/empresa/editar-empresa');
  }
};

exports.excluirAnexoEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) return res.redirect('/login');

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send('ID inválido.');

  try {
    const ax = await prisma.empresa_arquivo.findFirst({
      where: { id, empresa_id: Number(sess.id) },
      select: { id: true }
    });
    if (!ax) {
      req.session.erro = 'Anexo não encontrado.';
      return res.redirect('/empresa/editar-empresa');
    }

    await prisma.empresa_arquivo.delete({ where: { id: ax.id } });
    req.session.sucessoCadastro = 'Anexo excluído.';
    return res.redirect('/empresa/editar-empresa');
  } catch (e) {
    console.error('excluirAnexoEmpresa erro:', e);
    req.session.erro = 'Falha ao excluir o anexo.';
    return res.redirect('/empresa/editar-empresa');
  }
};