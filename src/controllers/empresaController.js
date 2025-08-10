const fs = require('fs');
const path = require('path');
const empresaModel = require('../models/empresaModel');
const vagaModel = require('../models/vagaModel');
const { cloudinary } = require('../config/cloudinary');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
  if (!usuario_id) return res.status(400).send("ID do usuário não foi informado.");
  res.render('empresas/nome-empresa', { usuario_id });
};

exports.salvarNomeEmpresa = async (req, res) => {
  try {
    let { usuario_id, nome_empresa, descricao } = req.body;

    if (!usuario_id || !nome_empresa || !descricao) {
      return res.status(400).send("Todos os campos são obrigatórios.");
    }

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) {
      return res.status(400).send("ID do usuário inválido.");
    }

    const empresaExistente = await empresaModel.obterEmpresaPorUsuarioId(usuario_id);
    if (empresaExistente) {
      return res.status(400).send("Empresa já cadastrada para esse usuário.");
    }

    await empresaModel.criarEmpresa({ usuario_id, nome_empresa, descricao });
    res.redirect(`/empresa/localizacao?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error("Erro ao inserir empresa:", err);
    res.status(500).send("Erro ao salvar os dados da empresa.");
  }
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) return res.status(400).send("ID do usuário não informado.");
  res.render('empresas/localizacao-login-juridica', { usuario_id });
};

exports.salvarLocalizacao = async (req, res) => {
  try {
    let { usuario_id, localidade } = req.body;

    if (!usuario_id || !localidade) return res.status(400).send('Informe sua localidade.');
    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) return res.status(400).send('ID do usuário inválido.');

    const partes = localidade.split(',').map(p => p.trim());
    if (partes.length < 2 || partes.length > 3) {
      return res.status(400).send('Informe uma localidade válida. Ex: cidade e país, ou cidade, estado e país.');
    }

    const [cidade, estado = '', pais = ''] = partes;

    await empresaModel.atualizarLocalizacao({ usuario_id, pais, estado, cidade });
    res.redirect(`/empresa/telefone?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    res.status(500).send('Erro ao salvar localização.');
  }
};

exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) return res.status(400).send("ID do usuário não informado.");
  res.render('empresas/telefone-empresa', { usuario_id });
};

exports.salvarTelefone = async (req, res) => {
  try {
    let { usuario_id, ddi, ddd, telefone } = req.body;

    if (!usuario_id || !ddi || !ddd || !telefone)
      return res.status(400).send("Preencha todos os campos de telefone.");

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) return res.status(400).send("ID do usuário inválido.");

    const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;
    await empresaModel.atualizarTelefone({ usuario_id, telefone: telefoneCompleto });

    res.redirect(`/empresas/foto-perfil?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error("Erro ao salvar telefone:", err);
    res.status(500).send("Erro ao salvar telefone.");
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
    if (!empresa) return res.status(404).send("Empresa não encontrada.");

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

      empresa = await prisma.empresa.findUnique({ where: { usuario_id } });
      if (!empresa) return res.redirect('/login');

      const usuario = await prisma.usuario.findUnique({ where: { id: usuario_id }, select: { email: true } });

      req.session.empresa = {
        id: empresa.id,
        usuario_id: empresa.usuario_id,
        nome_empresa: empresa.nome_empresa,
        descricao: empresa.descricao,
        cidade: empresa.cidade,
        estado: empresa.estado,
        pais: empresa.pais,
        telefone: empresa.telefone,
        foto_perfil: empresa.foto_perfil || '',
        email: usuario?.email || ''
      };
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

    const localidade = [req.session.empresa.cidade, req.session.empresa.estado, req.session.empresa.pais]
      .filter(Boolean).join(', ');

    res.render('empresas/home-empresas', {
      nome: req.session.empresa.nome_empresa,
      descricao: req.session.empresa.descricao,
      telefone: req.session.empresa.telefone,
      localidade,
      fotoPerfil: req.session.empresa.foto_perfil || '/img/avatar.png',
      usuario: req.session.usuario,
      empresa: req.session.empresa,
      activePage: 'home'
    });
  } catch (err) {
    console.error('Erro ao exibir home da empresa:', err);
    res.status(500).send('Erro ao carregar home.');
  }
};

exports.telaPerfilEmpresa = async (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');

  try {
    const vagasDaEmpresa = await prisma.vaga.findMany({
      where: { empresa_id: empresa.id },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
      },
    });

    res.render('empresas/meu-perfil', { empresa, vagasPublicadas: vagasDaEmpresa });
  } catch (error) {
    console.error('Erro ao buscar vagas da empresa:', error);
    res.status(500).send('Erro ao carregar vagas.');
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
    res.status(500).send('Erro ao carregar o formulário.');
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

    await prisma.vaga.create({
      data: {
        empresa_id,
        cargo,
        tipo_local_trabalho: tipo,
        escala_trabalho: escala,
        dias_presenciais: diasPresenciais ? parseInt(diasPresenciais,10) : null,
        dias_home_office: diasHomeOffice ? parseInt(diasHomeOffice,10) : null,
        salario: salarioFormatado,
        moeda,
        descricao,
        beneficio: beneficiosTexto,
        pergunta,
        opcao,
        vaga_area: { createMany: { data: areas_ids.map(id=>({ area_interesse_id: id })) } },
        vaga_soft_skill: { createMany: { data: soft_skills_ids.map(id=>({ soft_skill_id: id })) } }
      }
    });

    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('[ERRO] salvarVaga:', err);
    return res.status(500).send('Erro ao salvar vaga.');
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
        vaga_area: { include: { area_interesse: true } }
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
    res.status(500).send('Erro ao carregar perfil.');
  }
};

exports.excluirVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

    const { id } = req.params;
    await vagaModel.excluirVaga(id);

    res.redirect('/empresa/meu-perfil');
  } catch (error) {
    console.error('Erro ao excluir vaga:', error);
    res.status(500).send('Não foi possível excluir a vaga.');
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
        vaga_soft_skill: { include: { soft_skill: true } }
      }
    });

    if (!vaga || vaga.empresa_id !== empresaId) {
      return res.status(403).send('Acesso negado.');
    }

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
    res.status(500).send('Erro ao carregar edição de vaga.');
  }
};

exports.salvarEditarVaga = async (req, res) => {
  try {
    const vagaId = Number(req.params.id);
    const empresaId = req.session.empresa.id;

    const {
      cargo, tipo, escala, diasPresenciais, diasHomeOffice,
      salario, moeda, descricao, beneficio,
      areasSelecionadas, habilidadesSelecionadas
    } = req.body;

    const areaIds = [];
    const skillIds = JSON.parse(habilidadesSelecionadas || '[]');

    try {
      const areasBrutas = JSON.parse(areasSelecionadas || '[]');
      for (const area of areasBrutas) {
        const valor = String(area);
        if (valor.startsWith('nova:')) {
          const nomeNova = valor.replace('nova:', '').trim();
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
      console.error('[ERRO] Falha no parse de áreasSelecionadas:', e);
      return res.status(400).send('Erro ao processar áreas selecionadas.');
    }

    await prisma.vaga_area.deleteMany({ where: { vaga_id: vagaId } });
    await prisma.vaga_soft_skill.deleteMany({ where: { vaga_id: vagaId } });

    await prisma.vaga.update({
      where: { id: vagaId, empresa_id: empresaId },
      data: {
        cargo,
        tipo_local_trabalho: tipo,
        escala_trabalho: escala,
        dias_presenciais: diasPresenciais ? Number(diasPresenciais) : null,
        dias_home_office: diasHomeOffice ? Number(diasHomeOffice) : null,
        salario: salario ? parseFloat(salario.replace(',', '.')) : null,
        moeda,
        descricao,
        beneficio
      }
    });

    // limite opcional a 3 áreas
    const areaIdsLimitadas = areaIds.slice(0, 3);
    for (const areaId of areaIdsLimitadas) {
      await prisma.vaga_area.create({ data: { vaga_id: vagaId, area_interesse_id: areaId } });
    }

    for (const skillId of skillIds) {
      await prisma.vaga_soft_skill.create({ data: { vaga_id: vagaId, soft_skill_id: skillId } });
    }

    res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('[ERRO] Falha ao editar vaga:', err);
    res.status(500).send('Não foi possível editar a vaga.');
  }
};

exports.perfilPublico = async (req, res) => {
  const empresaId = parseInt(req.params.id);

  try {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa) return res.status(404).send("Empresa não encontrada.");

    const vagasPublicadas = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } }
      }
    });

    res.render('empresas/perfil-publico', { empresa, vagasPublicadas });
  } catch (error) {
    console.error("Erro ao carregar perfil público:", error);
    res.status(500).send("Erro ao carregar perfil.");
  }
};

exports.telaComplementarGoogle = (req, res) => {
  if (!req.session.usuario || req.session.usuario.tipo !== 'empresa') {
    return res.redirect('/');
  }
  const nome = req.session.usuario.nome || '';
  res.render('empresas/cadastro-complementar-empresa', { nome, erro: null });
};

exports.salvarComplementarGoogle = async (req, res) => {
  const { nome, descricao, ddi, ddd, numero, localidade } = req.body;
  const usuario_id = req.session.usuario?.id;

  if (!usuario_id || !nome || !descricao || !localidade || !ddd || !numero) {
    return res.render('empresas/cadastro-complementar-empresa', {
      nome,
      erro: 'Preencha todos os campos obrigatórios.'
    });
  }

  try {
    const usuarioDB = await prisma.usuario.findUnique({ where: { id: usuario_id } });

    await empresaModel.criarEmpresa({
      usuario_id,
      nome_empresa: nome,
      descricao,
      foto_perfil: usuarioDB.avatarUrl || ''
    });

    const partes = localidade.split(',').map(p => p.trim());
    const [cidade, estado = '', pais = ''] = partes;
    await empresaModel.atualizarLocalizacao({ usuario_id, cidade, estado, pais });

    const telefone = `${ddi} (${ddd}) ${numero}`;
    await empresaModel.atualizarTelefone({ usuario_id, telefone });

    const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario_id);
    req.session.empresa = {
      id: empresa.id,
      usuario_id,
      nome_empresa: empresa.nome_empresa,
      descricao: empresa.descricao,
      cidade: empresa.cidade,
      estado: empresa.estado,
      pais: empresa.pais,
      telefone: empresa.telefone,
      foto_perfil: empresa.foto_perfil || '',
      email: usuarioDB.email
    };

    res.redirect('/empresa/home');
  } catch (err) {
    console.error('Erro no cadastro complementar da empresa:', err);
    res.render('empresas/cadastro-complementar-empresa', {
      nome,
      erro: 'Erro interno ao salvar os dados. Tente novamente.'
    });
  }
};

exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.empresa;
  if (!sess) return res.redirect('/login');

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: sess.id }
    });
    if (!empresa) return res.redirect('/login');

    const localidade = [empresa.cidade, empresa.estado, empresa.pais].filter(Boolean).join(', ');

    return res.render('empresas/editar-empresa', {
      nome_empresa: empresa.nome_empresa || '',
      descricao: empresa.descricao || '',
      localidade,
      telefone: empresa.telefone || '',
      foto_perfil: empresa.foto_perfil || '',
      erro: null
    });
  } catch (err) {
    console.error('Erro ao carregar tela de edição da empresa:', err);
    return res.status(500).send('Erro ao carregar dados da empresa.');
  }
};

exports.salvarEdicaoPerfil = async (req, res) => {
  const sess = req.session.empresa;
  if (!sess) return res.redirect('/login');

  const { nome_empresa, descricao, localidade, ddi, ddd, telefone, removerFoto } = req.body;

  // Quebra da localidade "Cidade, Estado, País"
  const [cidade = '', estado = '', pais = ''] = (localidade || '').split(',').map(s => s.trim());

  // Telefone
  const telefoneFormatado = (ddi && ddd && telefone) ? `${ddi} (${ddd}) ${telefone}` : null;

  try {
    let novaFotoUrl = null;

    // Remover foto
    if (removerFoto) {
      novaFotoUrl = null;
    }

    // Upload de nova foto (usa o mesmo padrão do salvarFotoPerfil)
    if (!removerFoto && req.file?.path) {
      const resultadoCloudinary = await cloudinary.uploader.upload(req.file.path, {
        folder: 'connect-skills/empresas',
        public_id: `empresa_${sess.id}_foto_perfil`,
        use_filename: true,
        unique_filename: false,
      });
      novaFotoUrl = resultadoCloudinary.secure_url;
    }

    // Monta dados para update
    const dataUpdate = {
      nome_empresa: nome_empresa ?? undefined,
      descricao: descricao ?? undefined,
      cidade,
      estado,
      pais,
      telefone: telefoneFormatado ?? undefined,
    };

    if (removerFoto) dataUpdate.foto_perfil = null;
    if (novaFotoUrl) dataUpdate.foto_perfil = novaFotoUrl;

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: sess.id },
      data: dataUpdate
    });

    // Atualiza sessão
    req.session.empresa = {
      ...req.session.empresa,
      nome_empresa: empresaAtualizada.nome_empresa,
      descricao: empresaAtualizada.descricao,
      cidade: empresaAtualizada.cidade,
      estado: empresaAtualizada.estado,
      pais: empresaAtualizada.pais,
      telefone: empresaAtualizada.telefone,
      foto_perfil: empresaAtualizada.foto_perfil || ''
    };

    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('Erro ao salvar edição de perfil da empresa:', err);
    return res.status(500).render('empresas/editar-empresa', {
      nome_empresa,
      descricao,
      localidade,
      telefone,
      foto_perfil: req.session.empresa?.foto_perfil || '',
      erro: 'Não foi possível salvar as alterações. Tente novamente.'
    });
  }
};

exports.mostrarVagas = async (req, res) => {
  const sess = req.session.empresa;
  if (!sess) return res.redirect('/login');

  try {
    const vagas = await prisma.vaga.findMany({
      where: { empresa_id: sess.id },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } }
      },
      orderBy: { id: 'desc' }
    });

    return res.render('empresas/vagas', {
      vagas,
      activePage: 'vagas'
    });
  } catch (err) {
    console.error('Erro ao listar vagas da empresa:', err);
    return res.status(500).send('Erro ao listar vagas.');
  }
};
