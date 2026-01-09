const { v4: uuidv4 } = require('uuid');
const skillsLista = require('../utils/softSkills');
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const empresaModel = require("../models/empresaModel");
const vagaModel = require("../models/vagaModel");
const vagaAvaliacaoModel = require("../models/vagaAvaliacaoModel");
const { cloudinary } = require("../config/cloudinary");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const vagaArquivoController = require("./vagaArquivoController");
const { discQuestionBank } = require("../utils/discQuestionBank");
const { encodeId, decodeId } = require("../utils/idEncoder");

function getEmpresaFromSession(req) {
  const s = req.session || {};
  const e = s.empresa || s.usuario || {};
  return e && (e.tipo ? String(e.tipo) === "empresa" : true) ? e : null;
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
    orderBy: { criado_em: "desc" },
    select: { situacao: true },
  });
  return ultimo?.situacao || "aberta";
}

async function getEmpresaIdDaSessao(req) {
  if (req.session?.empresa?.id) return Number(req.session.empresa.id);
  // fallback: quando só temos usuario na sessão
  if (req.session?.usuario?.tipo === "empresa") {
    const emp = await prisma.empresa.findFirst({
      where: { usuario_id: Number(req.session.usuario.id) },
      select: { id: true },
    });
    return emp?.id || null;
  }
  return null;
}

function parseParamId(raw) {
  const dec = decodeId(String(raw || ""));
  if (Number.isFinite(dec)) return dec;
  if (/^\d+$/.test(String(raw))) return Number(raw);
  return NaN;
}

exports.telaNomeEmpresa = (req, res) => {
  res.render("empresas/nome-empresa");
};

exports.salvarNomeEmpresa = async (req, res) => {
  try {
    // 1. Pegamos o ID da sessão como String (UUID)
    const usuario_id = req.session.usuario?.id;
    const { nome_empresa, descricao } = req.body;

    // Verificação de segurança
    if (!usuario_id) {
      req.session.erro = "Sessão inválida. Faça login novamente.";
      return res.redirect("/login");
    }

    if (!nome_empresa || !descricao) {
      req.session.erro = "Todos os campos são obrigatórios.";
      return res.redirect(`/empresas/nome-empresa`);
    }

    // Verifica se já existe (Passando a String/UUID pura)
    const empresaExistente = await empresaModel.obterEmpresaPorUsuarioId(usuario_id);
    if (empresaExistente) {
      req.session.empresa = empresaExistente;
      req.session.usuario.tipo = 'empresa';
      return res.redirect("/empresas/home");
    }

    // 2. CRIAÇÃO: Removido o Number(). Enviamos o UUID puro.
    // Certifique-se que o Model 'criarEmpresa' gera o 'id' (uuid) como conversamos.
    await empresaModel.criarEmpresa({
      usuario_id: usuario_id, // STRING PURA
      nome_empresa,
      descricao,
    });

    // 3. BUSCA: Buscamos a empresa recém-criada usando o UUID
    const novaEmpresa = await prisma.empresa.findUnique({
      where: { usuario_id: usuario_id } // STRING PURA
    });

    if (!novaEmpresa) {
      throw new Error("Falha ao recuperar a empresa após a criação.");
    }

    // 4. Configura a Sessão (Login da Empresa)
    // Armazenamos os IDs como Strings para consistência em todo o sistema
    req.session.empresa = {
      id: novaEmpresa.id,
      usuario_id: novaEmpresa.usuario_id,
      nome_empresa: novaEmpresa.nome_empresa,
      descricao: novaEmpresa.descricao,
      cidade: novaEmpresa.cidade || "",
      estado: novaEmpresa.estado || "",
      pais: novaEmpresa.pais || "",
      telefone: novaEmpresa.telefone || "",
      foto_perfil: novaEmpresa.foto_perfil || "",
    };
    
    req.session.usuario = {
      ...req.session.usuario,
      tipo: "empresa",
      nome: novaEmpresa.nome_empresa,
    };

    req.session.sucessoCadastro = "Perfil criado com sucesso!";
    
    return req.session.save(() => res.redirect("/empresas/home"));

  } catch (err) {
    console.error("Erro ao inserir empresa:", err);
    req.session.erro = "Erro ao salvar os dados da empresa: " + (err.message || "");
    return res.redirect(`/empresas/nome-empresa`);
  }
};

exports.telaLocalizacao = (req, res) => {
  return res.render("empresas/localizacao-login-juridica");
};

exports.salvarLocalizacao = async (req, res) => {
  try {
    const usuario_id = req.session.usuario.id;
    const { localidade } = req.body;

    // Verificação de segurança (garante que a sessão existe)
    if (!usuario_id) {
      req.session.erro = "Sessão inválida. Faça login novamente.";
      return res.redirect("/login");
    }

    if (!localidade) {
      req.session.erro = "Informe sua localidade.";
      return res.redirect(`/empresas/localizacao`);
    }

    const partes = localidade.split(",").map((p) => p.trim());
    if (partes.length < 2 || partes.length > 3) {
      req.session.erro =
        "Informe uma localidade válida. Ex: cidade e país, ou cidade, estado e país.";
      return res.redirect(`/empresas/localizacao`);
    }

    const [cidade, estado = "", pais = ""] = partes;

    await empresaModel.atualizarLocalizacao({
      usuario_id: Number(usuario_id),
      pais,
      estado,
      cidade,
    });

    return res.redirect(`/empresas/telefone`);
  } catch (err) {
    console.error("Erro ao salvar localização:", err);
    req.session.erro = "Erro ao salvar localização.";
    return res.redirect(`/empresas/localizacao`);
  }
};

exports.telaTelefone = (req, res) => {
  return res.render("empresas/telefone-empresa", {
    error: null,
    telefoneData: {},
  });
};

exports.salvarTelefone = async (req, res) => {
  try {
    const usuario_id = req.session.usuario.id;
    const { ddi, ddd, telefone } = req.body;

    if (!usuario_id || isNaN(usuario_id)) {
      req.session.erro = "Sessão inválida. Faça login novamente.";
      return res.redirect("/login");
    }

    if (!ddi || !ddd || !telefone) {
      return res.render("empresas/telefone-empresa", {
        error: "Preencha todos os campos de telefone.",
        telefoneData: { ddi, ddd, telefone },
      });
    }

    const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;

    await empresaModel.atualizarTelefone({
      usuario_id: Number(usuario_id),
      telefone: telefoneCompleto,
    });

    return res.redirect(`/empresas/foto-perfil`);
  } catch (err) {
    console.error("Erro ao salvar telefone:", err);
    return res.render("empresas/telefone-empresa", {
      error: "Erro ao salvar telefone.",
      telefoneData: {
        ddi: req.body.ddi,
        ddd: req.body.ddd,
        telefone: req.body.telefone,
      },
    });
  }
};

exports.telaFotoPerfil = async (req, res) => {
  try {
    const usuarioId = req.session?.usuario?.id;
    if (!usuarioId) return res.redirect("/login");

    const empresa = await prisma.empresa.findUnique({
      where: { usuario_id: Number(usuarioId) },
      select: { foto_perfil: true },
    });

    if (empresa?.foto_perfil && empresa.foto_perfil.trim() !== "") {
      console.log("[telaFotoPerfil] Empresa já possui foto, pulando etapa.");
      return res.redirect("/empresas/home");
    }

    return res.render("empresas/foto-perfil-empresa", { error: null });
  } catch (e) {
    console.error("[telaFotoPerfil][empresa] erro:", e);
    return res.redirect("/empresas/home");
  }
};

exports.salvarFotoPerfil = async (req, res) => {
  const usuario_id = req.session.usuario.id;

  if (isNaN(usuario_id)) {
    req.session.erro = "Sessão inválida. Faça login novamente.";
    return res.redirect("/login");
  }

  if (!req.file) {
    return res.render("empresas/foto-perfil-empresa", {
      error: "Selecione ou capture uma foto antes de continuar.",
    });
  }

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { usuario_id: Number(usuario_id) },
    });
    if (!empresa) {
      req.session.erro = "Empresa não encontrada.";
      return res.redirect(`/empresas/foto-perfil`);
    }

    const file = req.file;
    let urlImagem = null;

    if (file.path && /^https?:\/\//i.test(String(file.path))) {
      urlImagem = file.path;
    } else if (Buffer.isBuffer(file.buffer)) {
      const up = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "connect-skills/empresas",
            public_id: `empresa_${empresa.id}_foto_perfil`,
            overwrite: true,
            resource_type: "image",
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(file.buffer);
      });
      urlImagem = up.secure_url || up.url;
    } else if (file.path) {
      const up = await cloudinary.uploader.upload(file.path, {
        folder: "connect-skills/empresas",
        public_id: `empresa_${empresa.id}_foto_perfil`,
        overwrite: true,
        resource_type: "image",
      });
      urlImagem = up.secure_url || up.url;
    }

    if (!urlImagem) {
      return res.render("empresas/foto-perfil-empresa", {
        error: "Não foi possível processar a imagem. Tente novamente.",
      });
    }

    await prisma.empresa.update({
      where: { id: empresa.id },
      data: { foto_perfil: urlImagem },
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
      foto_perfil: urlImagem,
    };
    req.session.usuario = {
      id: empresa.usuario_id,
      tipo: "empresa",
      nome: empresa.nome_empresa,
    };

    req.session.sucessoCadastro = "Foto de perfil salva com sucesso!";
    req.session.save(() => res.redirect("/empresas/home"));
  } catch (err) {
    console.error("Erro ao salvar foto de perfil da empresa:", err);
    return res.render("empresas/foto-perfil-empresa", {
      error: "Erro interno ao salvar a foto. Tente novamente.",
    });
  }
};

exports.homeEmpresa = async (req, res) => {
  try {
    let empresa = req.session.empresa;
    let usuario = req.session.usuario;

    if (!empresa || !usuario || usuario.tipo !== "empresa") {
      req.session.erro = "Sessão inválida. Faça login novamente.";
      return res.redirect("/login");
    }

    const empresaId = String(empresa.id);

    // 1. Buscamos as vagas puras (sem include, já que o schema não permite)
    const vagasAll = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      orderBy: { created_at: "desc" },
    });

    const vagaIds = vagasAll.map((v) => v.id);

    // 2. Buscamos Áreas e Skills manualmente para essas vagas
    let areasMap = {};
    let skillsMap = {};
    let countsMap = new Map();
    let statusMap = new Map();

    if (vagaIds.length > 0) {
      // Buscando as Áreas de Interesse vinculadas às vagas
      const todasAreas = await prisma.vaga_area.findMany({
        where: { vaga_id: { in: vagaIds } },
      });
      const areaIds = [...new Set(todasAreas.map(a => a.area_interesse_id))];

      const areas = await prisma.area_interesse.findMany({
        where: { id: { in: areaIds } }
      });

      const areaMap = new Map(areas.map(a => [a.id, a]));

      todasAreas.forEach(v => {
        v.area_interesse = areaMap.get(v.area_interesse_id);
      });
      
      // Buscando as Soft Skills vinculadas às vagas
      const todasSkills = await prisma.vaga_soft_skill.findMany({
        where: { vaga_id: { in: vagaIds } }
      });

      const softSkillIds = [...new Set(todasSkills.map(s => s.soft_skill_id))];

      const softSkills = await prisma.soft_skill.findMany({
        where: { id: { in: softSkillIds } }
      });

      const softSkillMap = new Map(softSkills.map(s => [s.id, s]));

      todasSkills.forEach(s => {
        s.soft_skill = softSkillMap.get(s.soft_skill_id);
      });

      // Buscando contagem de candidatos
      const grouped = await prisma.vaga_avaliacao.groupBy({
        by: ["vaga_id"],
        where: { vaga_id: { in: vagaIds } },
        _count: { vaga_id: true },
      });
      countsMap = new Map(grouped.map((g) => [g.vaga_id, g._count.vaga_id]));

      // Buscando status atual
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: vagaIds } },
        orderBy: { criado_em: 'desc' }
      });

      // Organizando áreas e skills por ID da vaga para o "vagasDecoradas"
      todasAreas.forEach(a => {
        if(!areasMap[a.vaga_id]) areasMap[a.vaga_id] = [];
        areasMap[a.vaga_id].push(a);
      });
      todasSkills.forEach(s => {
        if(!skillsMap[s.vaga_id]) skillsMap[s.vaga_id] = [];
        skillsMap[s.vaga_id].push(s);
      });
      statusList.forEach(s => {
        if (!statusMap.has(s.vaga_id)) statusMap.set(s.vaga_id, s.situacao);
      });
    }

    // 3. "Decoramos" as vagas manualmente para a View não quebrar
    const vagasDecoradas = vagasAll.map((v) => ({
      ...v,
      vaga_area: areasMap[v.id] || [],
      vaga_soft_skill: skillsMap[v.id] || [],
      total_candidatos: countsMap.get(v.id) || 0,
      status: statusMap.get(v.id) || "aberta",
      // Como não tem relação, simulamos o objeto empresa para a View
      empresa: {
        nome_empresa: empresa.nome_empresa,
        foto_perfil: empresa.foto_perfil,
        cidade: empresa.cidade,
        estado: empresa.estado,
        pais: empresa.pais
      }
    }));

    // --- Restante da lógica de contagem e renderização (Mantida) ---
    const totalVagas = vagasDecoradas.length;
    const totalCandidatos = vagasDecoradas.reduce((acc, v) => acc + v.total_candidatos, 0);
    const localidade = [empresa.cidade, empresa.estado, empresa.pais].filter(Boolean).join(", ") || "Localidade não informada";

    res.render("empresas/home-empresas", {
      nome: empresa.nome_empresa,
      descricao: empresa.descricao,
      telefone: empresa.telefone,
      localidade,
      fotoPerfil: empresa.foto_perfil || "/img/avatar.png",
      usuario: req.session.usuario,
      empresa,
      vagasRecentes: vagasDecoradas,
      totais: { totalVagas, totalCandidatos },
      activePage: "home",
      profileCompletion: 100 // Ou sua lógica de cálculo
    });

  } catch (err) {
    console.error("Erro ao exibir home da empresa:", err);
    res.redirect("/login");
  }
};

exports.telaPerfilEmpresa = async (req, res) => {
  const sess = req.session.empresa;
  
  if (!sess || !sess.id) {
    return res.redirect("/login");
  }

  try {
    const empresaId = String(sess.id);

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId }
    });

    if (!empresa) {
      req.session.erro = "Empresa não encontrada.";
      return res.redirect("/empresas/home");
    }

    // Busca links e anexos (Busca simples, funciona normal)
    const links = await prisma.empresa_link.findMany({
      where: { empresa_id: empresaId },
      orderBy: { ordem: "asc" }
    });

    const anexos = await prisma.empresa_arquivo.findMany({
      where: { empresa_id: empresaId },
      orderBy: { criadoEm: "desc" }
    });

    const vagasDaEmpresa = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      orderBy: { created_at: 'desc' }
    });

    const vagaIds = vagasDaEmpresa.map(v => v.id);

    let areasMap = {};
    let skillsMap = {};

    if (vagaIds.length > 0) {
      // --- CORREÇÃO AQUI: BUSCA MANUAL EM VEZ DE INCLUDE ---
      
      // 1. Busca as relações brutas (apenas os IDs)
      const relacoesAreas = await prisma.vaga_area.findMany({
        where: { vaga_id: { in: vagaIds } }
      });
      const relacoesSkills = await prisma.vaga_soft_skill.findMany({
        where: { vaga_id: { in: vagaIds } }
      });

      // 2. Busca os nomes das áreas e skills nas tabelas de referência
      const areaIdsUnicos = [...new Set(relacoesAreas.map(ra => ra.area_interesse_id))];
      const skillIdsUnicos = [...new Set(relacoesSkills.map(rs => rs.soft_skill_id))];

      const [dadosAreas, dadosSkills] = await Promise.all([
        prisma.area_interesse.findMany({ where: { id: { in: areaIdsUnicos } } }),
        prisma.soft_skill.findMany({ where: { id: { in: skillIdsUnicos } } })
      ]);

      const areaRefMap = new Map(dadosAreas.map(a => [a.id, a]));
      const skillRefMap = new Map(dadosSkills.map(s => [s.id, s]));

      // 3. Monta os objetos no formato esperado pelo seu EJS
      relacoesAreas.forEach(ra => {
        if(!areasMap[ra.vaga_id]) areasMap[ra.vaga_id] = [];
        areasMap[ra.vaga_id].push({
          ...ra,
          area_interesse: areaRefMap.get(ra.area_interesse_id)
        });
      });

      relacoesSkills.forEach(rs => {
        if(!skillsMap[rs.vaga_id]) skillsMap[rs.vaga_id] = [];
        skillsMap[rs.vaga_id].push({
          ...rs,
          soft_skill: skillRefMap.get(rs.soft_skill_id)
        });
      });
    }

    const vagasDecoradas = vagasDaEmpresa.map(v => ({
      ...v,
      vaga_area: areasMap[v.id] || [],
      vaga_soft_skill: skillsMap[v.id] || []
    }));

    const perfilPublicoUrl = `/empresa/perfil/${empresaId}`;

    return res.render("empresas/meu-perfil", {
      usuario: req.session.usuario,
      empresa: {
        ...empresa,
        empresa_link: links,
        empresa_arquivo: anexos
      },
      vagasPublicadas: vagasDecoradas,
      links: links,
      anexos: anexos,
      perfilPublicoUrl,
      activePage: "perfil"
    });

  } catch (error) {
    console.error("Erro ao buscar vagas/empresa no perfil:", error);
    req.session.erro = "Erro ao carregar perfil.";
    return res.redirect("/empresas/home");
  }
};

exports.telaPublicarVaga = async (req, res) => {
  try {
    const empresa = getEmpresaFromSession(req);
    if (!empresa) return res.redirect('/login');

    const areasRaw = await prisma.area_interesse.findMany({
      orderBy: { nome: 'asc' }
    });

    const termosSujeira = ['teste', 'fs', 'igugui', 'njkhbhjkb', 'testes'];

    const areas = areasRaw
      .filter(area => {
        const nomeLower = area.nome.toLowerCase();
        return !termosSujeira.some(sujeira => nomeLower.includes(sujeira)) && area.nome.length > 2;
      })
      .map(area => ({
        ...area,
        nome: area.nome.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())
      }));

    const softSkills = await prisma.soft_skill.findMany({
      orderBy: { nome: 'asc' }
    });

    // 2. Renderize passando a nova variável 'skillsLista'
    res.render('empresas/publicar-vaga', {
      empresa,
      areas,
      softSkills, // Estas são as skills do banco (para gerar os botões)
      skillsLista: softSkills, // Esta é a lista de 250 nomes (para limpeza/IA)
      backUrl: '/empresas/home'
    });
  } catch (error) {
    console.error(error);
    res.redirect('/empresas/home');
  }
};

exports.salvarVaga = async (req, res) => {
  console.log("DEBUG - Conteúdo do Body:", req.body);
  try {
    const empresaSessao = req.session?.empresa || null;
    if (!empresaSessao?.id) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/login");
    }

    const back = req.get("referer") || "/empresa/publicar-vaga";

    const norm = (s) => (s ? String(s).trim() : "");
    const toNullIfEmpty = (s) => (norm(s) === "" ? null : norm(s));
    const toIntOrNull = (v) => {
      const s = norm(v);
      if (!s) return null;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    };
    const parseMoney = (v) => {
      if (v == null || v === "") return null;
      // Remove os pontos de milhar e troca a vírgula decimal por ponto
      const s = String(v)
        .replace(/\./g, "") // Remove o ponto (milhar)
        .replace(",", "."); // Troca a vírgula por ponto (decimal)
      
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };

    // vínculos aceitos
    const VINCULOS_OK = new Set([
      "Estagio",
      "CLT_Tempo_Integral",
      "CLT_Meio_Periodo",
      "Trainee",
      "Aprendiz",
      "PJ",
      "Freelancer_Autonomo",
      "Temporario",
    ]);

    const {
      cargo,
      tipo, // tipo_local_trabalho
      escala, // escala_trabalho
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda,
      descricao,
      beneficio, // checkboxes
      beneficioOutro, // texto livre
      pergunta, // obrigatório (para IA)
      opcao, // obrigatório (para IA)
      vinculo, // vínculo empregatício
      areas, // legado
      areasSelecionadas, // JSON hidden (novo)
      habilidadesSelecionadas, // JSON hidden para soft skills
    } = req.body;

    if (!norm(cargo)) {
      req.session.erro = "Informe o cargo da vaga.";
      return res.redirect(back);
    }
    if (!norm(tipo)) {
      req.session.erro = "Informe o tipo de local de trabalho.";
      return res.redirect(back);
    }
    // perguntas para IA obrigatórias
    if (!norm(pergunta) || !norm(opcao)) {
      req.session.erro =
        'Preencha os campos de "Pergunta para IA" e "Opções de resposta para IA".';
      return res.redirect(back);
    }

    // Benefícios: une checkboxes + "Outro"
    let beneficiosArr = Array.isArray(beneficio)
      ? beneficio.map(norm).filter(Boolean)
      : [];
    if (norm(beneficioOutro)) beneficiosArr.push(norm(beneficioOutro));
    const beneficioStr = beneficiosArr.join(", ");

    const vinculoSafe = VINCULOS_OK.has(String(vinculo))
      ? String(vinculo)
      : null;
    const salarioNumber = parseMoney(salario);
    const moedaSafe = norm(moeda) || "BRL";
    const diasPresenciaisInt = toIntOrNull(diasPresenciais);
    const diasHomeOfficeInt = toIntOrNull(diasHomeOffice);

    // --- ÁREAS: suporta o novo hidden JSON e o formato antigo ---
    let areasInput = [];
    let rawAreas = req.body.areasSelecionadas;

    if (rawAreas) {
        // Se for um array (como mostrado no debug), pegamos o primeiro item válido
        if (Array.isArray(rawAreas)) {
            rawAreas = rawAreas.find(item => item && item !== '[]') || "";
        }

        try {
            if (typeof rawAreas === 'string' && rawAreas.trim() !== "") {
                if (rawAreas.startsWith('[')) {
                    areasInput = JSON.parse(rawAreas);
                } else {
                    areasInput = rawAreas.split(',').map(s => s.trim());
                }
            }
        } catch (e) {
            console.error("Erro no parse de áreasSelecionadas:", e);
        }
    }

    const idsAreas = [];
    const novasAreas = [];
    for (const item of areasInput) {
        const val = String(item).trim();
        if (!val || val === '[]') continue;

        if (/^nova:/i.test(val)) {
            const nome = val.replace(/^nova:/i, "").trim();
            if (nome) novasAreas.push(nome);
        } else {
            const limpo = val.replace(/["']/g, "");
            const numId = parseInt(limpo, 10);
            if (!isNaN(numId)) idsAreas.push(numId);
        }
    }

    console.log("IDs identificados para salvar (AGORA VAI):", idsAreas);

    // --- SOFT SKILLS: hidden JSON "habilidadesSelecionadas" ---
    let softSkillIds = [];
    let rawSkills = req.body.habilidadesSelecionadas;

    if (rawSkills) {
        if (Array.isArray(rawSkills)) {
            rawSkills = rawSkills.find(item => item && item !== '[]') || "";
        }

      try {
        if (typeof rawSkills === 'string' && rawSkills.trim() !== "") {
            const parsed = JSON.parse(rawSkills);
            // Converte para número e remove o que não for ID válido
            softSkillIds = parsed
                .map(val => parseInt(String(val).replace(/["']/g, "").trim(), 10))
                .filter(n => !isNaN(n));
        }
    } catch (e) {
        console.error("Erro no parse de habilidadesSelecionadas:", e);
    }
    }
    console.log("Habilidades identificadas para salvar (AGORA VAI):", softSkillIds);

    // Transação: cria a vaga, vincula até 3 áreas (existentes + novas),
    // cria áreas novas se necessário, e vincula soft skills
    const vagaCriada = await prisma.$transaction(async (tx) => {
      const vagaIdManual = uuidv4();
      const vaga = await tx.vaga.create({
        data: {
          id: vagaIdManual,
          empresa_id: String(empresaSessao.id),
          cargo: norm(cargo),
          tipo_local_trabalho: norm(tipo),
          escala_trabalho: toNullIfEmpty(escala),
          dias_presenciais: diasPresenciaisInt,
          dias_home_office: diasHomeOfficeInt,
          salario: salarioNumber,
          moeda: toNullIfEmpty(moedaSafe),
          descricao: toNullIfEmpty(descricao),
          beneficio: toNullIfEmpty(beneficioStr),
          pergunta: norm(pergunta),
          opcao: norm(opcao),
          vinculo_empregaticio: vinculoSafe,
          uuid: uuidv4(),
        },
      });

      // --- monta lista de áreas (existentes + novas), até 3 ---
      const limitIds = [];

      // 1) áreas existentes
      for (const id of idsAreas) {
        if (!Number.isFinite(id)) continue;
        if (!limitIds.includes(id)) {
          limitIds.push(id);
        }
      }

      // 2) áreas novas
      for (const nome of novasAreas) {
        if (limitIds.length >= 3) break;

        const nomeLimpo = norm(nome);
        if (!nomeLimpo) continue;

        let area = await tx.area_interesse.findFirst({
          where: { nome: nomeLimpo },
        });

        if (!area) {
          area = await tx.area_interesse.create({
            data: { nome: nomeLimpo, padrao: false },
          });
        }

        if (!limitIds.includes(area.id)) {
          limitIds.push(area.id);
        }
      }

      // 3) cria vínculos das áreas (uma única vez)
      if (limitIds.length) {
        await tx.vaga_area.createMany({
          data: limitIds.map((areaId) => ({
            vaga_id: vaga.id, // O ID que acabamos de gerar
            area_interesse_id: areaId,
          })),
          skipDuplicates: true,
        });
      }

      // Relaciona SOFT SKILLS selecionadas (se houver)
      if (softSkillIds.length) {
        await tx.vaga_soft_skill.createMany({
          data: softSkillIds.map((id) => ({
            vaga_id: vaga.id,
            soft_skill_id: id,
          })),
          skipDuplicates: true,
        });
      }

      return vaga;
    });

    if (req.files?.length) {
      await vagaArquivoController.uploadAnexosDaPublicacao(
        req,
        res,
        vagaCriada.id
      );
    }

    // --- Links auxiliares (opcional) ---
    const titulos = Array.isArray(req.body.linksTitulo)
      ? req.body.linksTitulo
      : [];
    const urls = Array.isArray(req.body.linksUrl) ? req.body.linksUrl : [];
    const toHttp = (u) => {
      if (!u) return "";
      const s = String(u).trim();
      return /^https?:\/\//i.test(s) ? s : "https://" + s;
    };

    const linksData = [];
    for (let i = 0; i < Math.max(titulos.length, urls.length); i++) {
      const titulo = String(titulos[i] || "").trim();
      const url = toHttp(urls[i] || "");
      if (!titulo || !url) continue;
      linksData.push({
        vaga_id: vagaCriada.id,
        titulo: titulo.slice(0, 120),
        url: url.slice(0, 1024),
        ordem: i + 1,
      });
    }

    if (linksData.length) {
      await prisma.vaga_link.createMany({ data: linksData });
    }

    req.session.sucessoVaga = "Vaga publicada com sucesso!";
    return res.redirect("/empresa/vaga/" + encodeId(vagaCriada.id));
  } catch (err) {
    console.error("Erro ao salvar vaga (unificado):", err);
    req.session.erro =
      "Não foi possível publicar a vaga. " + (err?.message || "");
    const back = req.get("referer") || "/empresa/publicar-vaga";
    return res.redirect(back);
  }
};

exports.mostrarPerfil = async (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect("/login");

  try {
    const vagas = await prisma.vaga.findMany({
      where: { empresa_id: req.session.empresa.id },
      include: {
        empresa: true,
        vaga_area: { include: { area_interesse: true } },
        vaga_arquivo: true,
        vaga_link: true,
      },
    });

    res.render("empresas/meu-perfil", {
      empresa,
      nome: empresa.nome_empresa,
      vagasPublicadas: vagas,
      activePage: "perfil",
    });
  } catch (error) {
    console.error("Erro ao carregar perfil da empresa:", error);
    req.session.erro = "Erro ao carregar perfil.";
    res.redirect("/empresa/home");
  }
};

exports.excluirVaga = async (req, res) => {
  try {
    const empresaId = req.session?.empresa?.id;
    if (!empresaId) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/login");
    } // Use seu helper 'parseParamId' que já é ótimo

    const vagaId = parseParamId(req.params.id);
    if (!vagaId) {
      req.session.erro = "ID de vaga inválido.";
      return res.redirect("/empresa/meu-perfil");
    }

    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      select: { empresa_id: true },
    });

    if (!vaga || vaga.empresa_id !== empresaId) {
      req.session.erro = "Acesso negado. Você não pode excluir esta vaga.";
      return res.redirect("/empresa/meu-perfil");
    }
    await vagaModel.excluirVaga(vagaId);

    req.session.sucessoVaga = "Vaga excluída com sucesso!";
    res.redirect("/empresa/meu-perfil");
  } catch (error) {
    console.error("Erro ao excluir vaga:", error);
    req.session.erro = "Não foi possível excluir a vaga.";
    res.redirect("/empresa/meu-perfil");
  }
};

exports.telaEditarVaga = async (req, res) => {
  try {
    // 1) Decodifica o ID vindo da URL
    const raw = String(req.params.id || "");
    const dec = decodeId(raw);
    const vagaId = Number.isFinite(dec)
      ? dec
      : /^\d+$/.test(raw)
      ? Number(raw)
      : NaN;

    if (!Number.isFinite(vagaId)) {
      req.session.erro = "Vaga inválida.";
      return res.redirect("/empresa/meu-perfil");
    }

    // 2) Redireciona para a versão canônica com ID criptografado, se veio numérico
    if (/^\d+$/.test(raw)) {
      const enc = encodeId(vagaId);
      const canonical = req.originalUrl.replace(raw, enc);
      if (canonical !== req.originalUrl) {
        return res.redirect(301, canonical);
      }
    }

    const empresaId = req.session?.empresa?.id;
    if (!empresaId) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/empresa/login");
    }

    // 3) Busca a vaga no banco
    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        vaga_arquivo: true,
        vaga_link: true,
      },
    });

    if (!vaga || vaga.empresa_id !== empresaId) {
      req.session.erro = "Acesso negado.";
      return res.redirect("/empresa/meu-perfil");
    }

    // 4) Normaliza tipo de local de trabalho
    const normalizaTipo = (t) => {
      switch (String(t || "").trim()) {
        case "Presencial":
          return "Presencial";
        case "Home Office":
        case "Home_Office":
          return "Home_Office";
        case "Híbrido":
        case "Hibrido":
        case "H_brido":
          return "H_brido";
        default:
          return "Presencial";
      }
    };
    vaga.tipo_local_trabalho = normalizaTipo(vaga.tipo_local_trabalho);

    // 5) Busca áreas e skills para renderização
    const areaIdsSelecionadas = vaga.vaga_area.map((v) => v.area_interesse_id);

    const areas = await prisma.area_interesse.findMany({
      where: { OR: [{ padrao: true }, { id: { in: areaIdsSelecionadas } }] },
      orderBy: { nome: "asc" },
    });

    const skills = await prisma.soft_skill.findMany();

    const selectedAreas = vaga.vaga_area.map((a) => a.area_interesse_id);
    const selectedSkills = vaga.vaga_soft_skill.map((s) => s.soft_skill_id);

    // 6) ID criptografado para usar no action do formulário
    const encId = encodeId(vagaId);

    // 7) Renderiza view
    res.render("empresas/editar-vaga", {
      vaga,
      areas,
      skills,
      selectedAreas,
      selectedSkills,
      encId,
    });
  } catch (err) {
    console.error("Erro na tela de editar vaga:", err);
    req.session.erro = "Erro ao carregar edição de vaga.";
    res.redirect("/empresa/meu-perfil");
  }
};

exports.salvarEditarVaga = async (req, res) => {
  try {
    // 1) Decodifica o ID vindo da URL (aceita codificado ou numérico cru)
    const raw = String(req.params.id || "");
    const dec = decodeId(raw);
    const vagaId = Number.isFinite(dec)
      ? dec
      : /^\d+$/.test(raw)
      ? Number(raw)
      : NaN;

    const empresaId = req.session?.empresa?.id;

    if (!Number.isFinite(vagaId) || !empresaId) {
      req.session.erro = "Acesso negado.";
      return res.redirect("/empresa/meu-perfil");
    }

    const {
      cargo,
      tipo,
      escala,
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda,
      descricao,

      pergunta, // mantém suporte
      opcao, // mantém suporte

      beneficio,
      beneficioOutro,

      areasSelecionadas,
      habilidadesSelecionadas,
      vinculo,
    } = req.body;

    const VINCULOS_OK = new Set([
      "Estagio",
      "CLT_Tempo_Integral",
      "CLT_Meio_Periodo",
      "Trainee",
      "Aprendiz",
      "PJ",
      "Freelancer_Autonomo",
      "Temporario",
    ]);
    const vinculoSafe = VINCULOS_OK.has(String(vinculo))
      ? String(vinculo)
      : null;

    // ---------- Áreas (suporta novas com 'nova:') ----------
    const areaIds = [];
    try {
      const areasBrutas = JSON.parse(areasSelecionadas || "[]");
      for (const area of areasBrutas) {
        const valor = String(area);
        if (valor.startsWith("nova:")) {
          const nomeNova = valor.slice(5).trim();
          if (!nomeNova) continue;
          let nova = await prisma.area_interesse.findFirst({
            where: { nome: nomeNova },
          });
          if (!nova) {
            nova = await prisma.area_interesse.create({
              data: { nome: nomeNova, padrao: false },
            });
          }
          areaIds.push(nova.id);
        } else {
          const n = Number(valor);
          if (Number.isFinite(n)) areaIds.push(n);
        }
      }
    } catch (e) {
      console.error("[ERRO] Falha no parse de areasSelecionadas:", e);
      req.session.erro = "Erro ao processar áreas selecionadas.";
      const enc = encodeId(vagaId);
      return res.redirect(`/empresas/vaga/${enc}/editar`);
    }

    // ---------- Soft skills ----------
    const skillIds = (() => {
      try {
        return JSON.parse(habilidadesSelecionadas || "[]")
          .map(Number)
          .filter(Number.isFinite);
      } catch {
        return [];
      }
    })();

    // ---------- Benefícios ----------
    let beneficiosArr = Array.isArray(beneficio)
      ? beneficio
      : beneficio
      ? [beneficio]
      : [];
    if ((beneficioOutro || "").trim())
      beneficiosArr.push(beneficioOutro.trim());
    const beneficiosTexto = beneficiosArr.join(", ");

    // ---------- Salário ----------
    const salarioNum = salario
      ? parseFloat(String(salario).replace(/\./g, "").replace(",", "."))
      : null;

    // ---------- Atualização principal ----------
    // Limpa relações e atualiza a vaga (inclui perguntas e vínculo)
    await prisma.vaga_area.deleteMany({ where: { vaga_id: vagaId } });
    await prisma.vaga_soft_skill.deleteMany({ where: { vaga_id: vagaId } });

    await prisma.vaga.update({
      // Se você não tiver índice único composto (id, empresa_id),
      // o Prisma ignora campos extras no "where" sem erro.
      where: { id: vagaId, empresa_id: empresaId },
      data: {
        cargo,
        tipo_local_trabalho: tipo,
        escala_trabalho: escala,
        dias_presenciais:
          (diasPresenciais ?? "") === "" ? null : parseInt(diasPresenciais, 10),
        dias_home_office:
          (diasHomeOffice ?? "") === "" ? null : parseInt(diasHomeOffice, 10),
        salario: salarioNum,
        moeda,
        descricao,
        beneficio: beneficiosTexto,
        pergunta,
        opcao,
        vinculo_empregaticio: vinculoSafe,
      },
    });

    // ---------- Recria relações (máx. 3 áreas) ----------
    const areaIdsUnicos = [...new Set(areaIds)];
    if (areaIdsUnicos.length) {
          await prisma.vaga_area.createMany({
            data: areaIdsUnicos.map((id) => ({
              vaga_id: vagaId,
              area_interesse_id: id,
            })),
            skipDuplicates: true, // Segurança extra contra erros de Pkey
          });
        }
    if (skillIds.length) {
      // Também garantimos IDs únicos para as skills
      const skillIdsUnicos = [...new Set(skillIds)];
      await prisma.vaga_soft_skill.createMany({
        data: skillIdsUnicos.map((id) => ({ 
          vaga_id: vagaId, 
          soft_skill_id: id 
        })),
        skipDuplicates: true,
      });
    }

    // ---------- Novos anexos (opcional) ----------
    if (req.files?.length) {
      await vagaArquivoController.uploadAnexosDaPublicacao(req, res, vagaId);
    }

    // ---------- Novos links (opcional) ----------
    const titulos = Array.isArray(req.body.linksTitulo)
      ? req.body.linksTitulo
      : [];
    const urls = Array.isArray(req.body.linksUrl) ? req.body.linksUrl : [];
    const toHttp = (u) =>
      /^https?:\/\//i.test(String(u || "").trim())
        ? String(u).trim()
        : "https://" + String(u || "").trim();

    const novos = [];
    for (let i = 0; i < Math.max(titulos.length, urls.length); i++) {
      const titulo = String(titulos[i] || "").trim();
      const url = toHttp(urls[i] || "");
      if (!titulo || !url) continue;
      novos.push({
        vaga_id: vagaId,
        titulo: titulo.slice(0, 120),
        url: url.slice(0, 1024),
        ordem: i + 1,
      });
    }
    if (novos.length) {
      await prisma.vaga_link.createMany({ data: novos });
    }

    req.session.sucessoVaga = "Vaga atualizada com sucesso!";
    return res.redirect("/empresa/meu-perfil");
  } catch (err) {
    console.error("[ERRO] Falha ao editar vaga (unificado):", err);
    req.session.erro = "Não foi possível editar a vaga.";
    return res.redirect("/empresa/meu-perfil");
  }
};

// Ranking

exports.rankingCandidatos = async (req, res) => {
  try {
    // 1) Captura o ID da URL. 
    // Usamos rawId para evitar confusão com o antigo 'raw'
    const rawId = String(req.params.vagaId || "");
    
    console.log("SESSÃO ATUAL:", req.session.empresa);

    let dec = decodeId(rawId);
    let vagaId = (dec && !isNaN(dec)) ? dec : rawId;

    const empresaId = req.session.empresa?.id;
    console.log("ID DA EMPRESA IDENTIFICADO:", empresaId);
    if (!empresaId) {
      req.session.erro = "Faça login como empresa para ver o ranking.";
      return res.redirect("/login");
    }

    const vaga = await prisma.vaga.findFirst({
      where: { 
        id: String(vagaId), 
        empresa_id: String(empresaId) 
      },
    });

    if (!vaga) {
      console.error("[rankingCandidatos] Vaga não encontrada ou ID inválido:", vagaId);
      req.session.erro = "Vaga não encontrada ou não pertence a esta empresa.";
      return res.redirect("/empresa/vagas");
    }

    vaga.empresa = {
      nome_empresa: req.session.empresa.nome_empresa
    };

    // 3) Busca as avaliações
    const avaliacoes = await vagaAvaliacaoModel.listarPorVaga({
      vaga_id: String(vagaId),
    });

    const tryParseJSON = (s) => {
      try { return JSON.parse(s); } catch (_) { return null; }
    };

    const ensureQmark = (str) => {
      const t = String(str || "").trim();
      if (!t) return "";
      return t.replace(/\s*([?.!…:])?\s*$/, "?");
    };

    const toLine = ({ question, answer }) => {
      const q = ensureQmark(String(question || ""));
      const a = String(answer || "").trim() || "—";
      return [q, a].join(" ");
    };

    // 4) Processamento dos candidatos
    const rows = avaliacoes.map((a, idx) => {
      const c = a.candidato || {};
      const u = c.usuario || {};

      const nome = [c.nome, c.sobrenome].filter(Boolean).join(" ").trim() ||
                   u.nome || u.email || `Candidato #${c.id || ""}`.trim();

      const local = [c.cidade, c.estado, c.pais].filter(Boolean).join(", ") || "—";
      
      const breakdown = typeof a.breakdown === "string" 
        ? tryParseJSON(a.breakdown) || {} 
        : a.breakdown || {};

      let lines = [];
      if (breakdown && typeof breakdown === "object") {
        const qa = Array.isArray(breakdown.qa) ? breakdown.qa : [];
        const da = Array.isArray(breakdown.da) ? breakdown.da : [];
        if (da.length) lines = lines.concat(da.filter((x) => x?.question).map(toLine));
        if (qa.length) lines = lines.concat(qa.filter((x) => x?.question).map(toLine));
      }

      let questions = lines.length ? lines.join("\n") : (typeof a.resposta === "string" ? a.resposta.trim() : "");

      return {
        pos: idx + 1,
        candidato_id: c.id || null,
        nome,
        local,
        telefone: c.telefone || "—",
        email: u.email || "",
        foto_perfil: c.foto_perfil || "/img/avatar.png",
        score: Number(a.score) || 0,
        score_D: Number(breakdown?.score_D) || 0,
        score_I: Number(breakdown?.score_I) || 0,
        score_S: Number(breakdown?.score_S) || 0,
        score_C: Number(breakdown?.score_C) || 0,
        explanation: breakdown?.explanation || "",
        suggestions: Array.isArray(breakdown?.suggestions) ? breakdown.suggestions : [],
        matchedSkills: Array.isArray(breakdown?.matchedSkills) ? breakdown.matchedSkills : [],
        questions,
      };
    });

    // Ordena por score decrescente
    rows.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Retorna para a view com o ID original da URL (rawId)
    return res.render("empresas/ranking-candidatos", {
      vaga,
      rows,
      encVagaId: rawId,
      activePage: "vagas",
    });

  } catch (err) {
    console.error("[rankingCandidatos] erro:", err);
    req.session.erro = "Não foi possível carregar o ranking.";
    return res.redirect("/empresa/vagas");
  }
};

exports.excluirConta = async (req, res) => {
  try {
    const empresa = req.session.empresa;
    if (!empresa) {
      req.session.erro = "Usuário não autenticado.";
      return res.redirect("/login");
    }

    // Verificar se a empresa tem um usuario_id associado
    if (!empresa.usuario_id) {
      req.session.erro = "Usuário não encontrado.";
      return res.redirect("/login");
    }

    // Carregar as vagas associadas à empresa
    const vagas = await prisma.vaga.findMany({
      where: { empresa_id: empresa.id },
    });

    // Verificar se a empresa tem vagas associadas antes de tentar excluir
    if (vagas.length > 0) {
      const vagaIds = vagas.map((vaga) => vaga.id);

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
        console.error("Erro ao destruir a sessão:", err);
      }
      res.redirect("/");
    });
  } catch (err) {
    console.error("Erro ao excluir conta da empresa:", err);
    req.session.erro = "Erro ao excluir conta. Tente novamente.";
    res.redirect("/empresa/meu-perfil");
  }
};

exports.telaAnexosEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) return res.redirect("/login");

  try {
    const anexos = await prisma.empresa_arquivo.findMany({
      where: { empresa_id: Number(sess.id) },
      orderBy: { criadoEm: "desc" },
    });

    const erro = req.flash ? req.flash("erro") : [];
    const msg = req.flash ? req.flash("msg") : [];

    res.render("empresas/anexos", { anexos, erro, msg });
  } catch (e) {
    console.error("Erro ao carregar anexos da empresa:", e);
    if (req.flash) req.flash("erro", "Não foi possível carregar anexos.");
    res.redirect("/empresa/meu-perfil");
  }
};

exports.telaVagaDetalhe = async (req, res) => {
  const empresaSess = getEmpresaFromSession(req);
  let rawId = req.params.id; 

  try {
    let idBusca = rawId;

    if (rawId && rawId.startsWith("U2FsdGVk")) {
      // TRATAMENTO DE SEGURANÇA: 
      // URLs transformam '+' em ' ' ou usam hifens. Precisamos normalizar para o Base64 padrão.
      const normalizedId = rawId.replace(/-/g, '+').replace(/_/g, '/');
      
      const dec = decodeId(normalizedId); 
      
      if (dec) {
        idBusca = String(dec);
      } else {
        console.error("FALHA NA DESCRIPTOGRAFIA: O decodeId retornou null para o ID:", rawId);
        // Se falhou, idBusca continuará sendo o rawId, o que resultará em 404 no banco
      }
    }

    console.log("DEBUG ACESSO:");
    console.log("- idBusca final:", idBusca);

    // Busca a vaga
    const vaga = await prisma.vaga.findFirst({
      where: { id: idBusca }
    });

    if (!vaga) {
      console.warn(`Vaga não encontrada no banco: ${idBusca}`);
      return res.status(404).render("shared/404", { url: req.originalUrl });
    }

// 3) BUSCAS MANUAIS (Sem usar include, pois o schema não permite)
    
    // Empresa
    vaga.empresa = await prisma.empresa.findUnique({
      where: { id: vaga.empresa_id }
    });

    // Áreas de Interesse (Manual)
    const relacoesArea = await prisma.vaga_area.findMany({
      where: { vaga_id: vaga.id }
    });
    // Para cada relação, buscamos o objeto da área de interesse
    vaga.vaga_area = await Promise.all(relacoesArea.map(async (rel) => {
      const area = await prisma.area_interesse.findUnique({
        where: { id: rel.area_interesse_id }
      });
      return { ...rel, area_interesse: area };
    }));

    // Soft Skills (Manual)
    const relacoesSkill = await prisma.vaga_soft_skill.findMany({
      where: { vaga_id: vaga.id }
    });
    // Para cada relação, buscamos o objeto da soft skill
    vaga.vaga_soft_skill = await Promise.all(relacoesSkill.map(async (rel) => {
      console.log(`Buscando Skill ID: ${rel.soft_skill_id}`);
      const skill = await prisma.soft_skill.findUnique({
        where: { id: rel.soft_skill_id }
      });
      console.log(`Resultado encontrado:`, skill ? skill.nome : "NULO");
      return { ...rel, soft_skill: skill };
    }));

    // Arquivos e Links (Simples, sem relações extras)
    vaga.vaga_arquivo = await prisma.vaga_arquivo.findMany({ where: { vaga_id: vaga.id } });
    vaga.vaga_link = await prisma.vaga_link.findMany({ where: { vaga_id: vaga.id } });

    // 4) Lógica de Status e URLs
    const statusAtual = await obterStatusDaVaga(idBusca);
    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const shareUrl = `${baseUrl}/empresa/public/vaga/${rawId}`;

    // 5) Montagem de Perguntas
    let perguntasLista = [];
    try {
      const skillNames = (vaga.vaga_soft_skill || [])
        .map((vs) => vs.soft_skill?.nome)
        .filter(Boolean);

      const { getDiscQuestionsForSkills } = require("../utils/discQuestionBank");
      const discQs = (typeof getDiscQuestionsForSkills === "function" ? getDiscQuestionsForSkills(skillNames) : []) || [];

      const extraRaw = String(vaga.pergunta || "").trim();
      const extraQs = extraRaw
        ? extraRaw.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").split("\n").map(s => s.trim()).filter(Boolean)
        : [];

      perguntasLista = [...discQs, ...extraQs];
    } catch (e) {
      console.warn("[telaVagaDetalhe] erro nas perguntas:", e.message);
    }

    console.log("HABILIDADES ENCONTRADAS:", JSON.stringify(vaga.vaga_soft_skill, null, 2));

    return res.render("empresas/vaga-detalhe", {
      vaga,
      statusAtual,
      shareUrl,
      perguntasLista,
      encId: rawId,
    });

  } catch (err) {
    console.error("Erro crítico em telaVagaDetalhe:", err);
    return res.status(500).render("shared/500", { erro: "Falha ao carregar a vaga." });
  }
};

exports.fecharVaga = async (req, res) => {
  // Aceita ID codificado ou numérico cru
  const raw = String(req.params.id || "");
  const dec = decodeId(raw);
  const vagaId = Number.isFinite(dec)
    ? dec
    : /^\d+$/.test(raw)
    ? Number(raw)
    : NaN;

  try {
    if (!Number.isFinite(vagaId)) {
      req.session.erro = "Vaga inválida.";
      return res.redirect("/empresa/meu-perfil");
    }

    const empresaId = await getEmpresaIdDaSessao(req);
    if (!empresaId) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/empresa/login");
    }

    // Confere se a vaga existe e pertence à empresa logada
    const vaga = await prisma.vaga.findFirst({
      where: { id: vagaId, empresa_id: empresaId },
      select: { id: true },
    });
    if (!vaga) {
      req.session.erro = "Vaga não encontrada ou não pertence a esta empresa.";
      return res.redirect("/empresa/meu-perfil");
    }

    // Se já está fechada, só redireciona
    const statusAtual = await obterStatusDaVaga(vagaId);
    const enc = encodeId(vagaId);
    if (statusAtual === "fechada") {
      return res.redirect(`/empresa/vaga/${enc}`);
    }

    // Grava evento "fechada"
    await prisma.vaga_status.create({
      data: { vaga_id: vagaId, situacao: "fechada" },
    });

    return res.redirect(`/empresa/vaga/${enc}`);
  } catch (err) {
    console.error("Erro fecharVaga:", err?.message || err);
    req.session.erro = "Não foi possível fechar a vaga.";
    if (Number.isFinite(vagaId)) {
      const enc = encodeId(vagaId);
      return res.redirect(`/empresa/vaga/${enc}`);
    }
    return res.redirect("/empresa/meu-perfil");
  }
};

exports.reabrirVaga = async (req, res) => {
  // Decodifica o ID (aceita codificado ou numérico cru)
  const raw = String(req.params.id || "");
  const dec = decodeId(raw);
  const vagaId = Number.isFinite(dec)
    ? dec
    : /^\d+$/.test(raw)
    ? Number(raw)
    : NaN;

  try {
    if (!Number.isFinite(vagaId)) {
      req.session.erro = "Vaga inválida.";
      return res.redirect("/empresa/meu-perfil");
    }

    const empresaId = await getEmpresaIdDaSessao(req);
    if (!empresaId) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/empresa/login");
    }

    // Confere se a vaga pertence à empresa logada
    const vaga = await prisma.vaga.findFirst({
      where: { id: vagaId, empresa_id: empresaId },
      select: { id: true },
    });
    if (!vaga) {
      req.session.erro = "Vaga não encontrada ou não pertence a esta empresa.";
      return res.redirect("/empresa/meu-perfil");
    }

    const statusAtual = await obterStatusDaVaga(vagaId);
    const enc = encodeId(vagaId);

    if (statusAtual === "aberta") {
      // Já está aberta
      return res.redirect(`/empresa/vaga/${enc}`);
    }

    await prisma.vaga_status.create({
      data: { vaga_id: vagaId, situacao: "aberta" },
    });

    req.session.sucessoVaga = "Vaga reaberta com sucesso!";
    return res.redirect(`/empresa/vaga/${enc}`);
  } catch (err) {
    console.error("Erro reabrirVaga:", err?.message || err);
    req.session.erro = "Não foi possível reabrir a vaga.";
    if (Number.isFinite(vagaId)) {
      const enc = encodeId(vagaId);
      return res.redirect(`/empresa/vaga/${enc}`);
    }
    return res.redirect("/empresa/meu-perfil");
  }
};

exports.excluirVaga = async (req, res) => {
  try {
    // Garanta que o ID da empresa seja comparado como String
    const empresaIdSessao = String(req.session?.empresa?.id || "");
    
    if (!empresaIdSessao) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/login");
    }

    // Se parseParamId usa o decodeId acima, ele retornará null se houver erro de UTF-8
    const vagaId = decodeId(req.params.id); 

    if (!vagaId) {
      req.session.erro = "Esta vaga possui um formato de identificação antigo e não pode ser excluída por aqui.";
      return res.redirect("/empresa/meu-perfil");
    }

    const vaga = await prisma.vaga.findUnique({
      where: { id: String(vagaId) },
      select: { empresa_id: true },
    });

    // Verificação de segurança rigorosa
    if (!vaga || String(vaga.empresa_id) !== empresaIdSessao) {
      req.session.erro = "Acesso negado ou vaga não encontrada.";
      return res.redirect("/empresa/meu-perfil");
    }

    // Exclusão
    await vagaModel.excluirVaga(vagaId);

    req.session.sucessoVaga = "Vaga excluída com sucesso!";
    return res.redirect("/empresa/meu-perfil");

  } catch (error) {
    console.error("Erro ao excluir vaga:", error);
    req.session.erro = "Não foi possível excluir a vaga devido a um erro interno.";
    res.redirect("/empresa/meu-perfil");
  }
};

exports.perfilPublico = async (req, res) => {
  // 1) O ID agora é tratado diretamente como String (UUID)
  const empresaId = String(req.params.id || "");

  console.log("ROTA ATINGIDA: /perfil/" + empresaId);

  // Validação básica de UUID
  if (!empresaId || empresaId.length < 30) {
    req.session.erro = "ID de empresa inválido.";
    return res.redirect("/");
  }

  try {
    // 2) Busca a empresa pura (Sem include para não quebrar no Prisma)
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
    });

    if (!empresa) {
      req.session.erro = "Empresa não encontrada.";
      return res.redirect("/");
    }

    // 3) Busca Manual de Links e Anexos da Empresa
    const links = await prisma.empresa_link.findMany({
      where: { empresa_id: empresaId },
      orderBy: { ordem: "asc" }
    });

    const arquivos = await prisma.empresa_arquivo.findMany({
      where: { empresa_id: empresaId },
      orderBy: { criadoEm: "desc" }
    });

    // 4) Carrega vagas puras da empresa
    const vagasRaw = await prisma.vaga.findMany({
      where: { empresa_id: empresaId }
    });

    // 5) Enriquece as vagas manualmente (Áreas, Links e Status)
    // Usamos Promise.all para processar todas as vagas em paralelo
    const vagasEnriquecidas = await Promise.all(vagasRaw.map(async (vaga) => {
      // Busca áreas da vaga manualmente
      const areas = await prisma.vaga_area.findMany({
        where: { vaga_id: vaga.id },
        include: { area_interesse: true } // Se area_interesse tiver @relation funciona, senão remova o include
      });

      // Busca links da vaga
      const linksVaga = await prisma.vaga_link.findMany({
        where: { vaga_id: vaga.id }
      });

      // Busca o status mais recente desta vaga
      const statusRecente = await prisma.vaga_status.findFirst({
        where: { vaga_id: vaga.id },
        orderBy: { criado_em: 'desc' },
        select: { situacao: true }
      });

      return {
        ...vaga,
        vaga_area: areas,
        vaga_link: linksVaga,
        situacao: (statusRecente?.situacao || 'aberta').toLowerCase()
      };
    }));

    // 6) Filtra para exibir apenas vagas que não estão "fechadas"
    const vagasPublicadas = vagasEnriquecidas.filter(v => v.situacao !== 'fechada');

    // 7) Verificação de Candidato Logado para status de aplicação
    const podeTestar = !!req.session?.candidato;
    const somentePreview = !podeTestar;

    if (podeTestar && vagasPublicadas.length) {
      const candidatoId = req.session.candidato.id;
      const idsVagas = vagasPublicadas.map(v => v.id);

      const aplicacoes = await prisma.vaga_avaliacao.findMany({
        where: { 
          candidato_id: candidatoId, 
          vaga_id: { in: idsVagas } 
        },
        select: { vaga_id: true }
      });

      const appliedSet = new Set(aplicacoes.map(a => a.vaga_id));
      
      vagasPublicadas.forEach(v => {
        v.ja_aplicou = appliedSet.has(v.id);
      });
    }

    // 8) Renderiza a view
    return res.render("empresas/perfil-publico", {
      empresa,
      vagasPublicadas, 
      somentePreview,
      podeTestar,
      links: links,
      anexos: arquivos,
    });

  } catch (error) {
    console.error("Erro ao carregar perfil público:", error);
    req.session.erro = "Erro ao carregar perfil.";
    return res.redirect("/");
  }
};

exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.empresa;

  // Helper de tamanho de arquivo movido para dentro ou importado
  const humanFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return "0 B";
    const thresh = 1024;
    const units = ["KB", "MB", "GB", "TB"];
    let u = -1;
    let b = bytes;
    do {
      b /= thresh;
      ++u;
    } while (Math.abs(b) >= thresh && u < units.length - 1);
    return b.toFixed(1) + " " + units[u];
  };

  if (!sess || !sess.id) return res.redirect("/login");

  try {
    // 1. Convertemos o ID para String (UUID)
    const empresaId = String(sess.id);

    // 2. Busca a empresa pura (Removido 'include' para evitar erro de schema)
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
    });

    if (!empresa) {
      req.session.erro = "Empresa não encontrada.";
      return res.redirect("/empresa/meu-perfil");
    }

    // 3. Busca Manual dos dados relacionados (Já que o schema não tem @relation)
    const links = await prisma.empresa_link.findMany({
      where: { empresa_id: empresaId },
      orderBy: { ordem: "asc" }
    });

    const arquivos = await prisma.empresa_arquivo.findMany({
      where: { empresa_id: empresaId },
      orderBy: { criadoEm: "desc" }
    });

    const localidade = [empresa.cidade, empresa.estado, empresa.pais]
      .filter(Boolean)
      .join(", ");

    // 4. Renderização
    res.render("empresas/editar-empresa", {
      usuario: req.session.usuario, // Adicionado para consistência do header
      empresa,
      descricao: empresa.descricao || "",
      humanFileSize,
      localidade,
      links: links,
      anexos: arquivos,
      activePage: "perfil"
    });

  } catch (err) {
    console.error("Erro ao abrir edição de empresa:", err);
    req.session.erro = "Erro ao carregar dados.";
    res.redirect("/empresa/meu-perfil");
  }
};

exports.salvarEdicaoPerfil = async (req, res) => {
  try {
    const sess = req.session.empresa;
    if (!sess || !sess.id) return res.redirect("/login");

    // GARANTIA: O ID agora é String (UUID)
    const empresaId = String(sess.id);

    const {
      nome,
      descricao,
      localidade,
      ddd,
      numero,
      removerFoto,
      fotoBase64,
    } = req.body;

    // --- Lógica de Localidade (Mantida) ---
    let cidade = "", estado = "", pais = "";
    if (localidade) {
      const partes = String(localidade).split(",").map((p) => p.trim());
      [cidade, estado = "", pais = ""] = partes;
    }

    // --- Lógica de Telefone (Mantida) ---
    let telefone = req.body.telefone || "";
    const dddDigits = (ddd || "").replace(/\D/g, "");
    const numDigits = (numero || "").replace(/\D/g, "");
    if (dddDigits && numDigits) {
      let numeroFmt = numDigits.length >= 9 
        ? `${numDigits.slice(0, 5)}-${numDigits.slice(5, 9)}` 
        : `${numDigits.slice(0, 4)}-${numDigits.slice(4, 8)}`;
      telefone = `+55 (${dddDigits}) ${numeroFmt}`;
    }

    // --- Lógica de Foto / Cloudinary (Mantida) ---
    let novaFotoUrl = null;
    if (String(removerFoto).toLowerCase() === "true") novaFotoUrl = "";
    if (!novaFotoUrl && fotoBase64 && /^data:image\/(png|jpe?g|webp);base64,/.test(fotoBase64)) {
      try {
        const mod = require("../config/cloudinary");
        const cloud = mod?.cloudinary || mod;
        if (cloud?.uploader) {
          const uploadRes = await cloud.uploader.upload(fotoBase64, {
            folder: "connect-skills/empresa",
            overwrite: true,
            invalidate: true,
          });
          novaFotoUrl = uploadRes.secure_url || uploadRes.url || "";
        }
      } catch (e) {
        console.warn("Falha no upload:", e.message);
      }
    }

    // --- 1. UPDATE DA EMPRESA (Removido Number) ---
    const dataUpdate = {
      nome_empresa: nome,
      descricao,
      cidade,
      estado,
      pais,
      telefone,
    };
    if (novaFotoUrl !== null) dataUpdate.foto_perfil = novaFotoUrl;

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: empresaId }, // STRING PURA
      data: dataUpdate,
    });

    // --- 2. LÓGICA DE LINKS (Substituição Manual) ---
    const urls = [].concat(req.body["link_url[]"] || req.body.link_url || []);
    const labels = [].concat(req.body["link_label[]"] || req.body.link_label || []);

    // Deleta links antigos usando a String ID
    await prisma.empresa_link.deleteMany({
      where: { empresa_id: empresaId },
    });

    const creates = [];
    let ordem = 1;
    for (let i = 0; i < urls.length; i++) {
      let url = (urls[i] || "").trim();
      if (!url) continue;
      const label = (labels[i] || "Link").toString().trim();

      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }

      // CORREÇÃO: Adicionamos um ID único (UUID) para cada link
      creates.push({ 
        id: uuidv4(), // Gerando o ID manualmente para o link
        empresa_id: empresaId, 
        label, 
        url, 
        ordem 
      });
      ordem++;
    }

    if (creates.length) {
      await prisma.empresa_link.createMany({ 
        data: creates 
      });
    }

    // --- 3. ATUALIZAÇÃO DA SESSÃO ---
    req.session.empresa = {
      ...req.session.empresa,
      nome_empresa: empresaAtualizada.nome_empresa,
      descricao: empresaAtualizada.descricao,
      cidade: empresaAtualizada.cidade,
      estado: empresaAtualizada.estado,
      pais: empresaAtualizada.pais,
      telefone: empresaAtualizada.telefone,
      foto_perfil: empresaAtualizada.foto_perfil || req.session.empresa.foto_perfil,
    };

    req.session.sucessoCadastro = "Perfil atualizado com sucesso.";
    res.redirect("/empresa/meu-perfil");

  } catch (err) {
    console.error("Erro ao salvar edição da empresa:", err);
    req.session.erro = "Erro ao salvar o perfil.";
    res.redirect("/empresa/editar-empresa");
  }
};

exports.mostrarVagas = async (req, res) => {
  if (!req.session?.empresa) return res.redirect("/login");
  const empresaId = String(req.session.empresa.id);

  const q = (req.query.q || "").trim();
  const ordenar = (req.query.ordenar || "recentes").trim();
  const tipo = (req.query.tipo || "").trim();
  const escala = (req.query.escala || "").trim();
  
  // Filtros de salário
  const salMin = req.query.sal_min ? Number(req.query.sal_min) : null;
  const salMax = req.query.sal_max ? Number(req.query.sal_max) : null;

  // Como não podemos usar 'some' em vaga_area, vamos filtrar os IDs de vaga primeiro se houver busca por área
  let vagaIdsFiltradosPorArea = null;
  let areaIds = req.query.area_ids || [];
  if (!Array.isArray(areaIds)) areaIds = [areaIds];
  areaIds = areaIds.filter(Boolean).map(Number).filter(Number.isFinite);

  try {
    // 1. Se houver filtro de área, buscamos os IDs das vagas manualmente na tabela pivô
    if (areaIds.length > 0) {
      const relacoes = await prisma.vaga_area.findMany({
        where: { area_interesse_id: { in: areaIds } },
        select: { vaga_id: true }
      });
      vagaIdsFiltradosPorArea = relacoes.map(r => r.vaga_id);
    }

    // 2. Montamos o WHERE básico (sem os campos que o Prisma não reconhece a relação)
    const where = { empresa_id: empresaId };
    
    if (vagaIdsFiltradosPorArea !== null) {
      where.id = { in: vagaIdsFiltradosPorArea };
    }

    if (q) {
      where.OR = [
        { cargo: { contains: q } },
        { descricao: { contains: q } },
      ];
    }
    if (tipo) where.tipo_local_trabalho = tipo;
    if (escala) where.escala_trabalho = { contains: escala };
    if (salMin != null || salMax != null) {
      where.salario = {};
      if (salMin != null) where.salario.gte = salMin;
      if (salMax != null) where.salario.lte = salMax;
    }

    let orderBy = { created_at: (ordenar === "antigos" ? "asc" : "desc") };

    // 3. Buscamos as vagas (Removendo os includes que dão erro)
    const vagas = await prisma.vaga.findMany({
      where,
      orderBy,
    });

    if (vagas.length === 0) {
        return res.render("empresas/vagas", { vagas: [], empresa: req.session.empresa, filtros: { q, ordenar }, tipos: [], escalas: [], areas: [] });
    }

    const vagaIds = vagas.map((v) => v.id);

    // 4. BUSCAS MANUAIS (Simulando o Include)
    // Buscamos áreas, arquivos e links separadamente para cada vaga encontrada
      const [relacoesAreas, todosArquivos, todosLinks, groupedAvaliacoes, dadosEmpresa] = await Promise.all([
      prisma.vaga_area.findMany({ where: { vaga_id: { in: vagaIds } } }), // Removido include
      prisma.vaga_arquivo.findMany({ where: { vaga_id: { in: vagaIds } } }),
      prisma.vaga_link.findMany({ where: { vaga_id: { in: vagaIds } } }),
      prisma.vaga_avaliacao.groupBy({
        by: ["vaga_id"],
        where: { vaga_id: { in: vagaIds } },
        _count: { vaga_id: true },
      }),
      prisma.empresa.findUnique({ 
        where: { id: empresaId },
        select: { nome_empresa: true, foto_perfil: true, cidade: true, estado: true, pais: true }
      })
    ]);

    const areaIdsPresentes = [...new Set(relacoesAreas.map(ra => ra.area_interesse_id))];
    const nomesAreas = await prisma.area_interesse.findMany({
      where: { id: { in: areaIdsPresentes } }
    });

    const areasMap = new Map(nomesAreas.map(a => [a.id, a]));
    const countsMap = new Map(groupedAvaliacoes.map((g) => [g.vaga_id, g._count.vaga_id]));

    // 5. Montamos o objeto final combinando os dados manualmente
    let vagasComTotal = vagas.map((v) => {
      // Montamos as áreas da vaga injetando o objeto area_interesse manualmente
      const areasDaVaga = relacoesAreas
        .filter(ra => ra.vaga_id === v.id)
        .map(ra => ({
          ...ra,
          area_interesse: areasMap.get(ra.area_interesse_id)
        }));
      const arquivosDaVaga = todosArquivos.filter(arq => arq.vaga_id === v.id);
      const linksDaVaga = todosLinks.filter(l => l.vaga_id === v.id);

      return {
        ...v,
        empresa: dadosEmpresa,
        vaga_area: areasDaVaga,
        vaga_arquivo: arquivosDaVaga,
        vaga_link: linksDaVaga,
        total_candidatos: countsMap.get(v.id) || 0,
        total_anexos: arquivosDaVaga.length,
      };
    });

    // 6. Ordenação manual para os casos especiais
    if (ordenar === "mais_candidatos") {
      vagasComTotal.sort((a, b) => b.total_candidatos - a.total_candidatos || b.created_at - a.created_at);
    } else if (ordenar === "maior_salario") {
      vagasComTotal.sort((a, b) => Number(b.salario || 0) - Number(a.salario || 0));
    }
    // ... adicione outros se necessário

    res.render("empresas/vagas", {
      vagas: vagasComTotal,
      empresa: dadosEmpresa || req.session.empresa || {},
      filtros: { q, ordenar },
      tipos: [
        { value: "Presencial", label: "Presencial" },
        { value: "Home_Office", label: "Home Office" },
        { value: "H_brido", label: "Híbrido" },
      ],
      escalas: [],
      areas: [],
    });

  } catch (err) {
    console.error("Erro ao listar vagas com filtros:", err);
    req.session.erro = "Erro ao carregar suas vagas.";
    res.redirect("/empresa/home");
  }
};

// (No seu empresaController.js)

/**
 * ✅ [NOVO] GET: Mostra o formulário para completar o cadastro (o .ejs que você criou)
 */
exports.telaComplementarGoogle = async (req, res) => {
  try {
    const usuario = req.session?.usuario || {};
    if (!usuario?.id || req.session?.usuario?.tipo !== "empresa") {
      return res.redirect("/login");
    }

    const emp = await prisma.empresa.findFirst({
      where: { usuario_id: Number(usuario.id) },
      select: {
        nome_empresa: true,
        descricao: true,
        cidade: true,
        estado: true,
        pais: true,
        telefone: true,
      },
    });

    // extrai os últimos 8/9 dígitos para preencher o campo de telefone (sem DDI/DDD)
    const somenteDigitos = (emp?.telefone || "").replace(/\D/g, "");
    const numero = somenteDigitos ? somenteDigitos.slice(-9) : "";

    return res.render("empresas/cadastro-complementar-empresa", {
      title: "Completar Cadastro - Empresa",
      erro: null,
      // nomes simples para a view
      nome: emp?.nome_empresa || "",
      descricao: emp?.descricao || "",
      localidade: [emp?.cidade, emp?.estado, emp?.pais]
        .filter(Boolean)
        .join(", "),
      ddi: "+55",
      ddd: "",
      numero,
    });
  } catch (e) {
    console.error("[telaComplementarGoogle][empresa] erro:", e);
    return res.render("empresas/cadastro-complementar-empresa", {
      title: "Completar Cadastro - Empresa",
      erro: "Erro ao carregar dados. Tente novamente.",
      nome: "",
      descricao: "",
      localidade: "",
      ddi: "+55",
      ddd: "",
      numero: "",
    });
  }
};

exports.salvarComplementarGoogle = async (req, res) => {
  try {
    const usuario_id = req.session?.usuario?.id;
    if (!usuario_id) return res.redirect("/login");

    const norm = (s) => (s ? String(s).trim() : "");
    const nomeForm = norm(req.body.nome_empresa) || norm(req.body.nome);
    const { descricao, localidade, ddi, ddd } = req.body;
    const telefoneForm = norm(req.body.telefone) || norm(req.body.numero);

    if (!nomeForm || !norm(descricao)) {
      req.session.erro = "Preencha nome da empresa e descrição.";
      return res.redirect("/empresas/complementar");
    }

    // Lógica de tratamento de telefone e endereço (mantida)
    const partes = (localidade || "").split(",").map((p) => norm(p));
    const [cidade = "", estado = "", pais = ""] =
      partes.length === 3
        ? partes
        : partes.length === 2
        ? [partes[0], "", partes[1]]
        : ["", "", ""];

    const digitos = (telefoneForm || "").replace(/\D/g, "");
    const numFmt =
      digitos.length === 9
        ? `${digitos.slice(0, 5)}-${digitos.slice(5)}`
        : digitos.length === 8
        ? `${digitos.slice(0, 4)}-${digitos.slice(4)}`
        : digitos;
    const telefoneFmt =
      norm(ddd) && numFmt
        ? `${norm(ddi) || "+55"} (${norm(ddd)}) ${numFmt}`
        : "";

    const user = await prisma.usuario.findUnique({
      where: { id: Number(usuario_id) },
      select: { avatarUrl: true },
    });

    const empresa = await prisma.empresa.upsert({
      where: { usuario_id: Number(usuario_id) },
      update: {
        nome_empresa: nomeForm,
        descricao: norm(descricao),
        cidade,
        estado,
        pais,
        telefone: telefoneFmt || "",
        foto_perfil: user?.avatarUrl || undefined,
      },
      create: {
        usuario_id: Number(usuario_id),
        nome_empresa: nomeForm,
        descricao: norm(descricao),
        cidade,
        estado,
        pais,
        telefone: telefoneFmt || "",
        foto_perfil: user?.avatarUrl || "",
      },
    });

    // Configura a sessão
    req.session.empresa = {
      id: empresa.id,
      usuario_id,
      nome_empresa: empresa.nome_empresa,
      descricao: empresa.descricao,
      cidade: empresa.cidade,
      estado: empresa.estado,
      pais: empresa.pais,
      telefone: empresa.telefone,
      foto_perfil: empresa.foto_perfil,
    };
    req.session.usuario = {
      id: usuario_id,
      tipo: "empresa",
      nome: empresa.nome_empresa,
    };

    // ALTERAÇÃO AQUI: Redireciona para Home em vez de foto-perfil
    req.session.sucessoCadastro = "Cadastro completado com sucesso!";
    await new Promise((r) => req.session.save(r));
    return res.redirect("/empresas/home");

  } catch (e) {
    console.error("[salvarComplementarGoogle][empresa] erro:", e);
    req.session.erro = "Erro ao salvar informações da empresa.";
    return res.redirect("/empresas/complementar");
  }
};

exports.pularCadastroEmpresa = async (req, res) => {
  if (!req.session.usuario) req.session.usuario = {};
  req.session.usuario.skipCadastro = true;
  if (req.session.candidato) req.session.candidato.skipCadastro = true;

  res.cookie("cs_skipCadastro", "1", {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 31536000000,
  });

  try {
    const usuarioId = Number(req.session?.usuario?.id);

    if (!usuarioId) {
      console.warn(
        "[pularCadastroEmpresa] Tentativa de pular sem sessão válida."
      );
      return res.redirect("/login");
    }

    let emp = await prisma.empresa.findUnique({
      where: { usuario_id: usuarioId },
      include: { usuario: { select: { email: true } } },
    });

    if (!emp) {
      const usr = await prisma.usuario.findUnique({ where: { id: usuarioId } }); // Usa o ID seguro
      emp = await prisma.empresa.create({
        data: {
          usuario_id: usuarioId, // Usa o ID seguro
          nome_empresa: usr?.nome || "Empresa",
          descricao: "",
          pais: "",
          estado: "",
          cidade: "",
          telefone: "",
          foto_perfil: "",
        },
        include: { usuario: { select: { email: true } } },
      });
    }

    const localidade = [emp.cidade, emp.estado, emp.pais]
      .filter(Boolean)
      .join(", ");

    req.session.usuario = {
      id: usuarioId,
      tipo: "empresa",
      nome: emp.nome_empresa,
      email: emp.usuario?.email || "",
    };
    req.session.empresa = {
      id: emp.id,
      usuario_id: usuarioId,
      nome_empresa: emp.nome_empresa,
      descricao: emp.descricao,
      email: emp.usuario?.email || "",
      telefone: emp.telefone || "",
      foto_perfil: emp.foto_perfil || "",
      cidade: emp.cidade || "",
      estado: emp.estado || "",
      pais: emp.pais || "",
      localidade,
    };

    return req.session.save(() => res.redirect("/empresas/home"));
  } catch (err) {
    console.error("[pularCadastroEmpresa] erro:", err?.message || err);
    req.session.erro = "Não foi possível pular o complemento agora.";
    return res.redirect("/login");
  }
};

exports.uploadAnexosEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) {
    req.session.erro = "Faça login para enviar anexos.";
    return res.redirect("/login");
  }

  try {
    if (!cloudinary?.uploader) {
      req.session.erro = "Storage não configurado para anexos (Cloudinary).";
      return res.redirect("/empresa/editar-empresa");
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      req.session.erro = "Nenhum arquivo selecionado.";
      return res.redirect("/empresa/editar-empresa");
    }

    let enviados = 0;
    for (const f of files) {
      const opts = {
        folder: "connect-skills/empresa/anexos",
        resource_type: "auto",
      };

      // suporta tanto storage em disco (f.path) quanto em memória (f.buffer)
      const upRes = f?.path
        ? await cloudinary.uploader.upload(f.path, opts)
        : await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(opts, (err, r) =>
              err ? reject(err) : resolve(r)
            );
            stream.end(f.buffer);
          });

      const finalUrl = upRes?.secure_url || upRes?.url || null;
      const finalMime = f?.mimetype || "application/octet-stream";
      const finalName = f?.originalname || "arquivo";
      const finalSize =
        typeof f?.size === "number" ? f.size : upRes?.bytes || 0;

      if (!finalUrl)
        throw new Error("Falha ao obter URL do anexo no Cloudinary.");

      await prisma.empresa_arquivo.create({
        data: {
          empresa_id: Number(sess.id),
          nome: String(finalName).slice(0, 255),
          mime: String(finalMime).slice(0, 100),
          tamanho: Number(finalSize) || 0,
          url: finalUrl,
        },
      });

      enviados++;
    }

    req.session.sucessoCadastro = `${enviados} arquivo(s) enviado(s) com sucesso.`;
    return res.redirect("/empresa/editar-empresa");
  } catch (e) {
    console.error("uploadAnexosEmpresa erro:", e);
    req.session.erro =
      "Falha ao enviar anexos. Verifique o arquivo e tente novamente.";
    return res.redirect("/empresa/editar-empresa");
  }
};

exports.abrirAnexoEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) return res.redirect("/login");

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("ID inválido.");

  try {
    const ax = await prisma.empresa_arquivo.findFirst({
      where: { id, empresa_id: Number(sess.id) },
      select: { url: true },
    });
    if (!ax) {
      req.session.erro = "Anexo não encontrado.";
      return res.redirect("/empresa/editar-empresa");
    }
    if (!ax.url || ax.url === "#") {
      req.session.erro = "Arquivo sem URL válida.";
      return res.redirect("/empresa/editar-empresa");
    }
    return res.redirect(ax.url); // navegador abre (PDF/IMG) ou baixa (demais)
  } catch (e) {
    console.error("abrirAnexoEmpresa erro:", e);
    req.session.erro = "Falha ao abrir o anexo.";
    return res.redirect("/empresa/editar-empresa");
  }
};

exports.excluirAnexoEmpresa = async (req, res) => {
  const sess = req.session?.empresa;
  if (!sess?.id) return res.redirect("/login");

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send("ID inválido.");

  try {
    const ax = await prisma.empresa_arquivo.findFirst({
      where: { id, empresa_id: Number(sess.id) },
      select: { id: true },
    });
    if (!ax) {
      req.session.erro = "Anexo não encontrado.";
      return res.redirect("/empresa/editar-empresa");
    }

    await prisma.empresa_arquivo.delete({ where: { id: ax.id } });
    req.session.sucessoCadastro = "Anexo excluído.";
    return res.redirect("/empresa/editar-empresa");
  } catch (e) {
    console.error("excluirAnexoEmpresa erro:", e);
    req.session.erro = "Falha ao excluir o anexo.";
    return res.redirect("/empresa/editar-empresa");
  }
};

exports.gerarDescricaoIA = async (req, res) => {
  try {
    const { shortdesc } = req.body;
    if (!shortdesc) return res.status(400).json({ erro: 'Contexto não fornecido.' });

    const [dbHardSkills, dbSoftSkills] = await Promise.all([
      prisma.area_interesse.findMany({ select: { nome: true } }),
      prisma.soft_skill.findMany({ select: { nome: true } })
    ]);

    // O SEGREDO: Misturamos as do banco com as novas, mas damos ênfase às novas
    const nomesBanco = dbSoftSkills.map(s => s.nome);
    // Pegamos uma amostra aleatória da lista de 250 para renovar as opções da IA toda vez
    const amostraNovas = skillsLista
      .filter(s => !nomesBanco.includes(s))
      .sort(() => 0.5 - Math.random())
      .slice(0, 100); // Pega 100 aleatórias

    const listaParaIA = [...dbSoftSkills.map(s => s.nome), ...amostraNovas];

    const payload = {
      // Adicionamos uma instrução extra no texto para a IA
      shortDesc: `Atue como Recrutador Tech. Com base no contexto: "${shortdesc}". 
                  IMPORTANTE: Escolha habilidades comportamentais modernas e específicas da lista fornecida, 
                  evite apenas o básico como "Comunicação" ou "Trabalho em equipe" se houver opções mais precisas.`,
      skills: dbHardSkills.map(s => s.nome),
      softSkills: listaParaIA
    };

    const response = await axios.post(process.env.IA_GEN_DESC, payload, { timeout: 90000 });
    
    let dadosIA = response.data;
    if (dadosIA.response) {
      dadosIA = typeof dadosIA.response === 'string' ? JSON.parse(dadosIA.response) : dadosIA.response;
    }

    return res.json({
      sucesso: true,
      cargoSugerido: dadosIA.jobTitle || '', 
      longDescription: dadosIA.longDescription || '',
      bestCandidate: dadosIA.bestCandidate || '',
      questions: dadosIA.questions || [],
      areas: dadosIA.requiredSkills || [],
      skills: dadosIA.behaviouralSkills || dadosIA.softSkills || dadosIA.skills || []
      });

  } catch (error) {
    console.error('--- ERRO NA IA ---', error.message);
    return res.status(500).json({ erro: 'A IA falhou em gerar a descrição.' });
  }
};