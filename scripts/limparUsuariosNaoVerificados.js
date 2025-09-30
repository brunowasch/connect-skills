const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function limparUsuariosNaoVerificados() {
  const horasLimite = 24;
  const dataLimite = new Date(Date.now() - horasLimite * 60 * 60 * 1000);

  try {
    const deletados = await prisma.usuario.deleteMany({
      where: {
        email_verificado: false,
        created_at: {
          lt: dataLimite
        }
      }
    });

    console.log(`✅ ${deletados.count} usuários não verificados foram removidos.`);
  } catch (erro) {
    console.error('Erro ao remover usuários não verificados:', erro);
  } finally {
    await prisma.$disconnect();
  }
}

limparUsuariosNaoVerificados();
