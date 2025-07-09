// deleteUsuario.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deletarContaPorEmail(email) {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { candidato: true, empresa: true },
    });

    if (!usuario) {
      console.log('Usuário não encontrado.');
      return;
    }

    // Deletar candidato ou empresa relacionada
    if (usuario.tipo === 'candidato' && usuario.candidato) {
      await prisma.candidato_area.deleteMany({
        where: { candidato_id: usuario.candidato.id }
      });

      await prisma.candidato.delete({
        where: { id: usuario.candidato.id }
      });

      console.log('Candidato excluído.');
    }

    if (usuario.tipo === 'empresa' && usuario.empresa) {
      await prisma.vaga_soft_skill.deleteMany({
        where: {
          vaga: {
            empresa_id: usuario.empresa.id
          }
        }
      });

      await prisma.vaga_area.deleteMany({
        where: {
          vaga: {
            empresa_id: usuario.empresa.id
          }
        }
      });

      await prisma.vaga.deleteMany({
        where: { empresa_id: usuario.empresa.id }
      });

      await prisma.empresa.delete({
        where: { id: usuario.empresa.id }
      });

      console.log('Empresa excluída.');
    }

    // Finalmente, excluir o usuário
    await prisma.usuario.delete({
      where: { email },
    });

    console.log('Usuário excluído com sucesso!');
  } catch (err) {
    console.error('Erro ao excluir conta:', err);
  } finally {
    await prisma.$disconnect();
  }
}

// Troque aqui pelo e-mail desejado
deletarContaPorEmail('brunowaschburgers@gmail.com');
