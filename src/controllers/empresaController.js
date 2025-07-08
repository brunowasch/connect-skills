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
    if (partes.length < 3) return res.status(400).send('Formato inválido. Use: Cidade, Estado, País.');

    const [cidade, estado, pais] = partes;
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
  if (!usuario_id) return res.status(400).send("ID do usuário não informado.");
  res.render('empresas/foto-perfil-empresa', { usuario_id });
};

exports.salvarFotoPerfil = async (req, res) => {
  const { usuario_id } = req.body;

  if (!req.file || !req.file.path) {
    return res.status(400).send('Imagem não foi enviada corretamente.');
  }

  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'connect-skills/empresas',
    });

    await empresaModel.atualizarFotoPerfil({
      usuario_id: Number(usuario_id),
      foto_perfil: result.secure_url
    });

    const empresaAtualizada = await empresaModel.obterEmpresaPorUsuarioId(Number(usuario_id));
    req.session.empresa = empresaAtualizada;

    if (req.session.empresa) {
      req.session.empresa.foto_perfil = result.secure_url;
    }

    res.redirect('/empresa/home');
  } catch (err) {
    console.error('Erro ao salvar foto no Cloudinary:', err);
    res.status(500).send("Erro ao salvar foto.");
  }
};

exports.homeEmpresa = (req, res) => {
  res.render('empresas/home-empresas');
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

    res.render('empresas/meu-perfil', {
      empresa,
      vagasPublicadas: vagasDaEmpresa,
    });
  } catch (error) {
    console.error('Erro ao buscar vagas da empresa:', error);
    res.status(500).send('Erro ao carregar vagas.');
  }
};

exports.telaPublicarVaga = async (req, res) => {
  try {
    const areas = await vagaModel.buscarAreas();
    const habilidades = await vagaModel.buscarSoftSkills();

    res.render('empresas/publicar-vaga', { areas, habilidades });
  } catch (err) {
    console.error('Erro ao carregar áreas e habilidades:', err);
    res.status(500).send('Erro ao carregar o formulário.');
  }
};


exports.salvarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

    const {
      cargo = '',
      tipo = '',
      escala = '',
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda = '',
      descricao = '',
      areasSelecionadas = '[]',
      habilidadesSelecionadas = '[]'
    } = req.body;

    const empresa_id = req.session.empresa.id;

    const areas_ids = Array.isArray(JSON.parse(areasSelecionadas))
      ? JSON.parse(areasSelecionadas).map(Number)
      : [];

    const soft_skills_ids = Array.isArray(JSON.parse(habilidadesSelecionadas))
      ? JSON.parse(habilidadesSelecionadas).map(Number)
      : [];

    console.log({
      empresa_id,
      cargo,
      tipo,
      escala,
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda,
      descricao,
      areas_ids,
      soft_skills_ids
    });

    await vagaModel.criarVaga({
      empresa_id,
      cargo,
      tipo_local_trabalho: tipo,
      escala_trabalho: escala,
      dias_presenciais: diasPresenciais ? parseInt(diasPresenciais, 10) : null,
      dias_home_office: diasHomeOffice ? parseInt(diasHomeOffice, 10) : null,
      salario,
      moeda,
      descricao,
      areas_ids,
      soft_skills_ids
    });

    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('[ERRO] Falha ao salvar vaga:', err.message, err.stack);
    res.status(500).send('Erro ao salvar vaga. Verifique os dados e tente novamente.');
  }
};
exports.mostrarPerfil = async (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');

  try {
    const vagas = await prisma.vaga.findMany({
      where: { empresa_id: empresa.id },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
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

exports.telaEditarPerfil = (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');
  res.render('empresas/editar-empresa', {
    nome: empresa.nome,
    descricao: empresa.descricao,
    telefone: empresa.telefone,
    localidade: empresa.localidade,
    fotoPerfil: empresa.fotoPerfil
  });
};

exports.salvarEdicaoPerfil = (req, res) => {
  const { nome, descricao, telefone, localidade, fotoBase64 } = req.body;
  Object.assign(req.session.empresa, { nome, descricao, telefone, localidade });

  if (fotoBase64?.startsWith('data:image')) {
    const matches = fotoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    const ext = matches[1];
    const data = matches[2];
    const filename = Date.now() + '-camera.' + ext;
    const filepath = path.join(__dirname, '../../public/uploads', filename);
    fs.writeFileSync(filepath, data, 'base64');
    req.session.empresa.fotoPerfil = '/uploads/' + filename;
  }

  if (req.file) {
    req.session.empresa.fotoPerfil = '/uploads/' + req.file.filename;
  }

  res.redirect('/empresa/meu-perfil');
};

exports.mostrarVagas = async (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');

  try {
    const vagas = await vagaModel.buscarVagasPorEmpresaId(empresa.id);

    const vagasTratadas = vagas.map(v => ({
      ...v,
      areas: v.vaga_area.map(a => a.area_interesse.nome),
      habilidades: v.vaga_soft_skill.map(h => h.soft_skill.nome)
    }));

    res.render('empresas/vagas', { vagas: vagasTratadas });
  } catch (error) {
    console.error('Erro ao carregar vagas:', error);
    res.status(500).send('Erro ao carregar vagas.');
  }
};

