const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cria uma nova vaga, vincula áreas, soft skills E o status inicial.
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
  
  return await prisma.$transaction(async (tx) => {
    
    const vaga = await tx.vaga.create({
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

    await tx.vaga_status.create({
      data: {
        vaga_id: vaga.id,
        situacao: 'aberta'
      }
    });

    return vaga;
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
 * Retorna as vagas compatíveis com o candidato durante o cadastro (usando usuario_id).
 * @param {number} usuario_id
 */
exports.buscarVagasPorUsuarioId = async (usuario_id) => {
  const candidato = await prisma.candidato.findUnique({
    where: {
      usuario_id: Number(usuario_id),
    },
    include: {
      candidato_area: true,
    },
  });

  if (!candidato || candidato.candidato_area.length === 0) {
    return [];
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
      // [CORREÇÃO DE PERFORMANCE]
      vaga_arquivo: true,
      vaga_link: true,
    },
  });
};

/**
 * Retorna as vagas compatíveis com o candidato após o login (usando candidato_id).
* @param {number} candidato_id
 */
exports.buscarVagasPorInteresseDoCandidato = async (candidato_id) => {
  if (!candidato_id) return [];

  // 1. Busca áreas do candidato
  const candidatoAreas = await prisma.candidato_area.findMany({
    where: { candidato_id: String(candidato_id) }
  });

  if (candidatoAreas.length === 0) return [];

  const areaIds = candidatoAreas.map(rel => rel.area_interesse_id);

  // 2. Busca IDs de vagas que possuem essas áreas
  const vinculosVagas = await prisma.vaga_area.findMany({
    where: { area_interesse_id: { in: areaIds } },
    select: { vaga_id: true }
  });

  const vagaIds = [...new Set(vinculosVagas.map(v => v.vaga_id))];
  if (vagaIds.length === 0) return [];

  const vagas = await prisma.vaga.findMany({
      where: { id: { in: vagaIds } },
      orderBy: { created_at: 'desc' }
    });

    if (vagas.length === 0) return [];

    // 4. Busca MANUAL das empresas (Contorno para a falta de relação no Prisma)
    const empresaIds = [...new Set(vagas.map(v => v.empresa_id))];
    const empresas = await prisma.empresa.findMany({
      where: { id: { in: empresaIds } }
    });

    // 5. Mescla os dados: coloca o objeto empresa dentro de cada vaga
    return vagas.map(vaga => {
      return {
        ...vaga,
        empresa: empresas.find(e => e.id === vaga.empresa_id) || null
      };
    });
  };

/**
 * Retorna todas as vagas de uma empresa com suas áreas e soft skills.
 * @param {number} empresa_id
 * @returns {Promise<Array>}
 */
exports.buscarVagasPorEmpresaId = async (empresa_id) => {
  try {
    return await prisma.vaga.findMany({
      where: { empresa_id: Number(empresa_id) },
      include: {
        empresa: true,
        vaga_area: {
          include: { area_interesse: true },
        },
        vaga_soft_skill: {
          include: { soft_skill: true },
        },
      },
    });
  } catch (error) {
    console.error('[ERRO INTERNO] Falha ao buscar vagas da empresa:', error);
    throw error;
  }
};


exports.atualizarVaga = async ({
  id,
  empresa_id,
  cargo,
  tipo,
  escala,
  dias_presenciais,
  dias_home_office,
  salario,
  moeda,
  descricao,
  beneficio,
  areas_ids,
  soft_skills_ids
}) => {
  const vagaId = Number(id);

  // 1) garante que só a própria empresa atualize
  // (optionally, você pode verificar antes no controller)

  // 2) limpa relacionamentos antigos
  await prisma.vaga_area.deleteMany({ where: { vaga_id: vagaId } });
  await prisma.vaga_soft_skill.deleteMany({ where: { vaga_id: vagaId } });

  // 3) atualiza campos + recria vínculos
  return await prisma.vaga.update({
    where: { id: vagaId },
    data: {
      cargo,
      tipo_local_trabalho: tipo,
      escala_trabalho: escala,
      dias_presenciais,
      dias_home_office,
      salario,
      moeda,
      descricao,
      beneficio,
      vaga_area: {
        create: areas_ids.map(aid => ({
          area_interesse: { connect: { id: Number(aid) } }
        }))
      },
      vaga_soft_skill: {
        create: soft_skills_ids.map(sid => ({
          soft_skill: { connect: { id: Number(sid) } }
        }))
      }
    }
  });
};

/**
 * Exclui uma vaga e todos os seus vínculos de áreas e soft skills.
 * @param {number|string} id — ID da vaga a ser excluída
 * @returns {Promise<Object>}
 */
// src/models/vagaModel.js

exports.excluirVaga = async (id) => {
  // REMOVA esta linha ou comente-a: const vagaId = Number(id);
  // Use o id diretamente como String (UUID)
  const vagaId = String(id); 

  // 1) Remove todos os vínculos na tabela pivô vaga_area
  await prisma.vaga_area.deleteMany({
    where: { vaga_id: vagaId }
  });

  // 2) Remove todos os vínculos na tabela pivô vaga_soft_skill
  await prisma.vaga_soft_skill.deleteMany({
    where: { vaga_id: vagaId }
  });

  // 3) Remove arquivos e links (se existirem no seu banco)
  await prisma.vaga_arquivo.deleteMany({ where: { vaga_id: vagaId } });
  await prisma.vaga_link.deleteMany({ where: { vaga_id: vagaId } });
  
  // 4) Remove avaliações/candidaturas (essencial para não dar erro de chave estrangeira)
  await prisma.vaga_avaliacao.deleteMany({ where: { vaga_id: vagaId } });

  // 5) Por fim, remove a vaga
  return await prisma.vaga.delete({
    where: { id: vagaId }
  });
};