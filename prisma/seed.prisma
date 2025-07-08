const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const areas = [
    'Administração',
    'Agropecuária / Agricultura',
    'Comunicação / Jornalismo',
    'Construção Civil',
    'Design / Criação',
    'Educação / Ensino',
    'Engenharia',
    'Eventos / Produção Cultural',
    'Finanças / Contabilidade',
    'Gastronomia / Alimentação',
    'Hotelaria / Turismo',
    'Jurídico',
    'Logística',
    'Marketing',
    'Mecânica / Manutenção',
    'Moda / Estilo',
    'Meio Ambiente',
    'Produção / Operacional',
    'Recursos Humanos (RH)',
    'Saúde',
    'Segurança / Vigilância',
    'Transporte / Motorista',
    'Tecnologia da Informação'
  ];

  const habilidades = [
    'Comunicação eficaz',
    'Pensamento crítico',
    'Resolução de problemas',
    'Tomada de decisão',
    'Capacidade de aprender continuamente',
    'Trabalho em equipe',
    'Relacionamento interpessoal',
    'Colaboração',
    'Liderança',
    'Proatividade',
    'Flexibilidade/adaptabilidade',
    'Gestão do tempo',
    'Foco em resultados',
    'Autoconfiança',
    'Resiliência',
    'Organização',
    'Ética profissional',
    'Responsabilidade'
  ];

  for (const nome of areas) {
    await prisma.areaInteresse.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }

  for (const nome of habilidades) {
    await prisma.softSkill.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }

  console.log('Seed finalizada com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
