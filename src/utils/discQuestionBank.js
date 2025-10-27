const bank = {
  "Autoconfiança": [
    "Conte um momento em que você tomou uma decisão difícil com convicção.",
    "Descreva uma situação em que sua segurança inspirou confiança nos outros.",
    "Relate como sua autoconfiança ajudou a manter a calma em um momento de incerteza.",
    "Explique uma ocasião em que você usou sua autoconfiança para sustentar sua opinião baseada em dados ou regras."
  ],
  "Capacidade de aprender continuamente": [
    "Como você já aplicou rapidamente um novo conhecimento para resolver um problema?",
    "Fale de uma vez em que compartilhar o que aprendeu motivou sua equipe.",
    "Descreva como sua vontade de aprender ajudou a manter consistência em seu trabalho.",
    "Relate um caso em que sua dedicação ao aprendizado garantiu qualidade e precisão."
  ],
  "Colaboração": [
    "Quando você precisou colaborar mesmo tendo opiniões firmes, como lidou?",
    "Fale sobre uma situação em que sua colaboração trouxe engajamento ao grupo.",
    "Descreva como você colaborou de forma paciente e equilibrada em um time.",
    "Relate uma experiência em que sua colaboração exigiu seguir processos e regras."
  ],
  "Comunicação eficaz": [
    "Descreva uma situação em que você foi direto para resolver um problema.",
    "Conte um momento em que sua comunicação influenciou positivamente outras pessoas.",
    "Relate como a escuta ativa ajudou a manter harmonia em um grupo.",
    "Explique como a clareza da sua comunicação evitou erros em um projeto."
  ],
  "Ética profissional": [
    "Fale sobre uma decisão ética que exigiu firmeza diante de pressão.",
    "Descreva como sua ética ajudou a construir confiança em um time.",
    "Relate uma situação em que manter padrões éticos trouxe estabilidade ao ambiente.",
    "Explique uma situação em que seguir normas éticas garantiu qualidade no trabalho."
  ],
  "Flexibilidade/adaptabilidade": [
    "Quando você teve que agir rápido para se adaptar a uma mudança, o que fez?",
    "Conte como sua flexibilidade ajudou a manter o engajamento do grupo.",
    "Relate como sua adaptabilidade trouxe equilíbrio em um ambiente de incerteza.",
    "Descreva um momento em que seguiu novos processos sem comprometer a qualidade."
  ],
  "Foco em resultados": [
    "Relate uma meta desafiadora que você atingiu apesar das dificuldades.",
    "Conte como seu foco ajudou a motivar outros a atingirem resultados.",
    "Explique como manteve consistência ao buscar resultados de longo prazo.",
    "Fale sobre como seus métodos analíticos garantiram resultados confiáveis."
  ],
  "Gestão do tempo": [
    "Descreva um momento em que você priorizou tarefas sob pressão.",
    "Fale de uma vez em que seu planejamento motivou outros a cumprirem prazos.",
    "Relate como sua organização de tempo trouxe equilíbrio para a equipe.",
    "Explique como seu controle de tempo evitou falhas ou atrasos no processo."
  ],
  "Liderança": [
    "Conte sobre uma decisão firme que você tomou como líder em um momento crítico.",
    "Descreva como sua liderança inspirou e engajou pessoas.",
    "Relate como liderou de forma estável e acolhedora em um projeto.",
    "Explique como sua liderança seguiu regras e garantiu qualidade."
  ],
  "Organização": [
    "Como sua organização ajudou a atingir resultados sob pressão?",
    "Conte como seu senso de organização ajudou a orientar colegas.",
    "Relate como sua organização manteve a estabilidade do trabalho em equipe.",
    "Descreva como sua organização garantiu conformidade com normas."
  ],
  "Pensamento crítico": [
    "Relate uma situação em que questionou algo e obteve melhores resultados.",
    "Conte como seu pensamento crítico ajudou a convencer outras pessoas.",
    "Explique como sua análise trouxe calma em um momento de dúvida.",
    "Fale sobre uma decisão baseada em análise crítica que seguiu padrões."
  ],
  "Proatividade": [
    "Fale de uma vez em que tomou iniciativa rápida para resolver um problema.",
    "Conte como sua proatividade inspirou colegas.",
    "Relate como sua proatividade trouxe segurança para a equipe.",
    "Explique como sua proatividade seguiu regras e processos já definidos."
  ],
  "Relacionamento interpessoal": [
    "Quando você precisou ser firme para manter respeito em relações profissionais?",
    "Descreva como construiu relacionamentos positivos através da empatia.",
    "Relate como manteve relações estáveis em momentos de tensão.",
    "Explique como respeitou regras para manter relacionamentos saudáveis."
  ],
  "Resiliência": [
    "Conte sobre uma vez em que superou obstáculos mantendo resultados.",
    "Fale como sua resiliência motivou pessoas ao seu redor.",
    "Relate como sua resiliência trouxe segurança em momentos difíceis.",
    "Explique como seguiu padrões mesmo em situações de pressão."
  ],
  "Resolução de problemas": [
    "Descreva uma vez em que resolveu um problema com rapidez.",
    "Conte como envolveu pessoas na busca por soluções.",
    "Relate como manteve equilíbrio emocional enquanto resolvia um problema.",
    "Explique como usou análise lógica para resolver um problema."
  ],
  "Responsabilidade": [
    "Relate um momento em que assumiu a responsabilidade de forma firme.",
    "Fale como sua responsabilidade gerou confiança nos outros.",
    "Descreva como sua responsabilidade trouxe estabilidade em projetos.",
    "Explique como seguiu normas para assumir responsabilidades."
  ],
  "Tomada de decisão": [
    "Fale sobre uma decisão rápida que você tomou sob pressão.",
    "Conte como comunicou uma decisão para manter todos motivados.",
    "Relate como tomou decisões equilibradas em situações de dúvida.",
    "Explique como uma decisão seguiu critérios analíticos e regras."
  ],
  "Trabalho em equipe": [
    "Relate como contribuiu de forma assertiva para alcançar metas coletivas.",
    "Descreva como trouxe energia positiva para o time.",
    "Fale como manteve cooperação constante no time.",
    "Explique como garantiu que o trabalho em equipe seguisse normas."
  ],
};

function normalizeKey(s) {
  return String(s || '').trim().toLowerCase();
}

function getDiscQuestionsForSkills(skillNames = []) {
  const out = [];
  const used = new Set();
  for (const name of skillNames) {
    const key = Object.keys(bank).find(k => normalizeKey(k) === normalizeKey(name));
    if (!key || used.has(key)) continue;
    const qs = bank[key] || [];
    out.push(...qs.slice(0, 4)); // exatamente 4 por habilidade
    used.add(key);
    if (out.length >= 12) break; // 3 skills × 4 = 12
  }
  return out.slice(0, 12);
}

module.exports = { getDiscQuestionsForSkills };