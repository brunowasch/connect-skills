document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formPublicarVaga');
  const inputCargo = document.getElementById('cargo');
  const inputDescricao = document.getElementById('descricao');
  const inputAreas = document.getElementById('areasSelecionadas');
  const inputSkills = document.getElementById('habilidadesSelecionadas');
  const textareaPergunta = document.getElementById('pergunta');
  const textareaOpcao = document.getElementById('opcao');
  const outroBeneficioInput = document.getElementById('beneficioOutro');
  const checkboxOutro = document.getElementById('checkOutro');

  form.addEventListener('submit', (e) => {
    const erros = [];

    if (!inputCargo.value.trim()) {
      erros.push("O campo 'Cargo' é obrigatório.");
    }

    if (!inputDescricao.value.trim()) {
      erros.push("O campo 'Descrição da vaga' é obrigatório.");
    }

    const areas = JSON.parse(inputAreas.value || '[]');
    if (areas.length === 0) {
      erros.push("Selecione ou digite pelo menos uma área de interesse.");
    }

    const skills = JSON.parse(inputSkills.value || '[]');
    if (skills.length === 0) {
      erros.push("Selecione pelo menos uma habilidade comportamental (soft skill).");
    }

    if (textareaPergunta.value.trim().length < 10) {
      erros.push("A pergunta para a IA deve ter no mínimo 10 caracteres.");
    }

    if (textareaOpcao.value.trim().length < 10) {
      erros.push("As opções para a IA devem ter no mínimo 10 caracteres.");
    }

    if (checkboxOutro?.checked && !outroBeneficioInput.value.trim()) {
      erros.push("Preencha o campo de benefício 'Outro' se ele estiver marcado.");
    }

    if (erros.length > 0) {
      e.preventDefault();
      alert(erros.join('\n'));
    }
  });
});
