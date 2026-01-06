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

const LISTA_HABILIDADES = [
    "A/B Testing", "Acabamento de Interiores", "Adobe After Effects", "Adobe Illustrator", "Adobe Photoshop", 
    "Adobe Premiere Pro", "Alinhamento de Eixos", "Almoxarifado e Estocagem", "Alvenaria Estrutural", 
    "Análise de Dados", "Análise de Falhas Mecânicas", "Análise de Metas de Vendas", "Análise de Riscos Ocupacionais", 
    "Android Development", "Angular", "API RESTful", "Apontamento de Produção", "Arduino e Prototipagem", 
    "Armação de Ferragens", "Arquitetura de Software", "Asphalt Paving", "ASP.NET Core", "Assembly Language", 
    "Assentamento de Pisos e Azulejos", "Atendimento ao Cliente (PDV)", "AutoCAD 2D/3D", "Automação Industrial (CLP)", 
    "AWS (Cloud)", "Azure DevOps", "Balanceamento de Rodas", "Balanço Patrimonial", "Bancos de Dados NoSQL", 
    "Bancos de Dados Relacionais (SQL)", "Big Data Analytics", "Blockchain", "Blueprint Reading (Leitura de Plantas)", 
    "Bootstrap", "C#", "C++", "Cálculo de Materiais", "Carpintaria de Formas", "Cercamento Elétrico", 
    "Chapeação e Pintura", "Cibersegurança", "Ciclo PDCA", "Cloud Computing", "CNC (Comando Numérico Computadorizado)", 
    "Cobit Framework", "Cold Calling", "Comércio Exterior", "Configuração de Firewalls", "Configuração de Modems/Roteadores", 
    "Conhecimento de Normas Regulamentadoras (NRs)", "Conserto de Eletrodomésticos", "Contabilidade Básica", 
    "Controle de Estoque (Inventory Management)", "Controle de Qualidade (QA)", "Copywriting", "Corte e Dobra de Aço", 
    "Corte e Solda a Plasma", "CRM (Salesforce/HubSpot)", "CSS3", "Dart", "Data Mining", "Data Science", 
    "Data Visualization", "Deep Learning", "Desenho Técnico Mecânico", "Desenvolvimento de Chatbots", "DevOps", 
    "Diagramas Unifilares", "Django Framework", "Docker", "E-commerce Management", "Edição de Vídeo", "Elétrica Automotiva", 
    "Elétrica Predial", "Electron", "Eletrônica Digital", "Elixir", "Encanamento e Hidráulica", "Energia Fotovoltaica (Instalação)", 
    "Engenharia de Prompt", "ERP (SAP/Oracle/Totvs)", "Escaneamento 3D", "Escrituração Fiscal", "Estatística Aplicada", 
    "Estruturas Metálicas", "ETL (Extract, Transform, Load)", "Excel Avançado", "Express.js", "Fardamento e Merchandising", 
    "Ferramentaria", "Figma", "Firebase", "Flutter", "Fluxo de Caixa", "Folha de Pagamento", "Funilaria Automotiva", 
    "Gesso Acartonado (Drywall)", "Gestão de Backlog", "Gestão de Frotas", "Gestão de Resíduos Industriais", 
    "Gestão de Tráfego Pago", "Git & GitHub", "Google Ads", "Google Analytics", "Google Cloud Platform (GCP)", "Go (Golang)", 
    "GraphQL", "HTML5", "IBGE (Classificação de Produtos)", "Impermeabilização de Lajes", "Inbound Marketing", "Indústria 4.0", 
    "Instalação de Ar Condicionado", "Instalação de Câmeras (CFTV)", "Instalação de Drywall", "Instalação de Redes de Proteção", 
    "Instalações Elétricas Industriais", "Inteligência de Negócios (BI)", "Interpretação de Desenho Técnico", "Inventário de Ativos", 
    "iOS Development (Swift)", "Java", "JavaScript", "Jenkins", "Jogos Digitais (Unity/Unreal)", "Kaban", "Kotlin", "Kubernetes", 
    "Laravel", "Layout de Fábrica", "Lean Manufacturing", "Leitura de Instrumentos (Paquímetro/Micrômetro)", "Linux (Administração de Sistemas)", 
    "Logística Reversa", "Machine Learning", "Manutenção Corretiva e Preventiva", "Manutenção de Computadores (Hardware)", 
    "Manutenção de Elevadores", "Manutenção de Motores Diesel", "Manutenção Hidráulica", "Manutenção Industrial", "Manutenção Predial", 
    "Marcenaria Fina", "Marketing de Conteúdo", "Mecânica de Fluidos", "Mecânica de Motocicletas", "Mecânica Diesel", "Mecânica Pesada", 
    "Mecatrônica", "Metodologias Ágeis (Scrum)", "Metrologia", "Microsoft Power BI", "Microserviços", "Mix de Produtos", 
    "Modelagem 3D", "Modelagem de Dados", "MongoDB", "Montagem de Andaimes", "Montagem de Estruturas de Madeira", "Montagem de Móveis", 
    "Montagem de Painéis Elétricos", "MySQL", "Next.js", "Node.js", "NoSQL", "NumPy", "Objective-C", "Operação de Betoneira", 
    "Operação de Empilhadeira", "Operação de Escavadeira", "Operação de Máquina Injetora", "Operação de Pontes Rolantes", 
    "Operação de Prensa", "Operação de Retroescavadeira", "Operação de Torno Mecânico", "Oracle Database", "Padrões de Projeto (Design Patterns)", 
    "Pandas (Python)", "Patch Panel e Cabeamento", "Pavimentação", "PHP", "Pintura Automotiva", "Pintura Industrial", 
    "Pintura Predial", "Planejamento de Produção (PCP)", "Plataformas CMS (WordPress)", "Pneumática", "PostgreSQL", "PowerShell", 
    "Prevenção de Perdas", "Processamento de Linguagem Natural (NLP)", "Product Management", "Programação de CLPs", "Programação de CNC", 
    "Pronto Atendimento (Suporte Técnico)", "Prototipagem de UI/UX", "Python", "PyTorch", "R Language", "React Native", "React.js", 
    "Recuperação de Motores", "Redes de Computadores (TCP/IP)", "Redis", "Redux", "Refrigeração Comercial", "Reparo de Dispositivos Móveis", 
    "Reparo de Placas Eletrônicas", "Revestimento Cerâmico", "Ruby on Rails", "Rust", "Sass/SCSS", "Segurança da Informação", 
    "Segurança do Trabalho (EPI/EPC)", "Selenium", "SEO (Search Engine Optimization)", "Serralheria", "Serviços de Alvenaria", 
    "Shell Script", "Six Sigma (6 Sigma)", "SketchUp", "Solda MIG/MAG", "Solda TIG", "Soldagem a Arco", "Spring Boot", "SQL Server", 
    "Swift", "Tableau", "Tailwind CSS", "Técnicas de Negociação", "Técnicas de Soldagem", "Telemarketing", "TensorFlow", "Terraform", 
    "Topografia", "TypeScript", "UI/UX Design", "Usinagem", "Vendas B2B", "Vendas Consultivas", "Visual Merchandising", "Vue.js", 
    "Webpack", "Windows Server"
];

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
  return res.render('candidatos/cadastro-de-nome-e-sobrenome-candidatos');
};

exports.salvarNomeCandidato = async (req, res) => {
  const usuario_id = req.session.usuario.id; 
  const { nome, sobrenome, data_nascimento } = req.body;

  // Verificação de segurança
  if (!usuario_id) {
    req.session.erro = 'Sua sessão expirou. Faça login novamente.';
    return res.redirect('/login');
  }

  try {
    await candidatoModel.criarCandidato({
      usuario_id: Number(usuario_id),
      nome,
      sobrenome,
      data_nascimento: new Date(data_nascimento),
    });

    return res.redirect('/candidatos/cadastro/areas');

  } catch (err) {
    console.error('Erro ao salvar nome e sobrenome:', err);
    req.session.erro = 'Erro ao salvar seus dados iniciais. Tente novamente.';
    return res.redirect('/candidatos/cadastro/nome');
  }
};

exports.telaCadastroAreas = async (req, res) => {
    const usuario = req.session.usuario;
    
    // Renderiza a view passando a lista de habilidades
    res.render('candidatos/cadastro-areas', { 
        usuario,
        habilidades: LISTA_HABILIDADES 
    });
};

exports.salvarCadastroAreas = async (req, res) => {
  const usuario_id = req.session.usuario?.id;

  try {
    // 1. Validação de Sessão
    if (!usuario_id) {
      req.session.erro = 'Sessão expirada. Faça login novamente.';
      return res.redirect('/login');
    }

    // 2. Parse do Input
    let { areasSelecionadas } = req.body;
    
    // Log para depuração (veja isso no seu terminal)
    console.log("Input recebido (RAW):", areasSelecionadas);

    if (!areasSelecionadas) {
        req.session.erro = 'Nenhuma área selecionada.';
        return res.redirect('/candidatos/cadastro/areas');
    }

    if (typeof areasSelecionadas === 'string') {
      try {
        areasSelecionadas = JSON.parse(areasSelecionadas);
      } catch (e) {
        // Se falhar o parse, tenta usar como string única ou array simples
        console.error("Erro ao fazer parse do JSON:", e);
        areasSelecionadas = [areasSelecionadas]; 
      }
    }

    // Garante que é um array
    if (!Array.isArray(areasSelecionadas)) {
        areasSelecionadas = [areasSelecionadas];
    }

    console.log("Áreas processadas:", areasSelecionadas);

    // 3. Buscar candidato
    const candidato = await prisma.candidato.findUnique({
      where: { usuario_id: Number(usuario_id) }
    });

    if (!candidato) {
      req.session.erro = 'Candidato não encontrado.';
      return res.redirect('/candidatos/cadastro/areas');
    }

    // --- CORREÇÃO PRINCIPAL AQUI ---
    // Em vez de só buscar e falhar se não achar, vamos buscar os IDs.
    // Se o ID não existir, precisamos decidir: ou cria ou avisa.
    // Para facilitar seu teste, vamos criar lógica de "Encontrar ou Criar" (Upsert logic simulada)
    
    // Primeiro, busca as que já existem
    const areasExistentes = await prisma.area_interesse.findMany({
      where: { nome: { in: areasSelecionadas } }
    });
    
    // Cria uma lista de IDs
    const idsParaSalvar = [...areasExistentes.map(a => a.id)];

    // Se você quiser que o sistema aceite qualquer coisa que o usuário enviou
    // e crie no banco se não existir (Recomendado se a lista hardcoded for a fonte da verdade):
    const nomesExistentes = areasExistentes.map(a => a.nome);
    const nomesFaltantes = areasSelecionadas.filter(nome => !nomesExistentes.includes(nome));

    for (const nomeNovaArea of nomesFaltantes) {
        if(nomeNovaArea && nomeNovaArea.trim() !== "") {
            const novaArea = await prisma.area_interesse.create({
                data: { nome: nomeNovaArea, padrao: true } // Ajuste 'padrao' conforme seu schema
            });
            idsParaSalvar.push(novaArea.id);
        }
    }
    
    console.log("IDs finais para salvar:", idsParaSalvar);

    if (idsParaSalvar.length === 0) {
      req.session.erro = 'Nenhuma área válida foi processada. O banco de dados pode estar vazio.';
      return res.redirect('/candidatos/cadastro/areas');
    }

    // 4. Limpa e Salva
    // Transaction garante que apaga e cria junto
    await prisma.$transaction([
        prisma.candidato_area.deleteMany({
            where: { candidato_id: candidato.id }
        }),
        prisma.candidato_area.createMany({
            data: idsParaSalvar.map(id => ({
                candidato_id: candidato.id,
                area_interesse_id: id
            }))
        })
    ]);

    req.session.sucesso = 'Áreas de interesse salvas com sucesso!';
    return res.redirect('/candidatos/home');

  } catch (error) {
    console.error('Erro CRÍTICO ao salvar áreas:', error);
    req.session.erro = 'Erro interno ao salvar suas áreas.';
    return res.redirect('/candidatos/cadastro/areas');
  }
};



exports.telaLocalizacao = (req, res) => {
  res.render('candidatos/localizacao-login-candidato');
};

exports.salvarLocalizacao = async (req, res) => {
  const usuario_id = req.session.usuario.id; 
  const { localidade } = req.body;

  if (!usuario_id) {
    req.session.erro = 'Sessão inválida. Faça login novamente.';
    return res.redirect('/login');
  }

  // Validação dos dados do formulário
  if (!localidade) {
    req.session.erro = 'Localidade ausente.';
    return res.redirect(`/candidato/localizacao`);
  }

  const partes = localidade.split(',').map(p => p.trim());
  if (partes.length < 2 || partes.length > 3) {
    req.session.erro = 'Informe uma localidade válida. Ex: cidade e país, ou cidade, estado e país.';
    return res.redirect(`/candidato/localizacao`);
  }

  const [cidade, estado = '', pais = ''] = partes;

  try {
    await candidatoModel.atualizarLocalizacao({
      usuario_id: Number(usuario_id), 
      cidade,
      estado,
      pais,
    });

    return res.redirect(`/candidato/telefone`);

  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    req.session.erro = 'Erro ao salvar localização. Tente novamente.';
    return res.redirect(`/candidato/localizacao`);
  }
};

exports.telaTelefone = (req, res) => {
  res.render('candidatos/telefone', { error: null, telefoneData: {} });
};

exports.salvarTelefone = async (req, res) => {
  const usuario_id = req.session.usuario.id; 
  const { ddi, ddd, telefone } = req.body;

  // Verificação de segurança (garante que a sessão existe)
  if (!usuario_id) {
    req.session.erro = 'Sessão inválida. Faça login novamente.';
    return res.redirect('/login');
  }

  if (!ddi || !ddd || !telefone) {
    return res.render('candidatos/telefone', {
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

    return res.redirect(`/candidato/cadastro/foto-perfil`);

  } catch (err) {
    console.error('Erro ao salvar telefone:', err);
    return res.render('candidatos/telefone', {
      error: 'Erro ao salvar telefone. Tente novamente.',
      telefoneData: { ddi, ddd, telefone }
    });
  }
};

exports.telaFotoPerfil = (req, res) => {
  return res.render('candidatos/foto-perfil', { error: null });
};

exports.salvarFotoPerfil = async (req, res) => {
  const usuario_id = req.session.usuario.id;

  if (isNaN(usuario_id)) {
    console.error('Erro ao salvar foto: ID da sessão inválido.');
    return res.render('candidatos/foto-perfil', {
      error: 'Sessão inválida. Tente fazer login novamente.'
    });
  }

  if (!req.file?.buffer) {
    return res.render('candidatos/foto-perfil', {
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

    const candidato = await prisma.candidato.findUnique({ where: { usuario_id: Number(usuario_id) } });

    if (!candidato) {
      // Isso não deve acontecer se o 'salvarNome' funcionou.
      throw new Error(`Candidato não existe (usuario_id ${usuario_id})`);
    }

    await prisma.candidato.update({
      where: { id: candidato.id },
      data: { foto_perfil: caminhoFoto }
    });

    // Atualiza a foto na sessão para aparecer no header
    if (req.session.candidato) {
      req.session.candidato.foto_perfil = caminhoFoto;
    }

    return res.redirect(`/candidato/cadastro/areas`);

  } catch (err) {
    console.error('Erro ao salvar foto de perfil:', err);
    return res.render('candidatos/foto-perfil', {
      error: 'Erro interno ao salvar a foto. Tente novamente.'
    });
  }
};

exports.telaSelecionarAreas = async (req, res) => {
  try {
    // O 'ensureCandidato' já protege a rota, não precisamos de 'uid'.
    const areas = await prisma.area_interesse.findMany({
      where: { padrao: true },
      orderBy: { nome: 'asc' }
    });

    res.render('candidatos/selecionar-areas', { areas });

  } catch (erro) {
    console.error('Erro ao carregar áreas:', erro);
    req.session.erro = 'Erro ao carregar áreas. Tente novamente.';
    res.redirect(`/candidato/cadastro/areas`);
  }
};

exports.salvarAreas = async (req, res) => {
  const usuario_id = req.session.usuario.id;
  const { areasSelecionadas, outra_area_input } = req.body;
  const nomes = JSON.parse(areasSelecionadas || '[]');

  // Verificação de segurança
  if (!usuario_id) {
    req.session.erro = 'Sessão inválida. Faça login novamente.';
    return res.redirect('/login');
  }

  if (nomes.length !== 3) {
    req.session.erro = 'Selecione exatamente 3 áreas válidas.';
    return res.redirect(`/candidato/cadastro/areas`);
  }

  try {
    const candidato = await candidatoModel.obterCandidatoPorUsuarioId(Number(usuario_id));
    if (!candidato) {
      req.session.erro = 'Candidato não encontrado.';
      return res.redirect(`/candidato/cadastro/areas`);
    }

    const nomesFinal = [...nomes];
    if (nomes.includes('Outro')) {
      if (!outra_area_input || outra_area_input.trim() === '') {
        req.session.erro = "Você selecionou 'Outro', mas não preencheu a nova área.";
        return res.redirect(`/candidato/cadastro/areas`);
      }
      const novaArea = await candidatoModel.upsertNovaArea(outra_area_input.trim());
      const index = nomesFinal.indexOf('Outro');
      nomesFinal.splice(index, 1, novaArea.nome);
    }

    const ids = await candidatoModel.buscarIdsDasAreas({ nomes: nomesFinal });
    if (ids.length !== 3) {
      req.session.erro = 'Erro ao localizar todas as áreas selecionadas.';
      return res.redirect(`/candidato/cadastro/areas`);
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
   req.session.save(() => res.redirect('/candidatos/home')); // Redirecionamento final para a Home!

  } catch (error) {
    console.error('Erro ao salvar áreas de interesse:', error);
    req.session.erro = 'Erro ao salvar áreas de interesse. Tente novamente.';
    res.redirect(`/candidato/cadastro/areas`);
  }
};


exports.telaHomeCandidato = async (req, res) => {
  // Pegamos o ID da conta (tabela Usuario)
  const userId = req.session.usuario?.id;
  if (!userId) return res.redirect('/login');

  try {
    // 1) Carrega o candidato do banco usando USUARIO_ID
    const candDb = await prisma.candidato.findUnique({
      where: { usuario_id: Number(userId) }, // Busca pela relação com o usuário
      include: {
        candidato_area: { include: { area_interesse: true } }
      }
    });

    // Se não encontrar o perfil do candidato, redireciona para criar um
    if (!candDb) {
      console.warn('Perfil de candidato não encontrado para o usuário:', userId);
      return res.redirect('/candidatos/cadastro/nome'); 
    }

    // Mapeia os nomes das áreas
    const areasNomes = (candDb.candidato_area || [])
      .map(r => r?.area_interesse?.nome)
      .filter(Boolean);

    // 2) Sincroniza a sessão do candidato com os dados do banco
    const localidadeBanco = [candDb.cidade, candDb.estado, candDb.pais]
      .filter(Boolean)
      .join(', ') || "Local não informado";

    req.session.candidato = {
      id: candDb.id,
      usuario_id: candDb.usuario_id,
      nome: candDb.nome || "Candidato",
      sobrenome: candDb.sobrenome || "",
      telefone: candDb.telefone,
      foto_perfil: candDb.foto_perfil || "/img/avatar.png",
      localidade: localidadeBanco,
      areas: areasNomes,
      data_nascimento: candDb.data_nascimento
    };

    // 3) Vagas recomendadas (usa o ID do CANDIDATO para buscar)
    let vagas = [];
    try {
      vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(Number(candDb.id));
    } catch (e) {
      console.warn('[home] falha ao buscar vagas recomendadas:', e.message);
    }

    // --- Filtro de Vagas Abertas ---
    const vagaIds = vagas.map(v => v.id);
    if (vagaIds.length > 0) {
      const statusList = await prisma.vaga_status.findMany({
        where: { vaga_id: { in: vagaIds } },
        orderBy: { criado_em: 'desc' },
        select: { vaga_id: true, situacao: true }
      });
      
      const latestStatusMap = new Map();
      statusList.forEach(s => {
        if (!latestStatusMap.has(s.vaga_id)) {
          latestStatusMap.set(s.vaga_id, (s.situacao || 'aberta').toLowerCase());
        }
      });
      
      vagas = vagas.filter(v => (latestStatusMap.get(v.id) || 'aberta') !== 'fechada');
    }

    // 4) Histórico de candidaturas
    const avaliacoes = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id: Number(candDb.id) },
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

    const historico = (avaliacoes || [])
      .filter(a => a.vaga)
      .map(a => ({
        vaga: { id: a.vaga.id, cargo: a.vaga.cargo },
        empresa: { 
            id: a.vaga.empresa?.id, 
            nome: a.vaga.empresa?.nome_empresa, 
            nome_empresa: a.vaga.empresa?.nome_empresa 
        },
        created_at: a.created_at || a.criado_em,
        status: a.status || 'em_analise'
      }));

    // Filtra vagas que o usuário já aplicou
    const appliedIds = new Set(historico.map(h => h.vaga.id));
    vagas = vagas.filter(v => !appliedIds.has(v.id));

    // 5) Render da home usando os dados validados
    res.render('candidatos/home-candidatos', {
      nome: req.session.candidato.nome,
      sobrenome: req.session.candidato.sobrenome,
      localidade: req.session.candidato.localidade,
      activePage: 'home',
      usuario: req.session.usuario,
      candidato: req.session.candidato,
      vagas,
      historico,
      candidaturasAplicadasCount: historico.length,
      areas: areasNomes // Passamos o array de strings diretamente
    });

  } catch (err) {
    console.error('[telaHomeCandidato] erro crítico:', err);
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

    const dataBase = candidato.data_nascimento || candidato.usuario?.data_nascimento;

    let dataFormatada = "";
    if (dataBase) {
      // Converte para objeto Date e formata para o padrão BR considerando o fuso horário correto
      const dateObj = new Date(dataBase);
      dataFormatada = dateObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    const arquivos = candidato.candidato_arquivo || [];
    const anexos = arquivos;

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
    }

    const cand = await prisma.candidato.findUnique({
    where: { id: Number(usuario.id) },
    include: { candidato_area: { include: { area_interesse: true } } }
  });
  const areas = (cand?.candidato_area || [])
    .map(r => r.area_interesse?.nome)
    .filter(Boolean);



    const vagasParaView = vagas.map(vaga => {
      const empresa = vaga.empresa || {}; // Garante que empresa não é nula
      return {
        ...vaga,
        encId: encodeId(vaga.id), // ID da vaga codificado
        empresa: {
          ...empresa,
          encId: encodeId(empresa.id) // ID da empresa codificado
        }
      };
    });


  res.render('candidatos/vagas', {
    vagas: vagasParaView, // MUDANÇA: Passando o array modificado
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
    const candidatoId = sess.id; 

    const candidato = await prisma.candidato.findUnique({
      where: { id: candidatoId },
      include: { 
        candidato_area: { 
          include: { area_interesse: true } 
        } 
      }
    });

    if (!candidato) {
      req.session.erro = 'Candidato não encontrado.';
      return res.redirect('/login');
    }

    // Mapeia as áreas que o candidato já possui
    const areasAtuaisObjetos = candidato.candidato_area.map(ca => ({
      id: ca.area_interesse.id,
      nome: ca.area_interesse.nome
    }));

    // Busca todas as opções disponíveis no banco para o sistema de busca
    const todasOpcoes = await prisma.area_interesse.findMany({
      orderBy: { nome: 'asc' } // Opcional: traz em ordem alfabética
    });

    res.render('candidatos/editar-areas', {
      candidatoId,
      areasAtuaisObjetos, 
      todasOpcoes,
      areasAtuais: areasAtuaisObjetos.map(a => a.nome) 
    });

  } catch (err) {
    console.error('Erro ao carregar as áreas de interesse:', err);
    req.session.erro = 'Erro ao carregar as áreas de interesse.';
    res.redirect('/candidatos/meu-perfil');
  }
};

exports.salvarEditarAreas = async (req, res) => {
  const sess = req.session.candidato;
  if (!sess) return res.redirect('/login');
  const candidato_id = Number(sess.id);

  let nomesSelecionados;

  try {
    // O frontend agora envia uma string JSON de nomes
    nomesSelecionados = typeof req.body.areasSelecionadas === 'string' 
      ? JSON.parse(req.body.areasSelecionadas) 
      : req.body.areasSelecionadas;
  } catch (err) {
    req.session.erro = 'Formato inválido de áreas selecionadas.';
    return res.redirect('/candidatos/editar-areas');
  }

  // 1. Verificação básica (se vazio)
  if (!Array.isArray(nomesSelecionados) || nomesSelecionados.length === 0) {
    req.session.erro = 'Selecione ao menos uma área.';
    return res.redirect('/candidatos/editar-areas');
  }


  try {
    const nomesUnicos = [...new Set(nomesSelecionados)];

    const areasEncontradas = await prisma.area_interesse.findMany({
      where: {
        nome: { in: nomesUnicos }
      }
    });

    if (areasEncontradas.length === 0) {
      req.session.erro = 'Áreas inválidas selecionadas.';
      return res.redirect('/candidatos/editar-areas');
    }

    // 4. Transação para limpar e salvar as novas áreas
    await prisma.$transaction([
      // Deleta as áreas antigas do candidato
      prisma.candidato_area.deleteMany({ 
        where: { candidato_id } 
      }),
      // Cria as novas relações
      prisma.candidato_area.createMany({
        data: areasEncontradas.map(area => ({
          candidato_id: candidato_id,
          area_interesse_id: area.id
        })),
        skipDuplicates: true
      })
    ]);

    req.session.sucesso = 'Áreas de interesse atualizadas com sucesso!';
    return res.redirect('/candidatos/meu-perfil');

  } catch (error) {
    console.error('Erro ao salvar áreas de interesse:', error);
    req.session.erro = 'Não foi possível salvar as alterações.';
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
      sobrenome: usuario?.sobrenome || ''
    });
  } catch (error) {
    console.error('Erro ao buscar usuário para complementar cadastro:', error);
    res.render('candidatos/cadastro-complementar-google', {
      title: 'Completar Cadastro - Connect Skills',
      erro: 'Erro ao carregar os dados. Tente novamente.',
      nome: '',
      sobrenome: ''
    });
  }
};

exports.complementarGoogle = async (req, res) => {
  try {
    const usuarioId = req.session.usuario?.id;
    if (!usuarioId) return res.redirect('/login');

    let { nome, sobrenome, data_nascimento, localidade, foto_perfil } = req.body;
    const [cidade = '', estado = '', pais = ''] = (localidade || '').split(',').map(p => p.trim());

    // ... (Sua lógica de formatação de telefone está ótima)
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

    if (!data_nascimento || isNaN(new Date(data_nascimento))) {
      req.session.erro = 'Informe uma data de nascimento válida (AAAA-MM-DD).';
      return res.redirect('/candidatos/cadastro/google/complementar');
    }
    if (!cidade || !pais) {
      req.session.erro = 'Informe a localidade no formato "Cidade, Estado, País".';
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
      email: candidatoCompleto.usuario?.email,
      tipo: 'candidato',
      telefone: candidatoCompleto.telefone,
      dataNascimento: candidatoCompleto.data_nascimento,
      foto_perfil: candidatoCompleto.foto_perfil || usuarioCompleto.avatarUrl || null,
      localidade: `${candidatoCompleto.cidade}, ${candidatoCompleto.estado}, ${candidatoCompleto.pais}`,
      areas: []
    };

    req.session.save(() => res.redirect(`/candidatos/cadastro/areas`));
   } catch (erro) {
    console.error('Erro ao complementar cadastro com Google:', erro.message, erro);
    req.session.erro = 'Erro ao salvar informações do candidato.';
    res.redirect('/candidatos/cadastro/google/complementar');
  }
};

exports.avaliarCompatibilidade = async (req, res) => {
  try {
    const sess = req.session?.candidato;
    if (!sess) {
      return res.status(401).json({ ok: false, error: 'Não autenticado' });
    }
    const candidato_id = Number(sess.id);

    // 2. Lógica de ID (Sua lógica original - Correta)
    const vaga_id = Number(req.params.id);
    if (!vaga_id || vaga_id <= 0) {
       return res.status(400).json({ ok: false, error: 'ID de vaga inválido' });
    }

    // 3. Verificação de Status (Substituindo 'isVagaFechada')
    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: vaga_id },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    // Lógica para Vagas Antigas (Solução 1): Se 'null', considere 'aberta'
    const situacaoAtual = statusMaisRecente?.situacao || 'aberta';

    if (situacaoAtual !== 'aberta') {
      return res.status(403).json({ ok: false, error: 'Esta vaga está fechada no momento.' });
    }

    // 4. Verificação de Duplicata (Sua lógica original - Correta)
    const existente = await prisma.vaga_avaliacao.findFirst({
      where: { vaga_id, candidato_id },
      select: { id: true }
    });
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Você já realizou o teste desta vaga.' });
    }

    // 5. Busca consolidada (APÓS a verificação de segurança)
    const vagaDb = await prisma.vaga.findUnique({
      where: { id: vaga_id },
      select: {
        descricao: true,
        vaga_soft_skill: { include: { soft_skill: true } }
      }
    });

    if (!vagaDb) {
      return res.status(404).json({ ok: false, error: 'Vaga não encontrada.' });
    }

    const qaRaw = Array.isArray(req.body.qa) ? req.body.qa : [];
    let itemsStr = typeof req.body.items === 'string' ? req.body.items.trim() : '';
    const skillsRaw = Array.isArray(req.body.skills) ? req.body.skills : [];

    if (!itemsStr) {
      if (vagaDb?.descricao?.trim()) {
        itemsStr = vagaDb.descricao.trim();
      }
    }

    const qaNormalized = qaRaw
      .map(x => ({
        question: typeof x?.question === 'string' ? x.question.trim() : '',
        answer:   typeof x?.answer   === 'string' ? x.answer.trim()   : ''
      }))
      .filter(x => x.question || x.answer);

    let skills = skillsRaw
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    // Usando 'vagaDb' (Removida a busca duplicada)
    if (!skills.length) {
      skills = (vagaDb?.vaga_soft_skill || [])
        .map(vs => vs.soft_skill?.nome)
        .filter(Boolean);
    }

    // 7. Restante da sua Lógica de Negócios (Tudo mantido)
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

    const linesDa = (da || []).filter(x => (x.question || '').trim()).map(toLine);
    const linesQa = (qa || []).filter(x => (x.question || '').trim()).map(toLine);
    const respostaFlattenAll = [...linesDa, ...linesQa].filter(Boolean).join('\n');

    const payload = {
      qa:     escapeQAArray(qa),
      items:  escapeNL(itemsStr),
      skills: skills,
      da:     escapeDAArray(da)
    };

    console.log('[Compat] Payload a enviar para /suggest:', JSON.stringify(payload, null, 2));

    const url = process.env.IA_SUGGEST_URL || 'http://159.203.185.226:4000/suggest';
    const axiosResp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const respData = (axiosResp && typeof axiosResp === 'object') ? axiosResp.data : axiosResp;
    const raw = safeParse(respData);
    const results = normalizeResults(raw);

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
        resposta: respostaFlattenAll,
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
        suggestions:  Array.isArray(raw.suggestions)  ? raw.suggestions  : [],
        explanation:  raw.explanation || '',
        skills
      });
    }

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
  try {
    const id = Number(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).send('ID de vaga inválido');
    }

    // 1. Buscamos a vaga
    const vaga = await prisma.vaga.findUnique({
      where: { id: id },
      include: {
        empresa: {
          include: {
            usuario: { select: { id: true, nome: true, sobrenome: true, email: true } }
          }
        },
        vaga_area:       { include: { area_interesse: { select: { id: true, nome: true } } } },
        vaga_soft_skill: { include: { soft_skill: { select: { id: true, nome: true } } } },
        vaga_arquivo: true,
        vaga_link: true
      }
    });

    if (!vaga) {
      return res.status(404).send('Vaga não encontrada');
    }

    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: id },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    
    const situacaoAtual = statusMaisRecente?.situacao || 'aberta'; 
    const STATUS_PERMITIDO = 'aberta';
    
    if (situacaoAtual !== STATUS_PERMITIDO) {
      return res.status(404).send('Vaga não encontrada');
    }
    
    console.log('===== DEBUG DE SEGURANÇA =====');
    console.log('ID da Vaga:', id);
    console.log('Status encontrado no banco:', statusMaisRecente);
    console.log('Status esperado:', STATUS_PERMITIDO);
    console.log('O status é o permitido?', statusMaisRecente?.situacao === STATUS_PERMITIDO);
    console.log('================================');
  
    const publicadoEm = vaga.created_at ? new Date(vaga.created_at) : null;
    const publicadoEmBR = publicadoEm
      ? publicadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-';

    const beneficios = Array.isArray(vaga.beneficio)
      ? vaga.beneficio
      : (vaga.beneficio ? String(vaga.beneficio).split('|').map(s => s.trim()).filter(Boolean) : []);

    const areas  = (vaga.vaga_area || []).map(va => va.area_interesse?.nome).filter(Boolean);
    const skills = (vaga.vaga_soft_skill || []).map(vs => vs.soft_skill?.nome).filter(Boolean);

    const diasPresenciais = vaga.dias_presenciais || '';
    const diasHomeOffice  = vaga.dias_home_office  || '';

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

    const candId = Number(req.session?.candidato?.id || req.session?.usuario?.id || 0);

    // Verifica se já aplicou
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

    // IDs codificados
    const encId = encodeId(id);
    const encEmpresaId = encodeId(Number(vaga?.empresa?.id || 0));
    const podeTestar = !!req.session?.candidato;

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
      podeTestar,
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

  res.cookie('cs_skipCadastro', '1', {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 31536000000
  });
  
  try {
    const usuarioId = Number(req.session?.usuario?.id);
    
    if (!usuarioId) {
      console.warn('[pularCadastroCandidato] Tentativa de pular cadastro sem sessão válida.');
      return res.redirect('/login');
    }

    let cand = await prisma.candidato.findUnique({
      where: { usuario_id: usuarioId }, // Agora usa o ID seguro
      include: {
        usuario: { select: { email: true, nome: true, sobrenome: true } },
        candidato_area: { include: { area_interesse: true } }
      }
    });

    if (!cand) {
      // Cria com dados mínimos (nome/sobrenome se já tiver no usuario)
      const usr = await prisma.usuario.findUnique({ where: { id: usuarioId } }); // Usa o ID seguro
      cand = await prisma.candidato.create({
        data: {
          usuario_id: usuarioId, // Usa o ID seguro
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
      id: usuarioId, // Usa o ID seguro
      tipo: 'candidato',
      nome: cand.nome,
      sobrenome: cand.sobrenome
    };
    req.session.candidato = {
      id: cand.id,
      usuario_id: usuarioId, // Usa o ID seguro
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
    if (!vagaId || vagaId <= 0) {
      return res.status(400).send('ID de vaga inválido');
    }

    if (!Number.isFinite(vagaId)) {
      return res.status(400).send('ID de vaga inválido');
    }
    // 1. Buscamos o status da vaga ANTES de aplicar (Sua lógica está perfeita)
    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: vagaId },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    // 2. Verificamos se a vaga está 'aberta' (Sua lógica está perfeita)
    const situacaoAtual = statusMaisRecente?.situacao || 'aberta';
    const STATUS_PERMITIDO_PARA_APLICAR = 'aberta'; 

    if (situacaoAtual !== STATUS_PERMITIDO_PARA_APLICAR) {
      return res.redirect('/candidatos/vagas'); 
    }

    // (Sua lógica de verificação está perfeita)
    const jaExiste = await prisma.vaga_candidato.findFirst({
      where: { vaga_id: vagaId, candidato_id: usuario.id }
    });

    const urlVaga = `/candidatos/vagas/${vagaId}`;

    if (jaExiste) {
      req.session.erro = 'Você já aplicou para esta vaga.';
      return res.redirect(urlVaga); // Agora usa a URL correta
    }

    // Lógica original: Criar a aplicação (Perfeita)
    await prisma.vaga_candidato.create({
      data: {
        vaga_id: vagaId,
        candidato_id: usuario.id,
        status: 'em_analise' 
      }
    });

    req.session.sucesso = 'Aplicação realizada com sucesso!';
    res.redirect(urlVaga); // Agora usa a URL correta

  } catch (err) {
    console.error('[aplicarVaga] erro:', err);
    req.session.erro = 'Não foi possível aplicar à vaga. Tente novamente.';
    res.redirect('/candidatos/vagas'); // Página neutra em caso de erro
  }
};