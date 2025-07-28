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
exports.atualizarFotoPerfil = async ({
  candidato_id,
  foto_perfil
}) => {
  return prisma.candidato.update({
    where: { id: Number(candidato_id) },
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
 * Se alguma área não existir (ex: digitada no "Outro"), ela será criada.
 * @param {Object} dados
 * @param {string[]} dados.nomes
 * @returns {Promise<number[]>}
 */
exports.buscarIdsDasAreas = async ({ nomes }) => {
  const formatarNome = (str) => {
    return str
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  };

  const nomesFormatados = nomes.map(formatarNome);
  const ids = [];

  for (const nome of nomesFormatados) {
    const existente = await prisma.area_interesse.findFirst({
      where: {
        nome
      }
    });

    if (existente) {
      ids.push(existente.id);
    } else {
      const nova = await prisma.area_interesse.create({
        data: { nome }
      });
      ids.push(nova.id);
    }
  }

  return ids;
};

exports.atualizarPerfilBasico = async ({
  candidato_id,
  nome,
  sobrenome,
  pais,
  estado,
  cidade,
  telefone,
  data_nascimento      // <— novo
}) => {
  return prisma.candidato.update({
    where: { id: Number(candidato_id) },
    data: {
      nome,
      sobrenome,
      pais,
      estado,
      cidade,
      telefone,
      data_nascimento    // <— aqui
    }
  });
};

/**
 * Atualiza nome, sobrenome, localidade (cidade, estado, país) e telefone.
 * @param {Object} dados
 * @param {number} dados.usuario_id
 * @param {string} dados.nome
 * @param {string} dados.sobrenome
 * @param {string} dados.pais
 * @param {string} dados.estado
 * @param {string} dados.cidade
 * @param {string} dados.telefone 
 */
exports.atualizarPerfilBasico = async ({
  candidato_id,  // agora usamos candidato.id como chave primária
  nome,
  sobrenome,
  pais,
  estado,
  cidade,
  telefone
}) => {
  return prisma.candidato.update({
    where: { id: Number(candidato_id) },
    data: {
      nome,
      sobrenome,
      pais,
      estado,
      cidade,
      telefone
    }
  });
};

/**
 * Cria uma nova área de interesse se ainda não existir.
 * @param {string} nome - Nome da nova área
 * @returns {Promise<Object>} - Objeto da área criada ou existente
 */
exports.upsertNovaArea = async (nome) => {
  return await prisma.area_interesse.upsert({
    where: { nome },
    update: {},
    create: { nome }
  });
};

/**
 * Complementa o cadastro do candidato vindo do Google
 * @param {number} usuario_id
 * @param {Object} dados
 */
exports.complementarCadastroGoogle = async (usuario_id, dados) => {
  return await prisma.candidato.update({
    where: { usuario_id: Number(usuario_id) },
    data: {
      nome: dados.nome,
      sobrenome: dados.sobrenome,
      data_nascimento: dados.data_nascimento,
      pais: dados.pais,
      estado: dados.estado,
      cidade: dados.cidade,
      telefone: dados.telefone,
      foto_perfil: dados.foto_perfil || null
    }
  });
};
