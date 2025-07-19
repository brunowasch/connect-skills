document.addEventListener('DOMContentLoaded', () => {
  const form         = document.getElementById('formPublicarVaga');
  const tipo         = document.getElementById('tipo');
  const campoPres    = document.getElementById('campoPresencial');
  const campoHome    = document.getElementById('campoHomeOffice');
  const diasPres     = document.getElementById('diasPresenciais');
  const diasHome     = document.getElementById('diasHomeOffice');
  const erroDias     = document.getElementById('erroDias');
  const moedaSelect  = document.getElementById('moeda');
  const simboloSpan  = document.getElementById('simboloMoeda');
  const salarioInput = document.getElementById('salario');

  const areaBtns         = document.querySelectorAll('.area-btn');
  const novaAreaInputs   = document.querySelectorAll('.nova-area');
  const skillBtns        = document.querySelectorAll('.skill-btn');
  const areasInput       = document.getElementById('areasSelecionadas');
  const habilidadesInput = document.getElementById('habilidadesSelecionadas');

  const areasSelecionadas     = new Set();
  const habilidadesSelecionadas = new Set();

  // =============================
  // Áreas pré-definidas
  // =============================
  areaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;

      if (areasSelecionadas.has(id)) {
        areasSelecionadas.delete(id);
        btn.classList.replace('btn-primary','btn-outline-primary');
      } else if (areasSelecionadas.size < 3) {
        areasSelecionadas.add(id);
        btn.classList.replace('btn-outline-primary','btn-primary');
      }

      atualizarAreasInput();
    });
  });

  // =============================
  // Novas áreas digitadas
  // =============================
  novaAreaInputs.forEach(input => {
    input.addEventListener('input', atualizarAreasInput);
  });

  function atualizarAreasInput() {
    const novas = Array.from(novaAreaInputs)
      .map(input => input.value.trim())
      .filter(Boolean)
      .map(texto => `nova:${texto}`);

    const todas = [...areasSelecionadas, ...novas].slice(0, 3);
    areasInput.value = JSON.stringify(todas);
  }

  // =============================
  // Soft Skills
  // =============================
  skillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;

      if (habilidadesSelecionadas.has(id)) {
        habilidadesSelecionadas.delete(id);
        btn.classList.replace('btn-primary','btn-outline-primary');
      } else if (habilidadesSelecionadas.size < 3) {
        habilidadesSelecionadas.add(id);
        btn.classList.replace('btn-outline-primary','btn-primary');
      }

      habilidadesInput.value = JSON.stringify([...habilidadesSelecionadas]);
    });
  });

  // =============================
  // Salário
  // =============================
  salarioInput.addEventListener('input', () => {
    let s = salarioInput.value.replace(/\D/g, '');
    if (!s) return salarioInput.value = '';
    if (s.length > 11) s = s.slice(0, 11);
    const i = s.slice(0, -2), d = s.slice(-2);
    salarioInput.value = `${parseInt(i || '0').toLocaleString('pt-BR')},${d}`;
  });

  // =============================
  // Moeda
  // =============================
  const simbolos = { BRL:'R$', USD:'US$', EUR:'€', GBP:'£', JPY:'¥' };
  moedaSelect.addEventListener('change', () => {
    simboloSpan.textContent = simbolos[moedaSelect.value] || moedaSelect.value;
  });

  // =============================
  // Tipo de trabalho
  // =============================
  tipo.addEventListener('change', () => {
    campoPres.style.display = 'none';
    campoHome.style.display = 'none';
    diasPres.value = '';
    diasHome.value = '';
    erroDias.textContent = '';
    diasPres.removeAttribute('required');
    diasHome.removeAttribute('required');

    if (tipo.value === 'Presencial') {
      campoPres.style.display = 'flex';
      diasPres.setAttribute('required', '');
    } else if (tipo.value === 'Home_Office') {
      campoHome.style.display = 'flex';
      diasHome.setAttribute('required', '');
    } else if (tipo.value === 'H_brido') {
      campoPres.style.display = 'flex';
      campoHome.style.display = 'flex';
      diasPres.setAttribute('required', '');
      diasHome.setAttribute('required', '');
    }
  });

  function validarDias() {
    if (tipo.value !== 'H_brido') return true;
    const p = parseInt(diasPres.value) || 0;
    const h = parseInt(diasHome.value) || 0;

    if (!diasPres.value || !diasHome.value) {
      erroDias.textContent = 'Preencha ambos os dias.';
      return false;
    }

    if (p + h > 7) {
      erroDias.textContent = 'Total de dias não pode exceder 7.';
      return false;
    }

    erroDias.textContent = '';
    return true;
  }

  diasPres.addEventListener('input', validarDias);
  diasHome.addEventListener('input', validarDias);

  // =============================
  // Validação final do formulário
  // =============================
  form.addEventListener('submit', (e) => {
    atualizarAreasInput(); // garantir que o input esteja sempre atualizado

    let ok = true;
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    document.getElementById('erroAreas').innerText = '';
    document.getElementById('erroHabilidades').innerText = '';
    erroDias.textContent = '';

    if (!validarDias()) ok = false;
    if (!document.getElementById('cargo').value.trim()) {
      document.getElementById('cargo').classList.add('is-invalid'); ok = false;
    }
    if (!tipo.value) {
      tipo.classList.add('is-invalid'); ok = false;
    }
    if (!document.getElementById('escala').value.trim()) {
      document.getElementById('escala').classList.add('is-invalid'); ok = false;
    }

    const areasFinal = JSON.parse(areasInput.value || '[]');
    if (areasFinal.length < 1) {
      document.getElementById('erroAreas').innerText = 'Selecione ao menos 1 área.'; ok = false;
    }

    const skillsFinal = JSON.parse(habilidadesInput.value || '[]');
    if (skillsFinal.length < 1) {
      document.getElementById('erroHabilidades').innerText = 'Selecione ao menos 1 skill.'; ok = false;
    }

    if (!ok) e.preventDefault();
  });

  // Garante atualização inicial
  atualizarAreasInput();
});
