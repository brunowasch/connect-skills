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
    const usuario_id = req.session.usuario.id;

    const { nome_empresa, descricao } = req.body;

    // Verificação de segurança (garante que a sessão existe)
    if (!usuario_id) {
      req.session.erro = "Sessão inválida. Faça login novamente.";
      return res.redirect("/login");
    }

    if (!nome_empresa || !descricao) {
      req.session.erro = "Todos os campos são obrigatórios.";
      return res.redirect(`/empresas/nome-empresa`);
    }

    const empresaExistente = await empresaModel.obterEmpresaPorUsuarioId(
      usuario_id
    );
    if (empresaExistente) {
      req.session.erro = "Perfil de empresa já cadastrado.";
      return res.redirect("/empresas/home");
    }

    await empresaModel.criarEmpresa({
      usuario_id: Number(usuario_id),
      nome_empresa,
      descricao,
    });

    return res.redirect(`/empresas/localizacao`);
  } catch (err) {
    console.error("Erro ao inserir empresa:", err);
    req.session.erro = "Erro ao salvar os dados da empresa.";
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
      console.error("Sessão de empresa inválida ou ausente na home.");
      req.session.erro = "Sessão inválida. Faça login novamente.";
      return res.redirect("/login");
    }

    const localidade =
      [empresa.cidade, empresa.estado, empresa.pais]
        .filter(Boolean)
        .join(", ") || "Localidade não informada";

    const empresaId = Number(empresa.id);

    const vagasAll = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        empresa: {
          select: {
            nome_empresa: true,
            foto_perfil: true,
            cidade: true,
            estado: true,
            pais: true,
          },
        },
        vaga_link: true,
      },
      orderBy: { created_at: "desc" },
    });

    const vagaIds = vagasAll.map((v) => v.id);

    let countsMap = new Map();
    if (vagaIds.length) {
      const grouped = await prisma.vaga_avaliacao.groupBy({
        by: ["vaga_id"],
        where: { vaga_id: { in: vagaIds } },
        _count: { vaga_id: true },
      });
      countsMap = new Map(grouped.map((g) => [g.vaga_id, g._count.vaga_id]));
    }

    let statusMap = new Map();
    if (vagaIds.length) {
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: vagaIds } },
        orderBy: { criado_em: "desc" },
        select: { vaga_id: true, situacao: true },
      });
      for (const s of statusList) {
        if (!statusMap.has(s.vaga_id))
          statusMap.set(s.vaga_id, (s.situacao || "aberta").toLowerCase());
      }
    }

    const vagasDecoradas = vagasAll.map((v) => ({
      ...v,
      total_candidatos: countsMap.get(v.id) || 0,
      status: statusMap.get(v.id) || "aberta",
    }));

    const totalVagas = vagasDecoradas.length;
    const totalCandidatos = vagasDecoradas.reduce(
      (acc, v) => acc + (v.total_candidatos || 0),
      0
    ); // ===== Avatar padrão e Progress =====

    const fotoPerfil =
      empresa.foto_perfil && empresa.foto_perfil.trim() !== ""
        ? empresa.foto_perfil
        : "/img/avatar.png"; // (Você tinha avatar.png, talvez seja /img/placeholder-empresa.png?)

    const checklistEmp = [
      !!(empresa.nome_empresa && empresa.nome_empresa.trim() !== ""),
      !!(empresa.descricao && empresa.descricao.trim() !== ""),
      localidade !== "Localidade não informada",
      !!(empresa.telefone && empresa.telefone.trim() !== ""),
      !!(empresa.foto_perfil && empresa.foto_perfil.trim() !== ""),
    ];
    const profileCompletion = Math.round(
      (checklistEmp.filter(Boolean).length / checklistEmp.length) * 100
    );

    res.render("empresas/home-empresas", {
      nome: empresa.nome_empresa,
      descricao: empresa.descricao,
      telefone: empresa.telefone,
      localidade,
      fotoPerfil,
      usuario: req.session.usuario,
      empresa,
      vagasRecentes: vagasDecoradas,
      totais: { totalVagas, totalCandidatos },
      activePage: "home",
      profileCompletion,
    });
  } catch (err) {
    console.error("Erro ao exibir home da empresa:", err);
    req.session.erro = "Erro ao carregar home.";
    res.redirect("/login");
  }
};

exports.telaPerfilEmpresa = async (req, res) => {
  const sess = req.session.empresa;
  if (!sess) return res.redirect("/login");

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(sess.id) },
      include: {
        empresa_link: { orderBy: { ordem: "asc" } },
        empresa_arquivo: { orderBy: { criadoEm: "desc" } },
      },
    });

    if (!empresa) {
      req.session.erro = "Empresa não encontrada.";
      return res.redirect("/empresa/home");
    }

    const vagasDaEmpresa = await prisma.vaga.findMany({
      where: { empresa_id: empresa.id },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
      },
    });

    const encEmpresaId = encodeId(Number(empresa.id));
    const perfilPublicoUrl = `/empresa/perfil/${encEmpresaId}`;

    const vagasComHid = vagasDaEmpresa.map((v) => ({
      ...v,
      _hid: encodeId(v.id),
    }));

    return res.render("empresas/meu-perfil", {
      empresa,
      vagasPublicadas: vagasDaEmpresa,
      // disponibiliza também a lista com _hid
      vagasPublicadasEnc: vagasComHid,

      // links/arquivos
      links: empresa.empresa_link,
      anexos: empresa.empresa_arquivo,

      // novos helpers p/ view
      encEmpresaId,
      perfilPublicoUrl,
    });
  } catch (error) {
    console.error("Erro ao buscar vagas/empresa:", error);
    req.session.erro = "Erro ao carregar perfil.";
    return res.redirect("/empresa/home");
  }
};

exports.telaPublicarVaga = async (req, res) => {
try {
    const empresa = getEmpresaFromSession(req);
    if (!empresa) return res.redirect('/login');

    // 1. Buscamos todas, mas vamos filtrar as "sujeiras"
    const areasRaw = await prisma.area_interesse.findMany({
      orderBy: { nome: 'asc' }
    });

    // 2. Lista de termos que você quer esconder (sujeira do banco)
    const termosSujeira = ['teste', 'fs', 'igugui', 'njkhbhjkb', 'testes'];

    const areas = areasRaw
      .filter(area => {
        const nomeLower = area.nome.toLowerCase();
        // Remove se o nome for muito curto ou se estiver na lista de sujeira
        return !termosSujeira.some(sujeira => nomeLower.includes(sujeira)) && area.nome.length > 2;
      })
      .map(area => {
        return {
          ...area,
          nome: area.nome.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())
        };
      });

    const softSkills = await prisma.soft_skill.findMany({
      orderBy: { nome: 'asc' }
    });

    res.render('empresas/publicar-vaga', {
      empresa,
      areas,
      softSkills,
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
        // Pega o primeiro item válido do array (como vimos no DEBUG)
        if (Array.isArray(rawSkills)) {
            rawSkills = rawSkills.find(item => item && item !== '[]') || "";
        }

        try {
            if (typeof rawSkills === 'string' && rawSkills.trim() !== "") {
                let parsed;
                if (rawSkills.startsWith('[')) {
                    parsed = JSON.parse(rawSkills);
                } else {
                    parsed = rawSkills.split(',').map(s => s.trim());
                }
                
                // Converte para número e remove aspas, preenchendo a variável correta
                softSkillIds = parsed.map(id => {
                    const limpo = String(id).replace(/["']/g, "");
                    return parseInt(limpo, 10);
                }).filter(n => !isNaN(n));
            }
        } catch (e) {
            console.error("Erro no parse de habilidadesSelecionadas:", e);
        }
    }
      console.log("Habilidades identificadas para salvar (AGORA VAI):", softSkillIds);

    // Transação: cria a vaga, vincula até 3 áreas (existentes + novas),
    // cria áreas novas se necessário, e vincula soft skills
    const vagaCriada = await prisma.$transaction(async (tx) => {
      const vaga = await tx.vaga.create({
        data: {
          empresa_id: Number(empresaSessao.id),
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
            vaga_id: vaga.id,
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
    // 1) Decodifica o param (aceita codificado ou numérico cru)
    const raw = String(req.params.vagaId || "");
    const dec = decodeId(raw);
    const vagaId = Number.isFinite(dec)
      ? dec
      : /^\d+$/.test(raw)
      ? Number(raw)
      : NaN;

    const empresaId = await getEmpresaIdDaSessao(req);
    if (!empresaId) {
      req.session.erro = "Faça login como empresa para ver o ranking.";
      return res.redirect("/login");
    }

    if (!Number.isFinite(vagaId)) {
      req.session.erro = "Vaga inválida.";
      return res.redirect("/empresa/vagas");
    }

    // 2) Se veio numérico cru, canonicaliza para a versão com ID codificado (GET)
    if (/^\d+$/.test(raw)) {
      const enc = encodeId(vagaId);
      const canonical = req.originalUrl.replace(raw, enc);
      if (canonical !== req.originalUrl) {
        return res.redirect(301, canonical);
      }
    }

    // 3) Confere se a vaga pertence à empresa logada
    const vaga = await prisma.vaga.findFirst({
      where: { id: vagaId, empresa_id: empresaId },
      include: { empresa: true },
    });
    if (!vaga) {
      req.session.erro = "Vaga não encontrada ou não pertence a esta empresa.";
      return res.redirect("/empresa/vagas");
    }

    // 4) Busca as avaliações
    const avaliacoes = await vagaAvaliacaoModel.listarPorVaga({
      vaga_id: vagaId,
    });

    const tryParseJSON = (s) => {
      try {
        return JSON.parse(s);
      } catch (_) {
        return null;
      }
    };

    // garante interrogação ao final, se não houver pontuação
    const ensureQmark = (str) => {
      const t = String(str || "").trim();
      if (!t) return "";
      // substitui qualquer pontuação final por "?" ou adiciona "?" se não houver
      return t.replace(/\s*([?.!…:])?\s*$/, "?");
    };

    const toLine = ({ question, answer }) => {
      const q = ensureQmark(String(question || ""));
      const a = String(answer || "").trim() || "—";
      return [q, a].join(" ");
    };

    const rows = avaliacoes.map((a, idx) => {
      const c = a.candidato || {};
      const u = c.usuario || {};

      const nome =
        [c.nome, c.sobrenome].filter(Boolean).join(" ").trim() ||
        u.nome ||
        u.email ||
        `Candidato #${c.id || ""}`.trim();

      const local =
        [c.cidade, c.estado, c.pais].filter(Boolean).join(", ") || "—";
      const telefone = c.telefone || "—";
      const foto_perfil = c.foto_perfil || "/img/avatar.png";
      const email = u.email || "";

      // breakdown pode ter sido salvo como string
      const breakdown =
        typeof a.breakdown === "string"
          ? tryParseJSON(a.breakdown) || {}
          : a.breakdown || {};

      // reconstrói TODAS as perguntas a partir de breakdown.qa + breakdown.da
      let lines = [];
      if (breakdown && typeof breakdown === "object") {
        const qa = Array.isArray(breakdown.qa) ? breakdown.qa : [];
        const da = Array.isArray(breakdown.da) ? breakdown.da : [];
        if (da.length)
          lines = lines.concat(da.filter((x) => x?.question).map(toLine));
        if (qa.length)
          lines = lines.concat(qa.filter((x) => x?.question).map(toLine));
      }

      // fallback para texto consolidado salvo
      let questions = lines.length ? lines.join("\n") : "";
      if (!questions && typeof a.resposta === "string") {
        questions = a.resposta.trim();
      }

      // fallbacks legados (se houver { questions: "..." } em algum campo)
      if (!questions) {
        const p =
          typeof a.payload === "string" ? tryParseJSON(a.payload) : a.payload;
        const r =
          typeof a.api_result === "string"
            ? tryParseJSON(a.api_result)
            : a.api_result;
        const rr =
          typeof a.result === "string" ? tryParseJSON(a.result) : a.result;
        questions =
          (p && p.questions) ||
          (r && r.questions) ||
          (rr && rr.questions) ||
          questions ||
          "";
        if (typeof questions !== "string") questions = "";
      }

      const score_D = Number(breakdown?.score_D) || 0;
      const score_I = Number(breakdown?.score_I) || 0;
      const score_S = Number(breakdown?.score_S) || 0;
      const score_C = Number(breakdown?.score_C) || 0;

      const explanation =
        typeof breakdown?.explanation === "string" ? breakdown.explanation : "";
      const suggestions = Array.isArray(breakdown?.suggestions)
        ? breakdown.suggestions
        : [];
      const matchedSkills = Array.isArray(breakdown?.matchedSkills)
        ? breakdown.matchedSkills
        : [];

      return {
        pos: idx + 1,
        candidato_id: c.id || null,
        nome,
        local,
        telefone,
        email,
        foto_perfil,

        score: Number(a.score) || 0,
        score_D,
        score_I,
        score_S,
        score_C,

        explanation,
        suggestions,
        matchedSkills,

        questions,
      };
    });
    rows.sort((a, b) => (b.score || 0) - (a.score || 0));

    const encVagaId = encodeId(vagaId);

    return res.render("empresas/ranking-candidatos", {
      vaga,
      rows,
      encVagaId,
      activePage: "vagas",
    });
  } catch (err) {
    console.error("[rankingCandidatos] erro:", err?.message || err);
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

  // 1) Decodifica o param e canonicaliza se vier numérico "cru"
  const raw = String(req.params.id || "");
  const dec = decodeId(raw);
  const id = Number.isFinite(dec) ? dec : /^\d+$/.test(raw) ? Number(raw) : NaN;

  if (!Number.isFinite(id)) {
    return res.status(404).render("shared/404", { url: req.originalUrl });
  }

  if (/^\d+$/.test(raw)) {
    const enc = encodeId(id);
    const canonical = req.originalUrl.replace(raw, enc);
    if (canonical !== req.originalUrl) {
      return res.redirect(301, canonical);
    }
  }

  try {
    const vaga = await prisma.vaga.findFirst({
      where: {
        id,
        ...(empresaSess?.id ? { empresa_id: Number(empresaSess.id) } : {}),
      },
      include: {
        empresa: true,
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        vaga_arquivo: true,
        vaga_link: true,
      },
    });

    if (!vaga) {
      return res.status(404).render("shared/404", { url: req.originalUrl });
    }

    const statusAtual = await obterStatusDaVaga(id);

    const encId = encodeId(id);
    const baseUrl =
      process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const shareUrl = `${baseUrl}/empresa/public/vaga/${encId}`;

    let perguntasLista = [];
    try {
      const skillNames = (vaga.vaga_soft_skill || [])
        .map((vs) => vs.soft_skill?.nome)
        .filter(Boolean);

      const {
        getDiscQuestionsForSkills,
      } = require("../utils/discQuestionBank");
      const discQs =
        (typeof getDiscQuestionsForSkills === "function"
          ? getDiscQuestionsForSkills(skillNames)
          : []) || [];

      const extraRaw = String(vaga.pergunta || "").trim();
      const extraQs = extraRaw
        ? extraRaw
            .replace(/\r\n/g, "\n")
            .replace(/\\r\\n/g, "\n")
            .replace(/\\n/g, "\n")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      perguntasLista = [...discQs, ...extraQs];
    } catch (e) {
      console.warn(
        "[telaVagaDetalhe] falha ao montar perguntas:",
        e?.message || e
      );
      perguntasLista = [];
    }

    return res.render("empresas/vaga-detalhe", {
      vaga,
      statusAtual,
      shareUrl,
      perguntasLista,
      encId,
    });
  } catch (err) {
    console.error("Erro telaVagaDetalhe", err);
    return res
      .status(500)
      .render("shared/500", { erro: "Falha ao carregar a vaga." });
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
  const empresaSess = getEmpresaFromSession(req);

  // 1) Decodifica o ID (aceita codificado ou numérico cru)
  const raw = String(req.params.id || "");
  const dec = decodeId(raw);
  const vagaId = Number.isFinite(dec)
    ? dec
    : /^\d+$/.test(raw)
    ? Number(raw)
    : NaN;

  if (!Number.isFinite(vagaId)) {
    return res.redirect("/empresa/meu-perfil?erro=vaga_invalida");
  }

  try {
    const empresaId = empresaSess?.id ? Number(empresaSess.id) : null;
    if (!empresaId) {
      req.session.erro = "Sessão expirada. Faça login novamente.";
      return res.redirect("/empresa/login");
    }

    // 2) Confere se a vaga pertence à empresa logada
    const vaga = await prisma.vaga.findFirst({
      where: { id: vagaId, empresa_id: empresaId },
      select: { id: true },
    });
    if (!vaga) {
      return res.redirect("/empresa/meu-perfil?erro=vaga_nao_encontrada");
    }

    // 3) Monta a transação de exclusão (respeitando modelos existentes)
    const tx = [
      prisma.vaga_area.deleteMany({ where: { vaga_id: vagaId } }),
      prisma.vaga_soft_skill.deleteMany({ where: { vaga_id: vagaId } }),
    ];

    if (prisma.vaga_hard_skill?.deleteMany) {
      tx.push(
        prisma.vaga_hard_skill.deleteMany({ where: { vaga_id: vagaId } })
      );
    }
    if (prisma.vaga_status?.deleteMany) {
      tx.push(prisma.vaga_status.deleteMany({ where: { vaga_id: vagaId } }));
    }
    if (prisma.vaga_avaliacao?.deleteMany) {
      tx.push(prisma.vaga_avaliacao.deleteMany({ where: { vaga_id: vagaId } }));
    }

    tx.push(prisma.vaga.delete({ where: { id: vagaId } }));

    await prisma.$transaction(tx);

    req.session.sucessoVaga = "Vaga excluída com sucesso!";
    return res.redirect("/empresa/meu-perfil");
  } catch (err) {
    console.error("Erro excluirVaga:", err?.message || err);
    req.session.erro = "Não foi possível excluir a vaga.";
    if (Number.isFinite(vagaId)) {
      const enc = encodeId(vagaId);
      return res.redirect(`/empresa/vaga/${enc}`);
    }
    return res.redirect("/empresa/meu-perfil?erro=nao_foi_possivel_excluir");
  }
};

exports.perfilPublico = async (req, res) => {
  // 1) Decodifica o ID da empresa (aceita codificado ou numérico cru)
  const raw = String(req.params.id || "");
  const dec = decodeId(raw);
  const empresaId = Number.isFinite(dec)
    ? dec
    : /^\d+$/.test(raw)
    ? Number(raw)
    : NaN;

  if (!Number.isFinite(empresaId)) {
    req.session.erro = "ID de empresa inválido.";
    return res.redirect("/");
  }

  // 2) Redireciona para a versão canônica com ID codificado se veio numérico
  if (/^\d+$/.test(raw)) {
    const enc = encodeId(empresaId);
    const canonical = req.originalUrl.replace(raw, enc);
    if (canonical !== req.originalUrl) {
      return res.redirect(301, canonical);
    }
  }

  try {
    // 3) Carrega a empresa com links e anexos
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      include: {
        empresa_link: { orderBy: { ordem: "asc" } },
        empresa_arquivo: { orderBy: { criadoEm: "desc" } },
      },
    });

    if (!empresa) {
      req.session.erro = "Empresa não encontrada.";
      return res.redirect("/");
    }

    // 4) Carrega vagas publicadas da empresa
    const vagasPublicadasAll = await prisma.vaga.findMany({
      where: { empresa_id: empresaId },
      include: {
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } },
        vaga_arquivo: true,
        vaga_link: true,
      },
    });

    // 5) Filtra apenas vagas abertas
    const ids = vagasPublicadasAll.map((v) => v.id);
    let vagasPublicadas = vagasPublicadasAll;
    if (ids.length) {
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: ids } },
        orderBy: { criado_em: "desc" },
        select: { vaga_id: true, situacao: true, criado_em: true },
      });
      const latest = new Map();
      for (const s of statusList) {
        if (!latest.has(s.vaga_id))
          latest.set(s.vaga_id, (s.situacao || "aberta").toLowerCase());
      }
      vagasPublicadas = vagasPublicadasAll.filter(
        (v) => (latest.get(v.id) || "aberta") !== "fechada"
      );
    }

    // 6) Enriquecimento: se o usuário logado é candidato, traz status das aplicações
    const podeTestar = !!req.session?.candidato;
    const somentePreview = !podeTestar;

    if (podeTestar && vagasPublicadas.length) {
      const candidatoId = Number(req.session.candidato.id);
      const idsAbertas = vagasPublicadas.map((v) => v.id);

      const avals = await prisma.vaga_avaliacao.findMany({
        where: { candidato_id: candidatoId, vaga_id: { in: idsAbertas } },
        select: { vaga_id: true, resposta: true },
      });

      const appliedSet = new Set(avals.map((a) => a.vaga_id));
      const mapResp = new Map(avals.map((a) => [a.vaga_id, a.resposta || ""]));

      for (const vaga of vagasPublicadas) {
        vaga.ja_aplicou = appliedSet.has(vaga.id);

        const texto = mapResp.get(vaga.id) || "";
        if (!texto) continue;

        const linhas = texto
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const apenasRespostas = linhas
          .map((L) => {
            const m = L.match(/\?\s*(.*)$/);
            return m ? m[1].trim() : "";
          })
          .filter(Boolean);

        vaga.respostas_previas = apenasRespostas;
        vaga.resposta_unica = apenasRespostas[0] || "";
      }
    }

    // 7) Codifica os IDs das vagas antes de enviar à view
    const vagasComIdsCodificados = vagasPublicadas.map((v) => ({
      ...v,
      _hid: encodeId(v.id),
    }));

    // 8) Renderiza view
    return res.render("empresas/perfil-publico", {
      empresa,
      vagasPublicadas: vagasComIdsCodificados,
      somentePreview,
      podeTestar,
      links: empresa.empresa_link || [],
      anexos: empresa.empresa_arquivo || [],
    });
  } catch (error) {
    console.error("Erro ao carregar perfil público:", error);
    req.session.erro = "Erro ao carregar perfil.";
    return res.redirect("/");
  }
};

exports.telaEditarPerfil = async (req, res) => {
  const sess = req.session.empresa;
  const humanFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return "0 B";
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let u = -1;
    do {
      bytes /= thresh;
      ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + " " + units[u];
  };
  if (!sess) return res.redirect("/login");

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(sess.id) },
      include: {
        empresa_link: { orderBy: { ordem: "asc" } },
        empresa_arquivo: { orderBy: { criadoEm: "desc" } },
      },
    });

    const localidade = [empresa.cidade, empresa.estado, empresa.pais]
      .filter(Boolean)
      .join(", ");

    res.render("empresas/editar-empresa", {
      empresa,
      descricao: empresa.descricao || "",
      humanFileSize,
      localidade,
      links: empresa.empresa_link,
      anexos: empresa.empresa_arquivo,
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
    if (!sess) return res.redirect("/login");

    const {
      nome,
      descricao,
      localidade,
      ddd,
      numero,
      removerFoto,
      fotoBase64,
    } = req.body;

    let cidade = "",
      estado = "",
      pais = "";
    if (localidade) {
      const partes = String(localidade)
        .split(",")
        .map((p) => p.trim());
      [cidade, estado = "", pais = ""] = partes;
    }

    let telefone = req.body.telefone || "";
    const dddDigits = (ddd || "").replace(/\D/g, "");
    const numDigits = (numero || "").replace(/\D/g, "");
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

    if (String(removerFoto).toLowerCase() === "true") {
      novaFotoUrl = "";
    }

    if (
      !novaFotoUrl &&
      fotoBase64 &&
      /^data:image\/(png|jpe?g|webp);base64,/.test(fotoBase64)
    ) {
      try {
        // [MELHORIA DE ORGANIZAÇÃO]
        // Esta linha deve ser movida para o topo do arquivo
        const mod = require("../config/cloudinary");
        const cloud = mod?.cloudinary || mod;
        const uploader = cloud?.uploader;

        if (uploader && typeof uploader.upload === "function") {
          const uploadRes = await uploader.upload(fotoBase64, {
            folder: "connect-skills/empresa",
            overwrite: true,
            invalidate: true,
          });
          novaFotoUrl = uploadRes.secure_url || uploadRes.url || "";
        } else {
          console.warn(
            "[editar-empresa] Cloudinary não configurado ou sem uploader. Pulando upload."
          );
        }
      } catch (e) {
        console.warn(
          "[editar-empresa] Falha ao enviar foto para Cloudinary:",
          e.message
        );
      }
    }

    const dataUpdate = {
      nome_empresa: nome,
      descricao,
      cidade,
      estado,
      pais,
      telefone,
    };
    if (novaFotoUrl !== null) {
      dataUpdate.foto_perfil = novaFotoUrl;
    }

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: Number(sess.id) },
      data: dataUpdate,
    });

    const urls = Array.isArray(req.body["link_url[]"])
      ? req.body["link_url[]"]
      : Array.isArray(req.body.link_url)
      ? req.body.link_url
      : req.body.link_url
      ? [req.body.link_url]
      : [];
    const labels = Array.isArray(req.body["link_label[]"])
      ? req.body["link_label[]"]
      : Array.isArray(req.body.link_label)
      ? req.body.link_label
      : req.body.link_label
      ? [req.body.link_label]
      : [];

    await prisma.empresa_link.deleteMany({
      where: { empresa_id: Number(sess.id) },
    });

    const creates = [];
    let ordem = 1;
    for (let i = 0; i < urls.length; i++) {
      let url = (urls[i] || "").trim(); // 'let' para podermos modificar
      if (!url) continue;
      const label = (labels[i] || "Link").toString().trim();

      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }

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
      foto_perfil:
        empresaAtualizada.foto_perfil || req.session.empresa.foto_perfil,
    };

    req.session.sucessoCadastro = "Perfil atualizado com sucesso.";
    res.redirect("/empresa/meu-perfil");
  } catch (err) {
    console.error("Erro ao salvar edição da empresa:", err);
    req.session.erro = "Erro ao salvar o perfil. Tente novamente.";
    res.redirect("/empresa/editar-empresa");
  }
};

exports.mostrarVagas = async (req, res) => {
  if (!req.session?.empresa) return res.redirect("/login");
  const empresaId = Number(req.session.empresa.id);

  const q = (req.query.q || "").trim();
  const ordenar = (req.query.ordenar || "recentes").trim();

  const tipo = (req.query.tipo || "").trim();
  const escala = (req.query.escala || "").trim();
  const salMin = req.query.sal_min ? Number(req.query.sal_min) : null;
  const salMax = req.query.sal_max ? Number(req.query.sal_max) : null;
  let areaIds = req.query.area_ids || [];
  if (!Array.isArray(areaIds)) areaIds = [areaIds];
  areaIds = areaIds
    .filter(Boolean)
    .map((x) => Number(x))
    .filter(Number.isFinite);

  const where = { empresa_id: empresaId };

  if (q) {
    where.OR = [
      { cargo: { contains: q } },
      { descricao: { contains: q } },
      { vaga_area: { some: { area_interesse: { nome: { contains: q } } } } },
    ];
  }

  if (tipo) where.tipo_local_trabalho = tipo;
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
    let orderBy = { created_at: "desc" };
    if (ordenar === "antigos") orderBy = { created_at: "asc" };

    const vagas = await prisma.vaga.findMany({
      where,
      include: {
        vaga_area: { include: { area_interesse: true } },
        empresa: {
          select: {
            nome_empresa: true,
            foto_perfil: true,
            cidade: true,
            estado: true,
            pais: true,
          },
        },
        vaga_arquivo: true,
        vaga_link: true,
      },
      orderBy,
    });

    const vagaIds = vagas.map((v) => v.id);
    let countsMap = new Map();
    if (vagaIds.length) {
      const grouped = await prisma.vaga_avaliacao.groupBy({
        by: ["vaga_id"],
        where: { vaga_id: { in: vagaIds } },
        _count: { vaga_id: true },
      });
      countsMap = new Map(grouped.map((g) => [g.vaga_id, g._count.vaga_id]));
    }

    let vagasComTotal = vagas.map((v) => ({
      ...v,
      total_candidatos: countsMap.get(v.id) || 0,
      total_anexos: v.vaga_arquivo?.length || 0,
    }));

    switch (ordenar) {
      case "mais_candidatos":
        vagasComTotal.sort(
          (a, b) =>
            b.total_candidatos - a.total_candidatos ||
            b.created_at - a.created_at
        );
        break;
      case "menos_candidatos":
        vagasComTotal.sort(
          (a, b) =>
            a.total_candidatos - b.total_candidatos ||
            b.created_at - a.created_at
        );
        break;
      case "maior_salario":
        vagasComTotal.sort(
          (a, b) =>
            Number(b.salario || 0) - Number(a.salario || 0) ||
            b.created_at - a.created_at
        );
        break;
      case "menor_salario":
        vagasComTotal.sort(
          (a, b) =>
            Number(a.salario || 0) - Number(b.salario || 0) ||
            b.created_at - a.created_at
        );
        break;
    }

    res.render("empresas/vagas", {
      vagas: vagasComTotal,
      empresa: vagas[0]?.empresa || req.session.empresa || {},
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

    const temFoto = Boolean(
      empresa.foto_perfil && empresa.foto_perfil.trim() !== ""
    );

    await new Promise((r) => req.session.save(r));
    return res.redirect("/empresas/foto-perfil");
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

    if (!shortdesc) {
      return res.status(400).json({ erro: 'Contexto não fornecido.' });
    }

    // Chamada para a API externa
    const response = await axios.post(process.env.IA_GEN_DESC, {
      shortdesc: shortdesc
    });

    let dadosIA = {};

    // Tratamento robusto para extrair o JSON da resposta da API
    if (response.data && response.data.response) {
      dadosIA = typeof response.data.response === 'string' 
        ? JSON.parse(response.data.response) 
        : response.data.response;
    } 
    else if (response.data && (response.data.questions || response.data.requiredSkills)) {
      dadosIA = response.data;
    }

    // 1. Processa as perguntas (questions)
    let perguntasTexto = '';
    if (Array.isArray(dadosIA.questions)) {
      perguntasTexto = dadosIA.questions.join('\n');
    } else {
      perguntasTexto = dadosIA.questions || '';
    }

    // 2. Retorna todos os dados mapeados para o frontend
    // Incluindo agora as áreas e habilidades para o 1º botão (Descrição)
    return res.json({
      sucesso: true,
      longDescription: dadosIA.longDescription || '',
      bestCandidate: dadosIA.bestCandidate || '', // Perfil do candidato
      questions: perguntasTexto,                   // Perguntas para IA
      areas: dadosIA.requiredSkills || [],        // Áreas de Atuação (requiredSkills do JSON)
      skills: dadosIA.behaviouralSkills || []     // Habilidades (behaviouralSkills do JSON)
    });

  } catch (error) {
    console.error('Erro ao processar IA:', error.message);
    return res.status(500).json({ erro: 'A IA não retornou um formato válido ou houve erro na conexão.' });
  }
};