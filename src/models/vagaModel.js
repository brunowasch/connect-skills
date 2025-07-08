const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cria uma nova vaga e vincula áreas e soft skills.
 * @param {Object} dados
 * @returns {Promise<Object>}
 */
exports.criarVaga = async ({
  empresa_id,
  cargo,
  tipo_local_trabalho,
  escala_trabalho,
  dias_presenciais,
  dias_home_office,
  salario,
  moeda,
  descricao,
  areas_ids,
  soft_skills_ids
}) => {
  return await prisma.vaga.create({
    data: {
      empresa_id: Number(empresa_id),
      cargo: cargo || '',
      tipo_local_trabalho: tipo_local_trabalho || '',
      escala_trabalho: escala_trabalho || '',
      dias_presenciais: dias_presenciais !== null ? Number(dias_presenciais) : null,
      dias_home_office: dias_home_office !== null ? Number(dias_home_office) : null,
      salario: salario
        ? parseFloat(salario.replace(/\./g, '').replace(',', '.'))
        : null,
      moeda: moeda || '',
      descricao: descricao || '',
      vaga_area: {
        create: (areas_ids || []).map((area_id) => ({
          area_interesse: {
            connect: { id: Number(area_id) }
          }
        }))
      },
      vaga_soft_skill: {
        create: (soft_skills_ids || []).map((skill_id) => ({
          soft_skill: {
            connect: { id: Number(skill_id) }
          }
        }))
      }
    }
  });
};

/**
 * Busca todas as áreas de interesse disponíveis.
 * @returns {Promise<Array>}
 */
exports.buscarAreas = async () => {
  return await prisma.area_interesse.findMany();
};

exports.buscarSoftSkills = async () => {
  return await prisma.soft_skill.findMany();
};


/**
 * Retorna todas as vagas cadastradas por uma empresa, incluindo áreas e habilidades.
 * @param {number} empresa_id
 * @returns {Promise<Array>}
 */
exports.buscarVagasPorEmpresaId = async (empresa_id) => {
  try {
    console.log('[DEBUG] Prisma client OK:', typeof prisma.vaga.findMany);
    return await prisma.vaga.findMany({
      where: { empresa_id: Number(empresa_id) },
      include: {
        empresa: true,
        vaga_area: { include: { area_interesse: true } },
        vaga_soft_skill: { include: { soft_skill: true } }
      }
    });
  } catch (error) {
    console.error('[ERRO INTERNO] Falha ao buscar vagas:', error);
    throw error;
  }
};

