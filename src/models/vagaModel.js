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

/**
 * Busca todas as soft skills disponíveis.
 * @returns {Promise<Array>}
 */
exports.buscarSoftSkills = async () => {
  return await prisma.soft_skill.findMany();
};

/**
 * Retorna todas as vagas de uma empresa com suas áreas e soft skills.
 * @param {number} empresa_id
 * @returns {Promise<Array>}
 */
exports.buscarVagasPorEmpresaId = async (empresa_id) => {
  try {
    console.log('[DEBUG] Buscando vagas para empresa_id =', empresa_id);
    return await prisma.vaga.findMany({
      where: { empresa_id: Number(empresa_id) },
      include: {
        empresa: true,
        vaga_area: {
          include: { area_interesse: true }
        },
        vaga_soft_skill: {
          include: { soft_skill: true }
        }
      }
    });
  } catch (error) {
    console.error('[ERRO INTERNO] Falha ao buscar vagas da empresa:', error);
    throw error;
  }
};

/**
 * Retorna as vagas compatíveis com o candidato durante o cadastro (usando usuario_id).
 * @param {number} usuario_id
 */
exports.buscarVagasPorUsuarioId = async (usuario_id) => {
  const candidato = await prisma.candidato.findUnique({
    where: {
      usuario_id: Number(usuario_id), // busca com usuario_id (para cadastro)
    },
    include: {
      candidato_area: true,
    },
  });

  if (!candidato || candidato.candidato_area.length === 0) {
    return []; // Sem áreas escolhidas
  }

  const areaIds = candidato.candidato_area.map(rel => rel.area_interesse_id);

  return await prisma.vaga.findMany({
    where: {
      vaga_area: {
        some: {
          area_interesse_id: { in: areaIds },
        },
      },
    },
    include: {
      empresa: true,
      vaga_area: { include: { area_interesse: true } },
      vaga_soft_skill: { include: { soft_skill: true } },
    },
  });
};

/**
 * Retorna as vagas que têm pelo menos uma área em comum com o candidato após o login (usando candidato_id).
 * @param {number} candidato_id
 */
exports.buscarVagasPorCandidatoId = async (candidato_id) => {
  const candidato = await prisma.candidato.findUnique({
    where: {
      id: Number(candidato_id), // busca com o id do candidato (após login)
    },
    include: {
      candidato_area: true,
    },
  });

  if (!candidato || candidato.candidato_area.length === 0) {
    return []; // Sem áreas escolhidas
  }

  const areaIds = candidato.candidato_area.map(rel => rel.area_interesse_id);

  return await prisma.vaga.findMany({
    where: {
      vaga_area: {
        some: {
          area_interesse_id: { in: areaIds },
        },
      },
    },
    include: {
      empresa: true,
      vaga_area: { include: { area_interesse: true } },
      vaga_soft_skill: { include: { soft_skill: true } },
    },
  });
};
