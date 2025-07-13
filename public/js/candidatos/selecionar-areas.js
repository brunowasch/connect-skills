document.addEventListener('DOMContentLoaded', () => {
  const botoes      = document.querySelectorAll('.area-btn');
  const campoHidden = document.getElementById('areasSelecionadas');
  const form        = document.getElementById('formAreas');
  let selecionadas  = [];

  botoes.forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.dataset.value;

      if (selecionadas.includes(valor)) {
        // desmarcar
        selecionadas = selecionadas.filter(v => v !== valor);
        btn.classList.remove('selected');
      } else {
        if (selecionadas.length < 3) {
          // marcar
          selecionadas.push(valor);
          btn.classList.add('selected');
        } else {
          alert('Você só pode selecionar até 3 áreas.');
        }
      }

      // atualiza o campo oculto
      campoHidden.value = selecionadas.join(',');
    });
  });

  form.addEventListener('submit', e => {
    if (selecionadas.length !== 3) {
      e.preventDefault();
      alert('Por favor, selecione exatamente 3 áreas de interesse.');
    }
  });
});