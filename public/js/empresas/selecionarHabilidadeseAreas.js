document.addEventListener('DOMContentLoaded', () => {
  const areaBtns = document.querySelectorAll('.area-btn');
  const novaAreaInputs = document.querySelectorAll('.nova-area');
  const skillBtns = document.querySelectorAll('.skill-btn');
  const areasSelecionadasInput = document.getElementById('areasSelecionadas');
  const habilidadesSelecionadasInput = document.getElementById('habilidadesSelecionadas');

  const areasSelecionadas = new Set();
  const habilidadesSelecionadas = new Set();

  // Botões de áreas pré-existentes
  areaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');

      if (areasSelecionadas.has(id)) {
        areasSelecionadas.delete(id);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
      } else {
        if (areasSelecionadas.size >= 3) return;
        areasSelecionadas.add(id);
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
      }

      atualizarInputAreas();
    });
  });

  // Inputs de novas áreas
  novaAreaInputs.forEach(input => {
    input.addEventListener('input', () => {
      atualizarInputAreas();
    });
  });

  // Botões de soft skills
  skillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');

      if (habilidadesSelecionadas.has(id)) {
        habilidadesSelecionadas.delete(id);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
      } else {
        if (habilidadesSelecionadas.size >= 3) return;
        habilidadesSelecionadas.add(id);
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
      }

      habilidadesSelecionadasInput.value = JSON.stringify([...habilidadesSelecionadas]);
    });
  });

  function atualizarInputAreas() {
    // Pega todas as áreas selecionadas manualmente
    const novasAreas = Array.from(novaAreaInputs)
      .map(input => input.value.trim())
      .filter(texto => texto !== '')
      .map(texto => `nova:${texto}`);

    const todas = [...areasSelecionadas, ...novasAreas].slice(0, 3);
    areasSelecionadasInput.value = JSON.stringify(todas);
  }
});
