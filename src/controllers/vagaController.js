const vagaModel = require('../models/vagaModel');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');
const { decodeId } = require('../utils/idEncoder'); // Deixe a importação, ela não atrapalha

/*
 * NOTA: Esta função 'salvarVaga' parece não estar sendo usada.
 * A rota 'POST /empresa/publicar-vaga' está sendo gerenciada
 * pelo 'empresaController.salvarVaga'.
 * Considere remover esta função se ela for realmente código morto.
 */
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
    const vagaId = Number(req.params.id); 
    if (!vagaId || vagaId <= 0) {
      return res.status(400).json({ ok: false, error: 'vaga_id inválido' });
    }
    
    const statusMaisRecente = await prisma.vaga_status.findFirst({
      where: { vaga_id: vagaId },
      orderBy: { criado_em: 'desc' },
      select: { situacao: true }
    });

    const situacaoAtual = statusMaisRecente?.situacao || 'aberta';

    if (situacaoAtual !== 'aberta') {
      return res.status(404).json({ ok: false, error: 'Vaga não encontrada ou não está aberta' });
    }
    
    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId }, 
      include: {
        vaga_soft_skill: { include: { soft_skill: true } },
      }
    });

    if (!vaga) {
      return res.status(404).json({ ok: false, error: 'Vaga não encontrada' });
    }

    const skillNames = (vaga.vaga_soft_skill || [])
      .map(vs => vs.soft_skill?.nome)
      .filter(Boolean);

    const discQs = getDiscQuestionsForSkills(skillNames);

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