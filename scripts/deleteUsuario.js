const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
require('dotenv').config();

async function deletarContaPorEmail(email) {
  email = email.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({ where: { email } });
    if (!usuario) {
      console.log('Usuário não encontrado.');
      return;
    }

    // --- CANDIDATO ---
    const candidato = await tx.candidato.findFirst({ where: { usuario_id: usuario.id } });
    if (candidato) {
      // relações do candidato
      await tx.candidato_area.deleteMany({ where: { candidato_id: candidato.id } });


      await tx.candidato.delete({ where: { id: candidato.id } });
      console.log('Candidato e relações removidos.');
    }

    // --- EMPRESA ---
    const empresa = await tx.empresa.findFirst({ where: { usuario_id: usuario.id } });
    if (empresa) {
      // Vagas da empresa
      const vagas = await tx.vaga.findMany({
        where: { empresa_id: empresa.id },
        select: { id: true }
      });
      const vagaIds = vagas.map(v => v.id);

      if (vagaIds.length > 0) {
        // relações das vagas
        await tx.vaga_area.deleteMany({ where: { vaga_id: { in: vagaIds } } });
        await tx.vaga_soft_skill.deleteMany({ where: { vaga_id: { in: vagaIds } } });

        await tx.vaga.deleteMany({ where: { id: { in: vagaIds } } });
      }

      await tx.empresa.delete({ where: { id: empresa.id } });
      console.log('Empresa, vagas e relações removidas.');
    }

    await tx.usuario.delete({ where: { id: usuario.id } });
    console.log(`Usuário ${email} removido com sucesso.`);
  });
}

(async () => {
  try {
    const email = process.argv[2];
    if (!email) {
      console.error('Uso: node scripts/deleteUsuario.js email@exemplo.com');
      process.exit(1);
    }
    await deletarContaPorEmail(email);
  } catch (err) {
    console.error('Erro ao excluir conta:', err);
  } finally {
    await prisma.$disconnect();
  }
})();