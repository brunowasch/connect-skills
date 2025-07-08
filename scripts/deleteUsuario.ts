const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deletarUsuarioPorEmail(email) {
  try {
    if (!email) {
      console.error('E-mail não fornecido. Use: npm run delete-user email@exemplo.com');
      process.exit(1);
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    if (!usuario) {
      console.log('Usuário não encontrado.');
      return;
    }

    const usuarioId = usuario.id;

    // Apagar de candidato_area
    await prisma.candidato_area.deleteMany({
      where: {
        candidato: {
          usuario_id: usuarioId,
        },
      },
    });

    // Apagar de candidato
    await prisma.candidato.deleteMany({
      where: {
        usuario_id: usuarioId,
      },
    });

    // Apagar usuário
    await prisma.usuario.delete({
      where: { id: usuarioId },
    });

    console.log(`Usuário com e-mail ${email} e dados relacionados foram excluídos com sucesso.`);
  } catch (error) {
    console.error('Erro ao excluir:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Captura argumento do terminal
const email = process.argv[2];
deletarUsuarioPorEmail(email);
