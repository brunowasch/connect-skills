import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // A ordem importa por causa das chaves estrangeiras
  await prisma.candidatoArea.deleteMany();
  await prisma.areaInteresse.deleteMany();
  await prisma.candidato.deleteMany();
  await prisma.empresa.deleteMany();
  await prisma.usuario.deleteMany();

  console.log('odos os dados foram apagados com sucesso.');
}

main()
  .catch((e) => {
    console.error('Erro ao apagar os dados:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
