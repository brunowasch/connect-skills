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
  res.render('empresas/foto-perfil-empresa', { usuario_id });
};

exports.salvarFotoPerfil = async (req, res) => {
  console.log('req.file:', req.file);
  console.log('req.body.usuario_id:', req.body.usuario_id);

  const usuario_id = req.body.usuario_id || req.query.usuario_id;

  if (!req.file?.path) {
    return res.render('empresas/foto-perfil-empresa', {
      usuario_id,
      error: 'Selecione uma foto antes de continuar.'
    });
  }

  try {
    // 1. Recuperar os dados da empresa
    const empresa = await prisma.empresa.findUnique({
      where: { usuario_id: Number(usuario_id) }
    });

    if (!empresa) {
      return res.status(404).send("Empresa não encontrada.");
    }

    // 2. Enviar a imagem para o Cloudinary
    const resultadoCloudinary = await cloudinary.uploader.upload(req.file.path, {
      folder: 'connect-skills/empresas',
      public_id: `empresa_${empresa.id}_foto_perfil`,
      use_filename: true,
      unique_filename: false,
    });

    const urlImagem = resultadoCloudinary.secure_url;
    console.log("URL da foto no Cloudinary:", urlImagem);

    // 3. Atualizar o banco de dados
    await prisma.empresa.update({
      where: { id: empresa.id },
      data: { foto_perfil: urlImagem }
    });

    // 4. Atualizar a sessão com os dados completos da empresa
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

    console.log("Sessão empresa atualizada:", req.session.empresa);

    // 5. Redirecionar para a home da empresa
    return res.redirect('/empresa/home');
  } catch (err) {
    console.error('Erro ao salvar foto de perfil da empresa:', err);
    return res.render('empresas/foto-perfil-empresa', {
      usuario_id,
      error: 'Erro interno ao salvar a foto. Tente novamente.'
    });
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
        where: { empresa_id: req.session.empresa.id },
        include: {
          empresa: true,
          vaga_area: {
            include: {
              area_interesse: true
            }
          }
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

exports.telaEditarPerfil = (req, res) => {
  const empresa = req.session.empresa;
  console.log("Empresa na sessão:", empresa);
  if (!empresa) return res.redirect('/login');

  res.render('empresas/editar-empresa', {
    empresa,
    fotoPerfil: empresa.foto_perfil || '/img/placeholder-empresa.png',
    descricao: empresa.descricao,
    telefone: empresa.telefone,
    localidade: `${empresa.cidade}, ${empresa.estado}, ${empresa.pais}`,
  });
};

exports.salvarEdicaoPerfil = async (req, res) => {
  console.log("Arquivo recebido:", req.file); 
  const { nome, descricao, ddi, ddd, numero, localidade, fotoBase64 } = req.body;
  let telefone = req.session.empresa.telefone; // valor antigo, fallback

  if (ddi && ddd && numero) {
    telefone = `${ddi} (${ddd}) ${numero}`;
  }
  const empresaId = req.session.empresa?.id;

  if (!empresaId) return res.redirect('/login');

  let cidade = '', estado = '', pais = '';

  if (localidade) {
    const partes = localidade.split(',').map(p => p.trim());
    [cidade, estado, pais] = partes;
  }

  let novaFotoUrl = req.session.empresa.foto_perfil;

  // Upload de imagem base64 (tirada da câmera)
  if (fotoBase64?.startsWith('data:image')) {
    const matches = fotoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1];
      const data = matches[2];
      const buffer = Buffer.from(data, 'base64');

      try {
        const resultadoCloudinary = await cloudinary.uploader.upload_stream({
          folder: 'connect-skills/empresas',
          public_id: `empresa_${empresaId}_foto_perfil`,
          use_filename: true,
          unique_filename: false
        }, async (error, result) => {
          if (error) throw error;
          novaFotoUrl = result.secure_url;

          await prisma.empresa.update({
            where: { id: empresaId },
            data: {
              nome_empresa: nome,
              descricao,
              telefone,
              cidade,
              estado,
              pais,
              foto_perfil: novaFotoUrl
            }
          });

          req.session.empresa = {
            ...req.session.empresa,
            nome_empresa: nome,
            descricao,
            telefone,
            cidade,
            estado,
            pais,
            foto_perfil: novaFotoUrl
          };

          return res.redirect('/empresa/meu-perfil');
        });

        // Escreve o buffer no stream do Cloudinary
        const stream = resultadoCloudinary;
        stream.end(buffer);
        return;
      } catch (err) {
        console.error("Erro ao fazer upload da imagem para o Cloudinary:", err);
        return res.status(500).send("Erro ao fazer upload da imagem.");
      }
    }
  }

  // Upload de arquivo via input file
  if (req.file) {
    try {
      const resultadoCloudinary = await cloudinary.uploader.upload(req.file.path, {
        folder: 'connect-skills/empresas',
        public_id: `empresa_${empresaId}_foto_perfil`,
        use_filename: true,
        unique_filename: false,
      });

      novaFotoUrl = resultadoCloudinary.secure_url;
    } catch (error) {
      console.error("Erro ao fazer upload para o Cloudinary:", error);
      return res.status(500).send("Erro ao fazer upload da imagem.");
    }
  }

  // Atualiza o banco de dados e a sessão
  try {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        nome_empresa: nome,
        descricao,
        telefone,
        cidade,
        estado,
        pais,
        foto_perfil: novaFotoUrl
      }
    });

    req.session.empresa = {
      ...req.session.empresa,
      nome_empresa: nome,
      descricao,
      telefone,
      cidade,
      estado,
      pais,
      foto_perfil: novaFotoUrl
    };

    res.redirect('/empresa/meu-perfil');
  } catch (error) {
    console.error("Erro ao salvar dados da empresa:", error);
    res.status(500).send("Erro ao salvar dados.");
  }
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

exports.telaEditarVaga = async (req, res) => {
  try {
    const vagaId = Number(req.params.id);
    const empresaId = req.session.empresa.id;

    // busca vaga + relacionamentos
    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } }
      }
    });

    // garante que a vaga pertence a esta empresa
    if (!vaga || vaga.empresa_id !== empresaId) {
      return res.status(403).send('Acesso negado.');
    }

    // busca todas as áreas e skills para popular checkboxes
    const areas = await prisma.area_interesse.findMany();
    const skills = await prisma.soft_skill.findMany();

    // extrai IDs selecionados
    const selectedAreas  = vaga.vaga_area.map(a  => a.area_interesse_id);
    const selectedSkills = vaga.vaga_soft_skill.map(s => s.soft_skill_id);

    res.render('empresas/editar-vaga', {
      vaga,
      areas,
      skills,
      selectedAreas,
      selectedSkills
    });
  } catch (err) {
    console.error('Erro na tela de editar vaga:', err);
    res.status(500).send('Erro ao carregar edição de vaga.');
  }
};

/** Recebe POST da edição e salva no banco */
exports.salvarEditarVaga = async (req, res) => {
  try {
    const vagaId = Number(req.params.id);
    const empresaId = req.session.empresa.id;

    // parse dos campos
    const {
      cargo,
      tipo,
      escala,
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda,
      descricao,
      areasSelecionadas,
      habilidadesSelecionadas
    } = req.body;

    const areaIds  = JSON.parse(areasSelecionadas);
    const skillIds = JSON.parse(habilidadesSelecionadas);

    // atualiza via model
    await vagaModel.atualizarVaga({
      id: vagaId,
      empresa_id: empresaId,
      cargo,
      tipo,
      escala,
      dias_presenciais: Number(diasPresenciais)  || null,
      dias_home_office: Number(diasHomeOffice)  || null,
      salario: salario ? parseFloat(salario.replace(',', '.')) : null,
      moeda,
      descricao,
      areas_ids: areaIds,
      soft_skills_ids: skillIds
    });

    res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('[ERRO] Falha ao editar vaga:', err);
    res.status(500).send('Não foi possível editar a vaga.');
  }
};

exports.perfilPublico = async (req, res) => {
  const empresaId = parseInt(req.params.id);

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId }
    });

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
