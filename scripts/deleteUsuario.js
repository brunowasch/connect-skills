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
      
      // EXCLUINDO TODAS AS DEPENDÊNCIAS DO CANDIDATO PRIMEIRO
      
      // 1. Relações de Áreas (M:N)
      await tx.candidato_area.deleteMany({ where: { candidato_id: candidato.id } });

      // 2. Arquivos (Ex: Currículos, Certificados)
      await tx.candidato_arquivo.deleteMany({ where: { candidato_id: candidato.id } });

      // 3. Links (Ex: LinkedIn, Portfólio)
      await tx.candidato_link.deleteMany({ where: { candidato_id: candidato.id } });

      // 4. Avaliações de Vagas (registros de score/respostas)
      await tx.vaga_avaliacao.deleteMany({ where: { candidato_id: candidato.id } });


      // AGORA, exclua o registro principal do Candidato
      await tx.candidato.delete({ where: { id: candidato.id } });
      console.log('Candidato e relações removidos.');
    }

    // --- EMPRESA ---
    const empresa = await tx.empresa.findFirst({ where: { usuario_id: usuario.id } });
    if (empresa) {
      
      // EXCLUINDO DEPENDÊNCIAS DA EMPRESA E SUAS VAGAS
      
      // 1. Excluir Arquivos e Links da Empresa
      await tx.empresa_arquivo.deleteMany({ where: { empresa_id: empresa.id } });
      await tx.empresa_link.deleteMany({ where: { empresa_id: empresa.id } });

      // 2. Buscar Vagas
      const vagas = await tx.vaga.findMany({
        where: { empresa_id: empresa.id },
        select: { id: true }
      });
      const vagaIds = vagas.map(v => v.id);

      if (vagaIds.length > 0) {
        // 3. Excluir todas as dependências das VAGAS
        await tx.vaga_area.deleteMany({ where: { vaga_id: { in: vagaIds } } });
        await tx.vaga_soft_skill.deleteMany({ where: { vaga_id: { in: vagaIds } } });
        
        // Relações que dependem da Vaga (Arquivos, Links, Avaliações, Status)
        await tx.vaga_arquivo.deleteMany({ where: { vaga_id: { in: vagaIds } } });
        await tx.vaga_link.deleteMany({ where: { vaga_id: { in: vagaIds } } });
        await tx.vaga_avaliacao.deleteMany({ where: { vaga_id: { in: vagaIds } } });
        await tx.vaga_status.deleteMany({ where: { vaga_id: { in: vagaIds } } });

        // 4. Excluir as vagas
        await tx.vaga.deleteMany({ where: { id: { in: vagaIds } } });
      }

      // 5. Excluir a Empresa
      await tx.empresa.delete({ where: { id: empresa.id } });
      console.log('Empresa, vagas e relações removidas.');
    }

    // --- USUÁRIO ---
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