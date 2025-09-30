document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formPublicarVaga') || document.getElementById('formEditarVaga');
if (!form) return;
  if (!form) return;

  // --- ÁREAS ---
  const areaHidden        = document.getElementById('areasSelecionadas');
  const areaBtnsContainer = document.getElementById('area-buttons');
  const novaAreasInputs   = document.querySelectorAll('.nova-area, #inputAreaNova');
  const erroAreasDiv      = document.getElementById('erroAreas');

  function getAreas() {
    try { return JSON.parse(areaHidden.value||'[]').map(String) }
    catch { return [] }
  }
  function setAreas(arr) {
    areaHidden.value = JSON.stringify(arr)
  }

  areaBtnsContainer.addEventListener('click', e => {
    if (!e.target.matches('.area-btn')) return;
    const btn = e.target;
    const id  = String(btn.dataset.id);
    let arr   = getAreas();

    if (arr.includes(id)) {
      arr = arr.filter(x => x !== id);
      btn.classList.replace('btn-primary','btn-outline-primary');
    } else if (arr.length < 3) {
      arr.push(id);
      btn.classList.replace('btn-outline-primary','btn-primary');
    }
    setAreas(arr);
  });

  novaAreasInputs.forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const valor = inp.value.trim();
      if (!valor) return;

      let arr = getAreas();
      const id  = `nova:${valor}`;
      if (arr.includes(id) || arr.length >= 3) {
        return;
      }
      arr.push(id);
      setAreas(arr);

      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'btn btn-primary area-btn';
      btn.dataset.id  = id;
      btn.innerText   = valor;
      areaBtnsContainer.appendChild(btn);

      inp.value = '';
    });
  });


  // --- SKILLS ---
  const skillsHidden = document.getElementById('habilidadesSelecionadas');
  const erroHabsDiv  = document.getElementById('erroHabilidades');
  document.querySelectorAll('.skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = String(btn.dataset.id);
      let arr   = JSON.parse(skillsHidden.value||'[]').map(String);

      if (arr.includes(id)) {
        arr = arr.filter(x => x !== id);
        btn.classList.replace('btn-primary','btn-outline-primary');
      } else if (arr.length < 3) {
        arr.push(id);
        btn.classList.replace('btn-outline-primary','btn-primary');
      }
      skillsHidden.value = JSON.stringify(arr);
    });
  });


  // --- DIAS PRESENCIAL / HOME OFFICE ---
  const tipo            = document.getElementById('tipo');
  const campoPres       = document.getElementById('campoPresencial');
  const campoHome       = document.getElementById('campoHomeOffice');
  const diasPres        = document.getElementById('diasPresenciais');
  const diasHome        = document.getElementById('diasHomeOffice');
  const erroDias        = document.getElementById('erroDias');

  function toggleDias() {
    // reset
    campoPres.style.display = 'none';
    campoHome.style.display = 'none';
    diasPres.value = '';
    diasHome.value = '';
    diasPres.required = false;
    diasHome.required = false;
    erroDias.textContent = '';

    if (tipo.value === 'Presencial') {
      campoPres.style.display = 'flex';
      diasPres.required = true;
    } else if (tipo.value === 'Home_Office') {
      campoHome.style.display = 'flex';
      diasHome.required = true;
    } else if (tipo.value === 'H_brido') {
      campoPres.style.display = 'flex';
      campoHome.style.display = 'flex';
      diasPres.required = true;
      diasHome.required = true;
    }
  }

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

  tipo.addEventListener('change', toggleDias);
  diasPres.addEventListener('input', validarDias);
  diasHome.addEventListener('input', validarDias);
  toggleDias();  // inicializa o estado


  // --- SALÁRIO e MOEDA ---
  const salarioInput = document.getElementById('salario');
  const moedaSelect  = document.getElementById('moeda');
  const simboloSpan  = document.getElementById('simboloMoeda');
  const simbolos     = { BRL:'R$', USD:'US$', EUR:'€', GBP:'£', JPY:'¥' };

  salarioInput.addEventListener('input', () => {
    let s = salarioInput.value.replace(/\D/g,'');
    if (!s) return salarioInput.value = '';
    if (s.length > 11) s = s.slice(0,11);
    const i = s.slice(0,-2), d = s.slice(-2);
    salarioInput.value = `${parseInt(i||'0').toLocaleString('pt-BR')},${d}`;
  });

  moedaSelect.addEventListener('change', () => {
    simboloSpan.textContent = simbolos[moedaSelect.value]||'';
  });


  // --- VALIDAÇÃO FINAL ---
  form.addEventListener('submit', e => {
    erroAreasDiv.innerText = '';
    erroHabsDiv.innerText  = '';

    const areas = getAreas();
    const habs  = JSON.parse(skillsHidden.value||'[]');

    let ok = true;
    if (areas.length < 1) {
      erroAreasDiv.innerText = 'Selecione ao menos 1 área.';
      ok = false;
    }
    if (habs.length < 1) {
      erroHabsDiv.innerText = 'Selecione ao menos 1 skill.';
      ok = false;
    }
    if (!validarDias()) ok = false;

    if (!ok) e.preventDefault();
  });
});
