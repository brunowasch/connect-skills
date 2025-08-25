const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Upsert (vaga_id + candidato_id únicos).
 * breakdown é salvo como JSON string.
 */
async function upsertAvaliacao({ vaga_id, candidato_id, score, resposta, breakdown }) {
  const breakdownStr = typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown || []);
  return prisma.vaga_avaliacao.upsert({
    where: { vaga_candidato_unique: { vaga_id: Number(vaga_id), candidato_id: Number(candidato_id) } },
    create: {
      vaga_id: Number(vaga_id),
      candidato_id: Number(candidato_id),
      score: Number(score),
      resposta: resposta || null,
      breakdown: breakdownStr
    },
    update: {
      score: Number(score),
      resposta: resposta || null,
      breakdown: breakdownStr
    }
  });
}

/**
 * Lista avaliações de uma vaga, com candidato/usuário, ordenado por score.
 * Se seu schema mapeou created_at/updated_at para createdAt/updatedAt, pode usar no orderBy.
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
