document.addEventListener('DOMContentLoaded', () => {
  const areaButtons = document.querySelectorAll('.area-btn');
  const habilidadeButtons = document.querySelectorAll('.skill-btn');
  const inputAreas = document.getElementById('areasSelecionadas');
  const inputHabilidades = document.getElementById('habilidadesSelecionadas');

  let areasSelecionadas = [];
  let habilidadesSelecionadas = [];

  areaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.textContent;

      if (areasSelecionadas.includes(valor)) {
        areasSelecionadas = areasSelecionadas.filter(a => a !== valor);
        btn.classList.remove('active');
      } else if (areasSelecionadas.length < 3) {
        areasSelecionadas.push(valor);
        btn.classList.add('active');
      }

      inputAreas.value = areasSelecionadas.join(',');
    });
  });

  habilidadeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.textContent;

      if (habilidadesSelecionadas.includes(valor)) {
        habilidadesSelecionadas = habilidadesSelecionadas.filter(h => h !== valor);
        btn.classList.remove('active');
      } else if (habilidadesSelecionadas.length < 3) {
        habilidadesSelecionadas.push(valor);
        btn.classList.add('active');
      }

      inputHabilidades.value = habilidadesSelecionadas.join(',');
    });
  });
});
