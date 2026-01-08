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
  const usuario_id = req.session.usuario?.id; 
  const { nome, sobrenome, data_nascimento } = req.body;

  // Verificação de segurança
  if (!usuario_id) {
    req.session.erro = 'Sua sessão expirou. Faça login novamente.';
    return res.redirect('/login');
  }

  try {
    await candidatoModel.criarCandidato({
      usuario_id: String(usuario_id), 
      nome,
      sobrenome,
      data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
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
    
    try {
        // BUSCA TUDO, mas excluímos apenas os termos de teste lixo
        const areasNoBanco = await prisma.area_interesse.findMany({
            where: { 
                nome: { 
                    notIn: ['Teste 1', 'Teste 2', 'Testes', 'fs', 'igiyugyui', 'igugui', 'igugui '] 
                } 
            },
            orderBy: { nome: 'asc' }
        });

        const habilidades = areasNoBanco.map(a => a.nome);

        res.render('candidatos/cadastro-areas', { 
            usuario,
            // Se o banco trouxer algo, usamos. Se não, usamos a sua lista reserva.
            habilidades: habilidades.length > 0 ? habilidades : LISTA_HABILIDADES 
        });
    } catch (error) {
        console.error("Erro ao carregar áreas:", error);
        res.render('candidatos/cadastro-areas', { usuario, habilidades: LISTA_HABILIDADES });
    }
};

exports.salvarCadastroAreas = async (req, res) => {
  // 1. Pegar o ID da sessão como String (UUID)
  const usuario_id = req.session.usuario?.id;

  try {
    if (!usuario_id) {
      req.session.erro = 'Sessão expirada. Faça login novamente.';
      return res.redirect('/login');
    }

    // 2. Parse do Input
    let { areasSelecionadas } = req.body;
    console.log("Input recebido (RAW):", areasSelecionadas);

    if (!areasSelecionadas) {
        req.session.erro = 'Nenhuma área selecionada.';
        return res.redirect('/candidatos/cadastro/areas');
    }

    // Lógica de tratamento de Array/JSON
    if (typeof areasSelecionadas === 'string') {
      try {
        areasSelecionadas = JSON.parse(areasSelecionadas);
      } catch (e) {
        areasSelecionadas = [areasSelecionadas]; 
      }
    }
    if (!Array.isArray(areasSelecionadas)) {
        areasSelecionadas = [areasSelecionadas];
    }

    // 3. Buscar candidato
    const candidato = await prisma.candidato.findUnique({
      where: { 
        // REMOVIDO: Number(usuario_id) 
        // MANTIDO: String puro pois o ID agora é UUID
        usuario_id: String(usuario_id) 
      }
    });

    if (!candidato) {
      req.session.erro = 'Candidato não encontrado.';
      return res.redirect('/candidatos/cadastro/areas');
    }

    // 4. Buscar ou Criar as Áreas (area_interesse_id continua Int)
    const areasExistentes = await prisma.area_interesse.findMany({
      where: { nome: { in: areasSelecionadas } }
    });
    
    const idsParaSalvar = [...areasExistentes.map(a => a.id)];
    const nomesExistentes = areasExistentes.map(a => a.nome);
    const nomesFaltantes = areasSelecionadas.filter(nome => !nomesExistentes.includes(nome));

    for (const nomeNovaArea of nomesFaltantes) {
        if(nomeNovaArea && nomeNovaArea.trim() !== "") {
            const novaArea = await prisma.area_interesse.create({
                data: { 
                    nome: nomeNovaArea, 
                    padrao: true,
                    // Se o seu parceiro mudou o ID da area_interesse para String também, 
                    // você precisaria de: id: uuidv4() aqui. 
                    // Mas pelo seu schema enviado, ela ainda é Int autoincrement.
                } 
            });
            idsParaSalvar.push(novaArea.id);
        }
    }

    // 5. Limpa e Salva (Transaction)
    // Importante: candidato.id agora é String (UUID)
    await prisma.$transaction([
        prisma.candidato_area.deleteMany({
            where: { candidato_id: String(candidato.id) }
        }),
        prisma.candidato_area.createMany({
            data: idsParaSalvar.map(id => ({
                candidato_id: String(candidato.id),
                area_interesse_id: id // Este permanece Int
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
  const usuarioId = req.session.usuario?.id;
  if (!usuarioId) return res.redirect('/login');

  try {
    const candDb = await prisma.candidato.findUnique({
      where: { usuario_id: String(usuarioId) }
    });

    if (!candDb) return res.redirect('/candidatos/cadastro/nome');

    // Atualiza a sessão para garantir que o ID esteja disponível em outras telas
    req.session.candidato = { id: candDb.id };

    // --- CORREÇÃO DA LOCALIZAÇÃO ---
    // Monta a string de localização combinando as colunas do banco
    const localidadeFormatada = [candDb.cidade, candDb.estado, candDb.pais]
      .filter(Boolean) // Remove campos nulos ou vazios
      .join(', ');

    // 2) Busca áreas manualmente
    const relAreas = await prisma.candidato_area.findMany({
      where: { candidato_id: candDb.id },
      include: { area_interesse: true }
    });
    const areasNomes = relAreas.map(r => r.area_interesse?.nome).filter(Boolean);

    // 3) Histórico de candidaturas (Manual)
    const avaliacoes = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id: candDb.id },
      orderBy: { created_at: 'desc' }
    });

    const historicoVagaIds = avaliacoes.map(a => a.vaga_id);
    const dadosVagasHistorico = await prisma.vaga.findMany({
      where: { id: { in: historicoVagaIds } }
    });

    const historico = avaliacoes.map(a => {
      const v = dadosVagasHistorico.find(vaga => vaga.id === a.vaga_id);
      return {
        vaga: { id: a.vaga_id, cargo: v?.cargo || 'Vaga' },
        status: a.score > 50 ? 'em_analise' : 'reprovado',
        created_at: a.created_at
      };
    });

    // 4) Vagas recomendadas
    let vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(candDb.id);

    res.render('candidatos/home-candidatos', {
      candidato: {
        ...candDb,
        localidade: localidadeFormatada || 'Localidade não informada'
      },
      vagas,
      historico,
      areas: areasNomes,
      activePage: 'home'
    });

  } catch (err) {
    console.error('Erro crítico na home:', err);
    res.status(500).send("Erro ao carregar home");
  }
};

exports.renderMeuPerfil = async (req, res) => {
  // 1. Pegar o objeto da sessão (UUID já deve estar aqui como String)
  const candidatoId = req.session.candidato?.id || req.session.usuario?.candidatoId;

  if (!candidatoId || candidatoId === 'null') {
    console.error("ID do candidato não encontrado na sessão.");
    return res.redirect('/login');
  }

  try {
    // 2. CORREÇÃO: Usar String(id) em vez de Number(id)
    const candidato = await prisma.candidato.findUnique({
      where: { id: String(candidatoId) },
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
      }
    });

    if (!candidato) return res.redirect('/login');

    const avaliacoes = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id: candidato.id }
    });

    // --- Processamento de dados (Mantido igual, apenas removendo Numbers) ---
    const areas = (candidato.candidato_area || []).map(ca => ca.area_interesse?.nome).filter(Boolean);

    const fotoPerfil = (candidato.foto_perfil && String(candidato.foto_perfil).trim() !== '')
        ? String(candidato.foto_perfil).trim()
        : '/img/avatar.png';

    const localidade = [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ')
      || (req.session?.candidato?.localidade || '');

    const dataBase = candidato.data_nascimento || candidato.usuario?.data_nascimento;

    const telefoneDados = parseTelefoneBR(candidato.telefone) || { ddi: '+55', ddd: '', numeroFormatado: '' };
    let { ddi, ddd, numeroFormatado } = telefoneDados;
    ddi = sanitizeDdi(ddi);

    let dataFormatada = "";
    if (dataBase) {
      const dateObj = new Date(dataBase);
      dataFormatada = dateObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    // Funções auxiliares de telefone e sanitize permanecem iguais...
    function parseTelefoneBR(telRaw) {
      const tel = (telRaw || '').trim();
      
      if (!tel) return { ddi: '+55', ddd: '', numeroFormatado: '' };

      return { ddi: '+55', ddd: '', numeroFormatado: tel }; 
    }
    function sanitizeDdi(ddi) { /* ... seu código original ... */ }

    // --- CORREÇÃO: Não use encodeId ou Number no ID original ---
    // Como o ID agora é um UUID ("550e8400-e29b..."), ele já é uma string segura para URL.
    const encCandidatoId = candidato.id; 
    const perfilShareUrl = `${req.protocol}://${req.get('host')}/candidatos/perfil/${encCandidatoId}`;

    res.render('candidatos/meu-perfil', {
      candidato,
      usuario: candidato.usuario,
      areas,
      avaliacoes,
      links: candidato.candidato_link || [],
      arquivos: candidato.candidato_arquivo || [],
      anexos: candidato.candidato_arquivo || [],
      fotoPerfil,
      localidade,
      humanFileSize, // Certifique-se que esta função está importada/disponível
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
  const usuarioSessao = req.session.candidato; 
  if (!usuarioSessao) return res.redirect('/login');

  const usuarioId = String(usuarioSessao.id);
  const q = (req.query.q || '').trim();
  const ordenar = (req.query.ordenar || 'recentes').trim();

  try {
    // 1. Busca os IDs das vagas recomendadas via Model
    let vagasInteresse = await vagaModel.buscarVagasPorInteresseDoCandidato(usuarioId);
    const idsVagas = vagasInteresse.map(v => v.id);

    if (idsVagas.length === 0) {
      return res.render('candidatos/vagas', { vagas: [], filtros: { q, ordenar }, activePage: 'vagas', candidato: usuarioSessao, areas: [] });
    }

    // 2. Busca as vagas básicas (Sem include, pois o schema não permite)
    let vagasRaw = await prisma.vaga.findMany({
      where: { id: { in: idsVagas } }
    });

    // 3. Busca Manual das Relações (Contornando o Schema)
    // Buscamos as empresas de todas as vagas de uma vez
    const empresaIds = [...new Set(vagasRaw.map(v => v.empresa_id))];
    const empresas = await prisma.empresa.findMany({
      where: { id: { in: empresaIds } }
    });

    // Buscamos as áreas vinculadas a essas vagas
    const todasVagaAreas = await prisma.vaga_area.findMany({
      where: { vaga_id: { in: idsVagas } }
    });
    
    // Como vaga_area só tem IDs, precisamos buscar os nomes na area_interesse
    const areaIds = [...new Set(todasVagaAreas.map(a => a.area_interesse_id))];
    const nomesAreas = await prisma.area_interesse.findMany({
      where: { id: { in: areaIds } }
    });

    // 4. Montagem do Objeto Completo manualmente
    let vagasCompletas = vagasRaw.map(vaga => {
      const empresaVaga = empresas.find(e => e.id === vaga.empresa_id) || {};
      const relacoesArea = todasVagaAreas.filter(va => va.vaga_id === vaga.id);
      const areasVaga = relacoesArea.map(ra => {
        const det = nomesAreas.find(na => na.id === ra.area_interesse_id);
        return { area_interesse: det };
      });

      return {
        ...vaga,
        empresa: empresaVaga,
        vaga_area: areasVaga,
        encId: encodeId(vaga.id)
      };
    });

    // 5. Filtros de Busca Manual (Cargo, Empresa, Área)
    if (q) {
      const termo = q.toLowerCase();
      vagasCompletas = vagasCompletas.filter(v =>
        v.cargo?.toLowerCase().includes(termo) ||
        v.empresa?.nome_empresa?.toLowerCase().includes(termo) ||
        v.vaga_area?.some(va => va.area_interesse?.nome?.toLowerCase().includes(termo))
      );
    }

    // 6. Filtro de Vagas Aplicadas (Remover as que o candidato já se inscreveu)
    const aplicadas = await prisma.vaga_avaliacao.findMany({
      where: { candidato_id: usuarioId },
      select: { vaga_id: true }
    });
    const appliedSet = new Set(aplicadas.map(a => a.vaga_id));
    vagasCompletas = vagasCompletas.filter(v => !appliedSet.has(v.id));

    // 7. Busca áreas do Candidato para o Header/Filtros
    const candAreasRel = await prisma.candidato_area.findMany({
      where: { candidato_id: usuarioId },
      include: { area_interesse: true } // Aqui funciona porque no schema candidato_area tem a relação
    });
    const areasCandidato = candAreasRel.map(r => r.area_interesse?.nome).filter(Boolean);

    res.render('candidatos/vagas', {
      vagas: vagasCompletas,
      filtros: { q, ordenar },
      activePage: 'vagas',
      candidato: usuarioSessao,
      areas: areasCandidato
    });

  } catch (err) {
    console.error('Erro ao buscar vagas manual:', err);
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

  // CORREÇÃO 1: Nunca use Number(). IDs agora são UUIDs (Strings).
  const candidato_id = String(sess.id); 
  
  const { nome, sobrenome, localidade, ddi, ddd, numero, dataNascimento, removerFoto, descricao } = req.body;

  const nomeTrim       = (nome || '').trim();
  const sobrenomeTrim  = (sobrenome || '').trim();
  const localidadeTrim = (localidade || '').trim();
  const dddTrim        = (ddd || '').replace(/\D/g, '');
  const numeroTrim     = (numero || '').replace(/\D/g, '');
  const numeroVisivel  = (numero || '').trim().replace(/[^\d-]/g, '');

  const hasTelefone = (dddTrim.length >= 2 && numeroTrim.length >= 8);

  let cidade, estado, pais;
  if (localidadeTrim) {
    const partes = localidadeTrim.split(',').map(s => s.trim());
    [cidade = '', estado = '', pais = ''] = partes;
  }

  let parsedDate = null;
  if (typeof dataNascimento === 'string' && dataNascimento.trim()) {
    const d = new Date(dataNascimento.trim());
    if (!isNaN(d.getTime())) parsedDate = d;
  }

  try {
    // Foto
    if (removerFoto) {
      // CORREÇÃO 2: Garanta que o model atualizarFotoPerfil também aceite String no ID
      await candidatoModel.atualizarFotoPerfil({ candidato_id, foto_perfil: null });
      sess.foto_perfil = '/img/avatar.png';
    } else if (req.file && req.file.buffer) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'connect-skills/candidatos',
            // O public_id aceita strings, então o UUID funciona bem aqui
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
      updateData.telefone = `${ddiFinal}-${dddTrim}-${numeroVisivel}`;
    }
    if (typeof descricao === 'string') {
      const descTrim = descricao.trim();
      updateData.descricao = descTrim.length ? descTrim : null;
    }

    if (Object.keys(updateData).length > 0) {
      // CORREÇÃO 3: Onde o erro acontecia (linha 1164)
      await prisma.candidato.update({
        where: { id: candidato_id }, // candidato_id agora é String válida
        data: updateData
      });

      // Atualiza sessão
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

    // LINKS
    const urls = Array.isArray(req.body['link_url[]'])
      ? req.body['link_url[]']
      : Array.isArray(req.body.link_url)
        ? req.body.link_url
        : (req.body.link_url ? [req.body.link_url] : []);

    const links = [];
    for (let i = 0; i < urls.length; i++) {
      const url = typeof normUrl === 'function' ? normUrl(urls[i] || '') : urls[i];
      if (!url) continue;
      links.push({ label: 'Link', url, ordem: i });
    }
    
    if (links.length > 5) links.length = 5;
    
    // CORREÇÃO 4: Certifique-se que o model aceita candidato_id como String
    if (links.length > 0) {
      await candidatoModel.substituirLinksDoCandidato(candidato_id, links);
    }

    req.session.sucessoPerfil = 'Perfil atualizado com sucesso!';
    res.redirect('/candidatos/meu-perfil');

  } catch (err) {
    console.error('Erro ao atualizar perfil básico:', err);

    let cand = null;
    try {
      // CORREÇÃO 5: Fallback de erro também precisa de String
      cand = await prisma.candidato.findUnique({
        where: { id: candidato_id },
        include: {
          candidato_link: true,
          candidato_arquivo: { orderBy: { criadoEm: 'desc' } }
        }
      });
    } catch (findErr) {
      console.error("Erro ao buscar dados de fallback:", findErr);
    }

    const arquivos = cand?.candidato_arquivo || [];
    const links    = cand?.candidato_link   || [];

    res.status(500).render('candidatos/editar-perfil', {
      nome, sobrenome, localidade, ddd, numero, dataNascimento,
      fotoPerfil: sess.foto_perfil,
      links,
      anexos: arquivos,
      arquivos,
      humanFileSize: typeof humanFileSize === 'function' ? humanFileSize : (s => s),
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
    // 1. Obtemos o candidato da sessão (IDs agora são Strings/UUIDs)
    const sess = req.session?.candidato;
    if (!sess || !sess.id) {
      return res.status(401).json({ ok: false, error: 'Não autenticado' });
    }
    const candidato_id = String(sess.id); // Garantimos que é String

    // 2. Obtemos o ID da vaga (String pura, sem Number())
    const vaga_id = String(req.params.id || '');
    if (!vaga_id || vaga_id.length < 10) {
       return res.status(400).json({ ok: false, error: 'ID de vaga inválido' });
    }

    // 3. Verificação de Status usando o UUID
    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: vaga_id },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    const situacaoAtual = statusMaisRecente?.situacao || 'aberta';

    if (situacaoAtual !== 'aberta') {
      return res.status(403).json({ ok: false, error: 'Esta vaga está fechada no momento.' });
    }

    // 4. Verificação de Duplicata (Cruzamento de UUIDs)
    const existente = await prisma.vaga_avaliacao.findFirst({
      where: { vaga_id, candidato_id },
      select: { id: true }
    });
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Você já realizou o teste desta vaga.' });
    }

    // 5. Busca dos dados da Vaga para a IA
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

    // 6. Preparação dos dados para o serviço de IA
    const qaRaw = Array.isArray(req.body.qa) ? req.body.qa : [];
    let itemsStr = typeof req.body.items === 'string' ? req.body.items.trim() : '';
    const skillsRaw = Array.isArray(req.body.skills) ? req.body.skills : [];

    if (!itemsStr && vagaDb?.descricao?.trim()) {
      itemsStr = vagaDb.descricao.trim();
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
      skills = (vagaDb?.vaga_soft_skill || [])
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
      return res.status(400).json({ ok: false, error: 'É obrigatório enviar ao menos uma pergunta respondida.' });
    }
    if (!itemsStr) {
      return res.status(400).json({ ok: false, error: 'Descrição da vaga (items) não encontrada.' });
    }

    // 7. Chamada ao serviço de IA (Payload com IDs originais para referência se necessário)
    const payload = {
      qa:     escapeQAArray(qa),
      items:  escapeNL(itemsStr),
      skills: skills,
      da:     escapeDAArray(da)
    };

    const url = process.env.IA_SUGGEST_URL || 'http://159.203.185.226:4000/suggest';
    const axiosResp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 35000 // Aumentado levemente para segurança da IA
    });

    const respData = axiosResp?.data || axiosResp;
    const raw = safeParse(respData);
    const results = normalizeResults(raw);

    // Formatação da resposta para salvar no banco
    const ensureQmark = (s) => String(s||'').trim().replace(/\s*([?.!…:])?\s*$/, '?');
    const toLine = ({ question, answer }) => [ensureQmark(question), (answer || '—').trim()].join(' ');
    const respostaFlattenAll = [...da.map(toLine), ...qa.map(toLine)].filter(Boolean).join('\n');

    // 8. Salvamento do Resultado (IA DISC ou Genérica)
    const isDisc = raw && typeof raw.score === 'number' && ['score_D', 'score_I', 'score_S', 'score_C'].every(k => typeof raw[k] === 'number');

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
        suggestions:   Array.isArray(raw.suggestions)   ? raw.suggestions  : [],
        explanation:   raw.explanation || '',
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

    // Caso de erro ou formato inesperado
    await vagaAvaliacaoModel.upsertAvaliacao({
      vaga_id,
      candidato_id,
      score: 0,
      resposta: respostaFlattenAll,
      breakdown: { erro: '[IA] Formato inesperado', raw, payload }
    });

    return res.status(422).json({ ok: false, error: 'A inteligência artificial retornou um formato inesperado.', raw });

  } catch (err) {
    console.error('Erro ao avaliar compatibilidade:', err?.message || err);
    const reason = err?.code === 'ECONNABORTED' ? 'Tempo limite excedido. Tente novamente.' : 'Falha ao contatar o serviço de análise.';
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
    // 1. O ID agora é uma String (UUID), não convertemos para Number
    const id = String(req.params.id || '');
    
    if (!id || id.length < 10) {
      return res.status(400).send('ID de vaga inválido');
    }

    // 2. Buscamos a vaga usando o UUID
    const vaga = await prisma.vaga.findUnique({
      where: { id: id },
      include: {
        empresa: {
          include: {
            usuario: { select: { id: true, nome: true, sobrenome: true, email: true } }
          }
        },
        vaga_area:       { include: { area_interesse: { select: { id: true, nome: true } } } },
        vaga_soft_skill: { include: { soft_skill: { select: { id: true, nome: true } } } },
        vaga_arquivo: true,
        vaga_link: true
      }
    });

    if (!vaga) {
      return res.status(404).send('Vaga não encontrada');
    }

    // 3. Verificamos o status da vaga
    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: id },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    const situacaoAtual = statusMaisRecente?.situacao || 'aberta'; 
    const STATUS_PERMITIDO = 'aberta';
    
    // Se a vaga não estiver aberta, tratamos como não encontrada para o candidato
    if (situacaoAtual !== STATUS_PERMITIDO) {
      return res.status(404).send('Esta vaga não está mais disponível.');
    }

    // 4. Formatação de dados para exibição
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

    // 5. Perguntas de avaliação (IA/DISC e Extras)
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

    // 6. Verificação de aplicação existente (Usando IDs como Strings)
    const candId = req.session?.candidato?.id || req.session?.usuario?.id;
    let jaAplicou = false;

    if (candId && id) {
      const [candidatura, avaliacao] = await Promise.all([
        prisma.vaga_candidato.findFirst({
          where: { candidato_id: candId, vaga_id: id },
          select: { id: true }
        }),
        prisma.vaga_avaliacao.findFirst({
          where: { candidato_id: candId, vaga_id: id },
          select: { id: true }
        })
      ]);
      jaAplicou = !!(candidatura || avaliacao);
    }

    // 7. Preparação de IDs para a View (Passamos os UUIDs puros)
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
      encId: id,              // Passa o UUID da vaga
      encEmpresaId: vaga?.empresa?.id || '', // Passa o UUID da empresa
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
    const candidatoId = String(req.params.id || ''); // Mantém como String (UUID)

    if (!candidatoId || candidatoId.length < 10) {
      return res.status(400).render('shared/404', { mensagem: 'ID de candidato inválido.' });
    }

    const candidato = await prisma.candidato.findUnique({
      where: { id: candidatoId }, // O Prisma encontrará o UUID corretamente
      include: {
        usuario: { select: { email: true, nome: true, sobrenome: true } },
        candidato_area: { include: { area_interesse: { select: { id: true, nome: true } } } },
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

    // Sua lógica de localidade que já está funcionando
    const localidade = [candidato.cidade, candidato.estado, candidato.pais].filter(Boolean).join(', ');

    // Lógica de telefone (mantenha suas funções auxiliares parseTelefoneBR e sanitizeDdi)
    let { ddi, ddd, numeroFormatado } = parseTelefoneBR(candidato.telefone);
    ddi = sanitizeDdi(ddi);
    const telefoneExibicao = (ddd && numeroFormatado)
      ? `${ddi} (${ddd}) ${numeroFormatado}`
      : (String(candidato.telefone || '').replace(/\+undefined/gi, '').trim());

    const areas = (candidato.candidato_area || [])
      .map(ca => ca.area_interesse?.nome)
      .filter(Boolean);

    // 4) URL para compartilhar (agora usa o UUID direto)
    const perfilShareUrl = `${req.protocol}://${req.get('host')}/candidatos/perfil/${candidatoId}`;

    // 5) Render
    return res.render('candidatos/perfil-publico-candidatos', {
      candidato,
      fotoPerfil,
      localidade,
      areas,
      links: (candidato.candidato_link) || [],
      arquivos: candidato.candidato_arquivo || [],
      telefoneExibicao,
      encCandidatoId: candidatoId, // Passamos o UUID puro
      perfilShareUrl,
    });
  } catch (err) {
    console.error('Erro ao carregar perfil público do candidato:', err?.message || err);
    return res.status(500).render('shared/500', { erro: 'Erro interno do servidor' });
  }
};

exports.aplicarVaga = async (req, res) => {
  try {
    // 1. Obtemos o candidato da sessão (IDs agora são Strings/UUIDs)
    const usuario = req.session?.candidato;
    
    if (!usuario?.id) {
      req.session.erro = 'Você precisa estar logado como candidato para aplicar.';
      return res.redirect('/login');
    }

    // 2. Obtemos o ID da vaga (String pura, sem Number())
    const vagaId = String(req.params.id || '');
    
    // Validação simples de existência de ID
    if (!vagaId || vagaId.length < 10) {
      return res.status(400).send('ID de vaga inválido');
    }

    // 3. Buscamos o status da vaga usando o UUID
    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: vagaId },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    // 4. Verificamos se a vaga está 'aberta'
    const situacaoAtual = statusMaisRecente?.situacao || 'aberta';
    const STATUS_PERMITIDO_PARA_APLICAR = 'aberta'; 

    if (situacaoAtual !== STATUS_PERMITIDO_PARA_APLICAR) {
      req.session.erro = 'Esta vaga não está mais aceitando candidaturas.';
      return res.redirect('/candidatos/vagas'); 
    }

    // 5. Verificamos se o candidato já aplicou (Cruzamento de UUIDs)
    const jaExiste = await prisma.vaga_candidato.findFirst({
      where: { 
        vaga_id: vagaId, 
        candidato_id: usuario.id // usuario.id deve ser o UUID salvo no login
      }
    });

    const urlVaga = `/candidatos/vagas/${vagaId}`;

    if (jaExiste) {
      req.session.erro = 'Você já aplicou para esta vaga.';
      return res.redirect(urlVaga);
    }

    // 6. Criamos a aplicação relacionando os UUIDs
    await prisma.vaga_candidato.create({
      data: {
        vaga_id: vagaId,
        candidato_id: usuario.id,
        status: 'em_analise' 
      }
    });

    req.session.sucesso = 'Aplicação realizada com sucesso!';
    return res.redirect(urlVaga);

  } catch (err) {
    console.error('[aplicarVaga] erro:', err?.message || err);
    req.session.erro = 'Não foi possível aplicar à vaga. Tente novamente.';
    return res.redirect('/candidatos/vagas');
  }
};