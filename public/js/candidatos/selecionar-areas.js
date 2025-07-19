document.addEventListener('DOMContentLoaded', () => {
  const botoes = document.querySelectorAll('.area-btn');
  const campoHidden = document.getElementById('areasSelecionadas');
  const form = document.getElementById('formAreas');
  const campoOutroArea = document.getElementById('campoOutroArea');
  const inputOutro = document.getElementById('outra_area');
  const btnConfirmar = document.getElementById('btnConfirmarOutro');
  const btnCancelar = document.getElementById('btnCancelarOutro');
  const btnOutro = document.querySelector('.area-btn[data-value="Outro"]');
  const btnContinuar = document.getElementById('btnContinuar');

  let selecionadas = [];

  inputOutro.addEventListener('input', () => {
    btnConfirmar.disabled = inputOutro.value.trim() === "";
  });

  botoes.forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.dataset.value;

      if (valor === 'Outro') {
        if (selecionadas.length >= 3) {
          alert('Você só pode selecionar até 3 áreas.');
          return;
        }
        campoOutroArea.classList.remove('d-none');
        inputOutro.value = '';
        btnConfirmar.disabled = true;
        return;
      }

      if (selecionadas.includes(valor)) {
        selecionadas = selecionadas.filter(v => v !== valor);
        btn.classList.remove('selected');
      } else {
        if (selecionadas.length >= 3) {
          alert('Você só pode selecionar até 3 áreas.');
          return;
        }
        selecionadas.push(valor);
        btn.classList.add('selected');
      }

      atualizarCampoHidden();
    });
  });

  btnConfirmar.addEventListener('click', () => {
    const texto = inputOutro.value.trim();
    if (texto === '') return;

    if (selecionadas.length >= 3) {
      alert('Você só pode selecionar até 3 áreas.');
      return;
    }

    if (selecionadas.includes(texto)) {
      alert('Essa área já foi selecionada.');
      return;
    }

    selecionadas.push(texto);
    campoOutroArea.classList.add('d-none');

    // Cria botão dinâmico para a nova área
    const novoBtn = document.createElement('button');
    novoBtn.type = 'button';
    novoBtn.className = 'area-btn btn btn-outline-primary m-2 selected';
    novoBtn.textContent = texto;
    novoBtn.dataset.value = texto;

    novoBtn.addEventListener('click', () => {
      selecionadas = selecionadas.filter(v => v !== texto);
      novoBtn.remove();
      atualizarCampoHidden();
    });

    btnOutro.insertAdjacentElement('beforebegin', novoBtn);
    atualizarCampoHidden();
  });

  btnCancelar.addEventListener('click', () => {
    inputOutro.value = '';
    btnConfirmar.disabled = true;
    campoOutroArea.classList.add('d-none');
  });

  function atualizarCampoHidden() {
    campoHidden.value = JSON.stringify(selecionadas);
  }

  form.addEventListener('submit', e => {
    if (selecionadas.length !== 3) {
      e.preventDefault();
      alert('Por favor, selecione exatamente 3 áreas de interesse.');
      return;
    }

    const includesOutro = selecionadas.some(a => a.toLowerCase() === 'outro');
    if (includesOutro) {
      e.preventDefault();
      alert('Você precisa confirmar a nova área antes de continuar.');
    }
  });
});
