const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cria um novo candidato com dados básicos.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.nome
 * @param {string} dados.sobrenome
 * @param {string|Date} dados.data_nascimento
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
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.pais
 * @param {string} dados.estado
 * @param {string} dados.cidade
 */
exports.atualizarLocalizacao = async ({ usuario_id, pais, estado, cidade }) => {
  return await prisma.candidato.update({
    where: { usuario_id },
    data: { pais, estado, cidade }
  });
};

/**
 * Atualiza o telefone do candidato.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.telefone
 */
exports.atualizarTelefone = async ({ usuario_id, telefone }) => {
  return await prisma.candidato.update({
    where: { usuario_id },
    data: { telefone }
  });
};

/**
 * Atualiza a foto de perfil do candidato.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.foto_perfil
 */
exports.atualizarFotoPerfil = async ({ usuario_id, foto_perfil }) => {
  return await prisma.candidato.update({
    where: { usuario_id },
    data: { foto_perfil }
  });
};

/**
 * Busca candidato pelo usuário_id com suas áreas de interesse.
 * @param {number} usuario_id 
 */
exports.obterCandidatoPorUsuarioId = async (usuario_id) => {
  const candidato = await prisma.candidato.findUnique({
  where: { 
    usuario_id: Number(usuario_id) 
  },
  include: {
    candidato_area: {
      include: {
        area_interesse: true
      }
    }
  }
});


  if (!candidato) {
    console.warn(`Nenhum candidato encontrado com usuario_id=${usuario_id}`);
    return null;
  }

  return candidato;
};


/**
 * Salva as áreas de interesse para um candidato
 * @param {Object} dados
 * @param {number} dados.candidato_id
 * @param {number[]} dados.areas
 */
exports.salvarAreasDeInteresse = async ({ candidato_id, areas }) => {
  try {
    // Apaga áreas anteriores (caso o candidato esteja editando)
    await prisma.candidato_area.deleteMany({
      where: { candidato_id }
    });

    // Insere novas
    const registros = areas.map(area_id => ({
      candidato_id,
      area_interesse_id: area_id
    }));

    await prisma.candidato_area.createMany({
      data: registros
    });
  } catch (err) {
    console.error('Erro ao salvar áreas no banco:', err);
    throw err;
  }
};

/**
 * Busca os IDs das áreas com base em seus nomes.
 * @param {Object} dados
 * @param {string[]} dados.nomes
 * @returns {Promise<number[]>}
 */
exports.buscarIdsDasAreas = async ({ nomes }) => {
  return await prisma.area_interesse.findMany({
    where: {
      nome: {
        in: nomes
      }
    },
    select: {
      id: true
    }
  }).then(areas => areas.map(a => a.id));
};