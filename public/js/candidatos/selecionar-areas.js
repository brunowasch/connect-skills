document.addEventListener('DOMContentLoaded', () => {
  const botoes = document.querySelectorAll('.area-btn');
  const campoHidden = document.getElementById('areasSelecionadas');
  const form = document.getElementById('formAreas');
  const campoOutroArea = document.getElementById('campoOutroArea');
  const inputOutro = document.getElementById('outra_area');
  const btnConfirmar = document.getElementById('btnConfirmarOutro');
  const btnCancelar = document.getElementById('btnCancelarOutro');
  const btnEditar = document.getElementById('btnEditarOutro');
  const btnOutro = document.querySelector('.area-btn[data-value="Outro"]');
  const btnContinuar = document.getElementById('btnContinuar');

  let selecionadas = [];

  inputOutro.addEventListener('input', () => {
    btnConfirmar.disabled = inputOutro.value.trim() === "";
  });

  botoes.forEach(btn => {
    btn.addEventListener('click', () => {
      const valor = btn.dataset.value;

      if (selecionadas.includes(valor)) {
        // desmarcar
        selecionadas = selecionadas.filter(v => v !== valor);
        btn.classList.remove('selected');

        if (valor === 'Outro') {
          campoOutroArea.classList.add('d-none');
          inputOutro.value = '';
          btnConfirmar.disabled = true;
          btnOutro.textContent = 'Outro';
          btnEditar.classList.add('d-none');
          btnContinuar.classList.remove('d-none');
        }
      } else {
        if (selecionadas.length >= 3) {
          alert('Você só pode selecionar até 3 áreas.');
          return;
        }

        selecionadas.push(valor);
        btn.classList.add('selected');

        if (valor === 'Outro') {
          campoOutroArea.classList.remove('d-none');
          btnContinuar.classList.add('d-none');
        }
      }

      atualizarCampoHidden();
    });
  });

  // Confirmar nova área personalizada
  btnConfirmar.addEventListener('click', () => {
    const texto = inputOutro.value.trim();
    if (texto === '') {
      alert('Preencha a nova área antes de confirmar.');
      return;
    }

    // Atualiza visual do botão "Outro"
    btnOutro.textContent = texto;
    btnOutro.classList.add('selected');

    campoOutroArea.classList.add('d-none');
    btnEditar.classList.remove('d-none');
    btnContinuar.classList.remove('d-none');

    atualizarCampoHidden();
  });

  // Cancelar campo "Outro"
  btnCancelar.addEventListener('click', () => {
    inputOutro.value = '';
    btnConfirmar.disabled = true;
    campoOutroArea.classList.add('d-none');

    const index = selecionadas.indexOf('Outro');
    if (index !== -1) selecionadas.splice(index, 1);

    btnOutro.textContent = 'Outro';
    btnOutro.classList.remove('selected');
    btnEditar.classList.add('d-none');
    btnContinuar.classList.remove('d-none');

    atualizarCampoHidden();
  });

  // Editar nova área personalizada
  btnEditar.addEventListener('click', () => {
    campoOutroArea.classList.remove('d-none');
    inputOutro.focus();
    btnContinuar.classList.add('d-none');
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

    if (selecionadas.includes('Outro') && inputOutro.value.trim() === '') {
      e.preventDefault();
      alert('Você selecionou "Outro", mas não preencheu a área personalizada.');
      return;
    }
  });
});