const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const vagaModel = require('../models/vagaModel');
const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');
const { decodeId } = require('../utils/idEncoder');

exports.salvarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');
    // ... (lógica de salvar vaga) ...
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

    const empresa_id = req.session.empresa.id;
    const areas_ids = JSON.parse(areasSelecionadas);
    const soft_skills_ids = JSON.parse(habilidadesSelecionadas);

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

    req.session.sucesso = 'Vaga publicada com sucesso!';
    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('Erro ao salvar vaga:', err);
    req.session.erro = 'Erro ao salvar vaga.';
    return res.redirect('/empresa/publicar-vaga');
  }
};

exports.apiPerguntasDISC = async (req, res) => {
  try {
    const vagaId = req.params.id;

    // 1. Buscar a vaga e as relações de soft skills
    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      include: {
        // Se o seu include não funcionar por falta de relação no schema, 
        // usaremos a busca manual abaixo
      }
    });

    // 2. Buscar os nomes das Soft Skills (importante para o gerador DISC)
    const relacoes = await prisma.vaga_soft_skill.findMany({
      where: { vaga_id: vagaId }
    });
    
    // Extraímos os IDs das skills cadastradas na vaga
    const skillIds = relacoes.map(r => r.soft_skill_id);

    // Buscamos os nomes dessas skills na tabela soft_skill
    const skillsCadastradas = await prisma.soft_skill.findMany({
      where: { id: { in: skillIds } }
    });
    
    let skillNames = skillsCadastradas.map(s => s.nome);

    // --- ESTRATÉGIA PARA GARANTIR PERGUNTAS ---
    // Se a vaga tiver poucas skills, adicionamos skills "padrão" para 
    // garantir que o banco de questões DISC retorne mais perguntas.
    if (skillNames.length < 3) {
      skillNames = [...skillNames, "Comunicação", "Trabalho em Equipe", "Resiliência"];
    }

    // 3. Gerar perguntas DISC baseadas nas skills (reais + padrões)
    const discQs = getDiscQuestionsForSkills(skillNames);

    // 4. Pegar as perguntas extras manuais da vaga
    const extraQs = (() => {
      const raw = String(vaga.pergunta ?? '').trim();
      if (!raw) return [];
      return raw.replace(/\\n/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    })();

    // 5. Unir e limitar (ou expandir)
    // Se você quer EXATAMENTE 22, pode usar um slice ou garantir que o discQs tenha o suficiente
    let questions = [...discQs, ...extraQs];
    
    // Se ainda assim tiver poucas, você pode concatenar perguntas gerais
    if (questions.length < 20) {
       const gerais = ["Como você lida com prazos apertados?", "Descreva um desafio que superou."];
       questions = [...questions, ...gerais];
    }

    return res.json({ ok: true, vagaId, questions: questions.slice(0, 30) });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar perguntas' });
  }
};