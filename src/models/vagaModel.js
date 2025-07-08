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

exports.buscarVagasPorInteresseDoCandidato = async (candidato_id) => {
  const candidato = await prisma.candidato.findUnique({
    where: { id: Number(candidato_id) },
    include: { candidato_area: true },
  });

  if (!candidato || candidato.candidato_area.length === 0) {
    return [];
  }

  const areaIds = candidato.candidato_area.map(rel => rel.area_interesse_id);

  const vagas = await prisma.vaga.findMany({
    where: {
      vaga_area: {
        some: {
          area_interesse_id: {
            in: areaIds,
          },
        },
      },
    },
    include: {
      empresa: true,
      vaga_area: {
        include: {
          area_interesse: true,
        },
      },
    },
  });

  return vagas;
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