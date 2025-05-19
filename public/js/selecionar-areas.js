  const botoes = document.querySelectorAll('.area-btn');
    const campoHidden = document.getElementById('areasSelecionadas');

    let selecionadas = [];

    botoes.forEach(btn => {
      btn.addEventListener('click', () => {
        const valor = btn.dataset.value;

        if (selecionadas.includes(valor)) {
          selecionadas = selecionadas.filter(v => v !== valor);
          btn.classList.remove('selected');
        } else {
          if (selecionadas.length < 3) {
            selecionadas.push(valor);
            btn.classList.add('selected');
          }
        }

        campoHidden.value = selecionadas.join(',');
      });
    });

    document.getElementById('formAreas').addEventListener('submit', function (e) {
      if (selecionadas.length !== 3) {
        e.preventDefault();
        alert('Por favor, selecione exatamente 3 áreas de interesse.');
      }
    });