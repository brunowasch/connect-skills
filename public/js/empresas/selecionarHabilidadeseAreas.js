document.addEventListener('DOMContentLoaded', () => {
  const areaBtns = document.querySelectorAll('.area-btn');
  const skillBtns = document.querySelectorAll('.skill-btn');
  const areasSelecionadasInput = document.getElementById('areasSelecionadas');
  const habilidadesSelecionadasInput = document.getElementById('habilidadesSelecionadas');

  const areasSelecionadas = new Set();
  const habilidadesSelecionadas = new Set();

  areaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const area = btn.textContent;
      if (areasSelecionadas.has(area)) {
        areasSelecionadas.delete(area);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
      } else {
        if (areasSelecionadas.size >= 3) return;
        areasSelecionadas.add(area);
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
      }
      areasSelecionadasInput.value = Array.from(areasSelecionadas).join(',');
    });
  });

  skillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const skill = btn.textContent;
      if (habilidadesSelecionadas.has(skill)) {
        habilidadesSelecionadas.delete(skill);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
      } else {
        if (habilidadesSelecionadas.size >= 3) return;
        habilidadesSelecionadas.add(skill);
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
      }
      habilidadesSelecionadasInput.value = Array.from(habilidadesSelecionadas).join(',');
    });
  });
});
