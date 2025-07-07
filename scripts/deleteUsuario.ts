// scripts/deleteUsuario.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identificador = process.argv[2];

  if (!identificador) {
    console.error('Informe um ID ou email do usuário:');
    console.error('   Ex:  npm run delete-user 123   ou   npm run delete-user usuario@email.com');
    process.exit(1);
  }

  const condicao =
    isNaN(Number(identificador))
      ? { email: identificador }
      : { id: Number(identificador) };

  const usuario = await prisma.usuario.findUnique({
    where: condicao,
    include: {
      empresa: true,
      candidato: {
        include: {
          areas: true
        }
      }
    }
  });

  if (!usuario) {
    console.log('Usuário não encontrado.');
    return;
  }

  console.log(`Usuário encontrado: ${usuario.email} (${usuario.tipo})`);

  if (usuario.tipo === 'empresa' && usuario.empresa) {
    await prisma.empresa.delete({
      where: { id: usuario.empresa.id }
    });
    console.log('Empresa deletada');
  }

  if (usuario.tipo === 'candidato' && usuario.candidato) {
    await prisma.candidatoArea.deleteMany({
      where: { candidato_id: usuario.candidato.id }
    });
    await prisma.candidato.delete({
      where: { id: usuario.candidato.id }
    });
    console.log('Candidato e áreas de interesse deletados');
  }

  await prisma.usuario.delete({
    where: { id: usuario.id }
  });
  console.log('Usuário deletado com sucesso');
}

main()
  .catch((err) => {
    console.error('Erro ao deletar usuário:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
