document.addEventListener('DOMContentLoaded', () => {
  const areasSelecionadas = document.getElementById('areasSelecionadas');
  const areasDisponiveis  = document.getElementById('botoes');
  const btnContinuar      = document.getElementById('btnContinuar');
  const btnCancelar       = document.getElementById('btnCancelar');
  const campoHidden       = document.getElementById('areasSelecionadasInput');

  // array com todas as opções (mesma lista do servidor)
  const todasOpcoes = [
    "Administração","Agropecuária / Agricultura","Comunicação / Jornalismo",
    "Construção Civil","Design / Criação","Educação / Ensino","Engenharia",
    "Eventos / Produção Cultural","Finanças / Contabilidade","Gastronomia / Alimentação",
    "Hotelaria / Turismo","Jurídico","Logística","Marketing","Mecânica / Manutenção",
    "Moda / Estilo","Meio Ambiente","Produção / Operacional",
    "Recursos Humanos (RH)","Saúde","Segurança / Vigilância",
    "Transporte / Motorista","Tecnologia da Informação"
  ];

  // Inicializa a lista de selecionadas a partir do DOM
  let areasEscolhidas = Array.from(areasSelecionadas.querySelectorAll('button'))
                           .map(btn => btn.dataset.value);
  const areasIniciais = [...areasEscolhidas];

  // Atualiza o campo oculto e o estado do botão Continuar
  function atualizarCampoHidden() {
    campoHidden.value = JSON.stringify(areasEscolhidas);
    btnContinuar.disabled = (areasEscolhidas.length !== 3);
  }

  // Handler genérico para adicionar uma área
  function selecionarArea(e) {
    const button = e.currentTarget;
    const valor  = button.dataset.value;
    if (areasEscolhidas.includes(valor)) return;
    if (areasEscolhidas.length >= 3) {
      alert('Você só pode selecionar até 3 áreas.');
      return;
    }

    areasEscolhidas.push(valor);
    button.remove();  // retira da lista de disponíveis

    // cria botão selecionado
    const selBtn = document.createElement('button');
    selBtn.type = 'button';
    selBtn.classList.add('area-btn', 'selected', 'm-1');
    selBtn.dataset.value = valor;
    selBtn.innerHTML = `${valor} <i class="bi bi-x-circle"></i>`;
    areasSelecionadas.appendChild(selBtn);

    atualizarCampoHidden();
  }

  // Handler genérico para remover uma área
  function removerArea(areaBtn) {
    const valor = areaBtn.dataset.value;
    areasEscolhidas = areasEscolhidas.filter(v => v !== valor);
    areaBtn.remove();  // retira da lista de selecionadas

    // recria botão disponível
    const availBtn = document.createElement('button');
    availBtn.type = 'button';
    availBtn.classList.add('area-btn', 'm-1');
    availBtn.dataset.value = valor;
    availBtn.textContent = valor;
    availBtn.addEventListener('click', selecionarArea);
    areasDisponiveis.appendChild(availBtn);

    atualizarCampoHidden();
  }

  // Anexa listeners iniciais
  Array.from(areasDisponiveis.querySelectorAll('button'))
       .forEach(btn => btn.addEventListener('click', selecionarArea));

  // Delegation para remoção (funciona clicando no ícone ou no botão)
  areasSelecionadas.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn && btn.classList.contains('selected')) {
      removerArea(btn);
    }
  });

  atualizarCampoHidden();

  // Botão Cancelar: restaura estado inicial
  btnCancelar.addEventListener('click', e => {
    e.preventDefault();
    areasEscolhidas = [...areasIniciais];
    areasSelecionadas.innerHTML = '';
    areasDisponiveis.innerHTML  = '';

    // reconstrói selecionadas
    areasEscolhidas.forEach(valor => {
      const selBtn = document.createElement('button');
      selBtn.type = 'button';
      selBtn.classList.add('area-btn', 'selected', 'm-1');
      selBtn.dataset.value = valor;
      selBtn.innerHTML = `${valor} <i class="bi bi-x-circle"></i>`;
      areasSelecionadas.appendChild(selBtn);
    });

    // reconstrói disponíveis
    todasOpcoes.forEach(valor => {
      if (!areasEscolhidas.includes(valor)) {
        const availBtn = document.createElement('button');
        availBtn.type = 'button';
        availBtn.classList.add('area-btn', 'm-1');
        availBtn.dataset.value = valor;
        availBtn.textContent = valor;
        availBtn.addEventListener('click', selecionarArea);
        areasDisponiveis.appendChild(availBtn);
      }
    });

    atualizarCampoHidden();
  });
});
