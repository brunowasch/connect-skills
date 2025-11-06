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
  
  // MUDANÇA: Usando $transaction para garantir a integridade dos dados
  return await prisma.$transaction(async (tx) => {
    
    // 1. Crie a vaga (usando 'tx' em vez de 'prisma')
    //    (Mantive sua lógica original de nested create, está ótima)
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

    // 3. Retorne a vaga criada
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
      usuario_id: Number(usuario_id), // busca com usuario_id (para cadastro)
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
    },
  });
};

/**
 * Retorna as vagas compatíveis com o candidato após o login (usando candidato_id).
 * @param {number} candidato_id
 */
exports.buscarVagasPorInteresseDoCandidato = async (candidato_id) => {
  const candidato = await prisma.candidato.findUnique({
    where: { id: Number(candidato_id) },
    include: { candidato_area: true },
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

/**
 * Retorna todas as vagas cadastradas por uma empresa, incluindo áreas e habilidades.
 * @param {number} empresa_id
 * @returns {Promise<Array>}
 */
exports.mostrarVagas = async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  try {
    const candidato_id = usuario.id; // esse é o ID da tabela 'candidato'
    const vagas = await vagaModel.buscarVagasPorInteresseDoCandidato(candidato_id);

    res.render('candidatos/vagas', {
      vagas,
      activePage: 'vagas',
    });
  } catch (err) {
    console.error('Erro ao buscar vagas para candidato:', err);
    res.status(500).send('Erro ao buscar vagas.');
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
exports.excluirVaga = async (id) => {
  const vagaId = Number(id);

  // 1) Remove todos os vínculos na tabela pivô vaga_area
  await prisma.vaga_area.deleteMany({
    where: { vaga_id: vagaId }
  });

  // 2) Remove todos os vínculos na tabela pivô vaga_soft_skill
  await prisma.vaga_soft_skill.deleteMany({
    where: { vaga_id: vagaId }
  });

  // 3) Finalmente, apaga a vaga
  return await prisma.vaga.delete({
    where: { id: vagaId }
  });
};
