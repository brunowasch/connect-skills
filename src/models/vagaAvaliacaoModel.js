// src/models/vagaAvaliacaoModel.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Upsert (vaga_id + candidato_id únicos).
 * breakdown é salvo como JSON string.
 * Inclui created_at/updated_at para compatibilidade com schemas sem @default/@updatedAt.
 */
async function upsertAvaliacao({ vaga_id, candidato_id, score, resposta, breakdown }) {
  // 1. Garantir que o breakdown seja String para o banco
  const breakdownStr = typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown || []);
  const now = new Date();

  // 2. IMPORTANTE: Removido o Number(). Usamos String pura (UUID).
  return prisma.vaga_avaliacao.upsert({
    where: { 
      vaga_id_candidato_id: { 
        vaga_id: String(vaga_id), 
        candidato_id: String(candidato_id) 
      } 
    },
    create: {
      id: require('crypto').randomUUID(), // Seu schema pede ID manual e não tem default
      vaga_id: String(vaga_id),
      candidato_id: String(candidato_id),
      score: Number(score) || 0, // Score sim é um número
      resposta: resposta || null,
      breakdown: breakdownStr,
      created_at: now,
      updated_at: now
    },
    update: {
      score: Number(score) || 0,
      resposta: resposta || null,
      breakdown: breakdownStr,
      updated_at: now
    }
  });
}

/**
 * Lista avaliações de uma vaga, com candidato/usuário, ordenado por score.
 */
async function listarPorVaga({ vaga_id }) {
  const avaliacoes = await prisma.vaga_avaliacao.findMany({
    where: { vaga_id: String(vaga_id) },
    orderBy: { score: 'desc' }
  });

  const listaComDados = await Promise.all(avaliacoes.map(async (av) => {
    const candidato = await prisma.candidato.findUnique({
      where: { id: av.candidato_id },
      include: { usuario: { select: { email: true, nome: true } } }
    });
    return { ...av, candidato };
  }));

  return listaComDados;
}

module.exports = {
  upsertAvaliacao,
  listarPorVaga
};
