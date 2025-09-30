document.addEventListener('DOMContentLoaded', () => {
  const areasSelecionadas = document.getElementById('areasSelecionadas');
  const areasDisponiveis  = document.getElementById('botoes');
  const btnContinuar      = document.getElementById('btnContinuar');
  const btnCancelar       = document.getElementById('btnCancelar');
  const campoHidden       = document.getElementById('areasSelecionadasInput');

  const btnOutro          = document.getElementById('btnOutro');
  const campoOutroArea    = document.getElementById('campoOutroArea');
  const inputOutraArea    = document.getElementById('outra_area');
  const btnConfirmarOutro = document.getElementById('btnConfirmarOutro');
  const btnCancelarOutro  = document.getElementById('btnCancelarOutro');

  const todasOpcoes = Array.from(areasDisponiveis.querySelectorAll('button'))
                           .map(b => b.dataset.value);
  let areasEscolhidas = Array.from(areasSelecionadas.querySelectorAll('button'))
                             .map(btn => btn.dataset.value);
  const areasIniciais = [...areasEscolhidas];

  function atualizarCampoHidden() {
    campoHidden.value = JSON.stringify(areasEscolhidas);
    btnContinuar.disabled = (areasEscolhidas.length !== 3);
  }

  function criarBtnSelecionada(valor) {
    const selBtn = document.createElement('button');
    selBtn.type = 'button';
    selBtn.classList.add('area-btn', 'selected', 'm-1');
    selBtn.dataset.value = valor;
    selBtn.innerHTML = `${valor} <i class="bi bi-x-circle"></i>`;
    areasSelecionadas.appendChild(selBtn);
  }

  function criarBtnDisponivel(valor) {
    const availBtn = document.createElement('button');
    availBtn.type = 'button';
    availBtn.classList.add('area-btn', 'm-1');
    availBtn.dataset.value = valor;
    availBtn.textContent = valor;
    availBtn.addEventListener('click', selecionarArea);
    areasDisponiveis.appendChild(availBtn);
  }

  function selecionarArea(e) {
    const valor = e.currentTarget.dataset.value;
    if (areasEscolhidas.includes(valor)) return;
    if (areasEscolhidas.length >= 3) {
      alert('Você só pode selecionar até 3 áreas.');
      return;
    }
    areasEscolhidas.push(valor);
    e.currentTarget.remove();
    criarBtnSelecionada(valor);
    atualizarCampoHidden();
  }

  function removerArea(areaBtn) {
    const valor = areaBtn.dataset.value;
    areasEscolhidas = areasEscolhidas.filter(v => v !== valor);
    areaBtn.remove();
    criarBtnDisponivel(valor);
    atualizarCampoHidden();
  }

  Array.from(areasDisponiveis.querySelectorAll('button'))
       .forEach(btn => btn.addEventListener('click', selecionarArea));

  areasSelecionadas.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn && btn.classList.contains('selected')) {
      removerArea(btn);
    }
  });

  btnCancelar.addEventListener('click', e => {
    e.preventDefault();
    areasEscolhidas = [...areasIniciais];
    areasSelecionadas.innerHTML = '';
    areasDisponiveis.innerHTML = '';

    areasEscolhidas.forEach(criarBtnSelecionada);
    todasOpcoes.forEach(op => {
      if (!areasEscolhidas.includes(op)) criarBtnDisponivel(op);
    });
    atualizarCampoHidden();
  });

  btnOutro.addEventListener('click', () => {
    if (areasEscolhidas.length >= 3) {
      alert('Você só pode selecionar até 3 áreas.');
      return;
    }
    campoOutroArea.classList.remove('d-none');
    inputOutraArea.value = '';
    btnConfirmarOutro.disabled = true;
    inputOutraArea.focus();
  });

  inputOutraArea.addEventListener('input', () => {
    btnConfirmarOutro.disabled = inputOutraArea.value.trim() === '';
  });

  btnConfirmarOutro.addEventListener('click', () => {
    const valor = inputOutraArea.value.trim();
    if (!valor) return;
    if (areasEscolhidas.length >= 3) {
      alert('Você só pode selecionar até 3 áreas.');
      return;
    }
    areasEscolhidas.push(valor);
    criarBtnSelecionada(valor);
    atualizarCampoHidden();

    campoOutroArea.classList.add('d-none');
  });

  btnCancelarOutro.addEventListener('click', () => {
    campoOutroArea.classList.add('d-none');
  });

  atualizarCampoHidden();
});
