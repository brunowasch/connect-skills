const vagaModel = require('../models/vagaModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');

exports.salvarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

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
    const vagaId = Number(req.params.id);
    if (!vagaId) return res.status(400).json({ ok: false, error: 'vaga_id inválido' });

    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      include: {
        vaga_soft_skill: { include: { soft_skill: true } },
      }
    });
    if (!vaga) return res.status(404).json({ ok: false, error: 'Vaga não encontrada' });

    const skillNames = (vaga.vaga_soft_skill || [])
      .map(vs => vs.soft_skill?.nome)
      .filter(Boolean);

    const discQs = getDiscQuestionsForSkills(skillNames);

    const extraRaw = String(vaga.pergunta || '').trim();
    const extraQs = (() => {
    const raw = String(vaga.pergunta ?? '').trim();
      if (!raw) return [];

      const normalized = raw
        .replace(/\r\n/g, '\n')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')    
        .replace(/\r/g, '\n');    

      return normalized
        .split('\n')              
        .map(s => s.trim())
        .filter(Boolean);
    })();
    const questions = [...discQs, ...extraQs].slice(0, 50); 
    return res.json({ ok: true, vagaId, questions });
  } catch (err) {
    console.error('[apiPerguntasDISC] erro:', err);
    return res.status(500).json({ ok: false, error: 'Falha ao montar as perguntas' });
  }
};