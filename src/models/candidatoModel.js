const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cria um novo candidato com dados básicos.
 */
exports.criarCandidato = async ({ usuario_id, nome, sobrenome, data_nascimento }) => {
  return await prisma.candidato.create({
    data: {
      usuario_id,
      nome,
      sobrenome,
      data_nascimento,
      pais: '',
      estado: '',
      cidade: '',
      telefone: '',
      foto_perfil: ''
    }
  });
};

/**
 * Atualiza a localização do candidato.
 */
exports.atualizarLocalizacao = async ({ usuario_id, pais, estado, cidade }) => {
  return await prisma.candidato.update({
    where: { usuario_id },
    data: { pais, estado, cidade }
  });
};

/**
 * Atualiza o telefone do candidato.
 */
exports.atualizarTelefone = async ({ usuario_id, telefone }) => {
  return await prisma.candidato.update({
    where: { usuario_id },
    data: { telefone }
  });
};

/**
 * Atualiza a foto de perfil do candidato.
 */
exports.atualizarFotoPerfil = async ({ usuario_id, foto_perfil }) => {
  return await prisma.candidato.update({
    where: { usuario_id },
    data: { foto_perfil }
  });
};

/**
 * Busca candidato com suas áreas de interesse pelo ID do usuário.
 */
exports.obterCandidatoPorUsuarioId = async (usuario_id) => {
  const candidato = await prisma.candidato.findUnique({
    where: { usuario_id },
    include: {
      areas: {
        include: {
          area_interesse: true
        }
      }
    }
  });

  if (!candidato) return null;

  return {
    ...candidato,
    areas: candidato.areas.map((relacao) => relacao.area_interesse.nome)
  };
};

/**
 * Salva as áreas de interesse para um candidato.
 */
exports.salvarAreasDeInteresse = async ({ candidato_id, areas }) => {
  const data = areas.map(area_interesse_id => ({
    candidato_id,
    area_interesse_id
  }));

  return await prisma.candidatoArea.createMany({ data });
};

/**
 * Busca os IDs das áreas com base em seus nomes.
 */
exports.buscarIdsDasAreas = async ({ nomes }) => {
  const resultados = await prisma.areaInteresse.findMany({
    where: {
      nome: {
        in: nomes
      }
    },
    select: {
      id: true
    }
  });

  return resultados.map(r => r.id);
};
