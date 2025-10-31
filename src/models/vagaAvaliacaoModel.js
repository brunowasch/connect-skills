// src/models/vagaAvaliacaoModel.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Upsert (vaga_id + candidato_id únicos).
 * breakdown é salvo como JSON string.
 * Inclui created_at/updated_at para compatibilidade com schemas sem @default/@updatedAt.
 */
async function upsertAvaliacao({ vaga_id, candidato_id, score, resposta, breakdown }) {
  const breakdownStr = typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown || []);
  const now = new Date();

  return prisma.vaga_avaliacao.upsert({
    // IMPORTANTE: use a compound unique que o Prisma exibiu no erro
    where: { vaga_id_candidato_id: { vaga_id: Number(vaga_id), candidato_id: Number(candidato_id) } },
    create: {
      vaga_id: Number(vaga_id),
      candidato_id: Number(candidato_id),
      score: Number(score),
      resposta: resposta || null,
      breakdown: breakdownStr,
      created_at: now,
      updated_at: now
    },
    update: {
      score: Number(score),
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
  return prisma.vaga_avaliacao.findMany({
    where: { vaga_id: Number(vaga_id) },
    orderBy: [{ score: 'desc' }],
    include: {
      candidato: {
        include: {
          usuario: { select: { email: true, nome: true } }
        }
      }
    }
  });
}

module.exports = {
  upsertAvaliacao,
  listarPorVaga
};
