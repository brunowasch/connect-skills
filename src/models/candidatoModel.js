const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cria um novo candidato com dados básicos.
 */
exports.criarCandidato = async ({ usuario_id, nome, sobrenome, data_nascimento }) => {
  try {
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
  } catch (error) {
    console.error('[ERRO] Falha ao criar candidato:', error);
    throw error;
  }
};

/**
 * Atualiza a localização do candidato.
 */
exports.atualizarLocalizacao = async ({ usuario_id, pais, estado, cidade }) => {
  try {
    return await prisma.candidato.update({
      where: { usuario_id },
      data: { pais, estado, cidade }
    });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar localização:', error);
    throw error;
  }
};

/**
 * Atualiza o telefone do candidato.
 */
exports.atualizarTelefone = async ({ usuario_id, telefone }) => {
  try {
    return await prisma.candidato.update({
      where: { usuario_id },
      data: { telefone }
    });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar telefone:', error);
    throw error;
  }
};

/**
 * Atualiza a foto de perfil do candidato.
 */
exports.atualizarFotoPerfil = async ({ usuario_id, foto_perfil }) => {
  try {
    return await prisma.candidato.update({
      where: { usuario_id },
      data: { foto_perfil }
    });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar foto de perfil:', error);
    throw error;
  }
};

/**
 * Busca o candidato e suas áreas de interesse.
 */
exports.obterCandidatoPorUsuarioId = async (usuario_id) => {
  try {
    const candidato = await prisma.candidato.findUnique({
      where: { usuario_id },
      include: {
        candidato_area: {
          include: {
            area_interesse: true
          }
        },
        usuario: true
      }
    });

    if (!candidato) return null;

    return {
      ...candidato,
      areas: candidato.candidato_area.map((relacao) => relacao.area_interesse.nome)
    };
  } catch (error) {
    console.error('[ERRO] Falha ao buscar candidato:', error);
    throw error;
  }
};

/**
 * Salva as áreas de interesse do candidato.
 */
exports.salvarAreasDeInteresse = async ({ candidato_id, areas }) => {
  try {
    const data = areas.map(area_interesse_id => ({
      candidato_id,
      area_interesse_id
    }));

    return await prisma.candidatoArea.createMany({ data });
  } catch (error) {
    console.error('[ERRO] Falha ao salvar áreas de interesse:', error);
    throw error;
  }
};

/**
 * Busca os IDs das áreas com base nos nomes.
 */
exports.buscarIdsDasAreas = async ({ nomes }) => {
  try {
    const resultados = await prisma.areaInteresse.findMany({
      where: { nome: { in: nomes } },
      select: { id: true }
    });

    return resultados.map(r => r.id);
  } catch (error) {
    console.error('[ERRO] Falha ao buscar IDs das áreas:', error);
    throw error;
  }
};
