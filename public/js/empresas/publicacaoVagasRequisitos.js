document.addEventListener('DOMContentLoaded', () => {
  const tipo         = document.getElementById('tipo');
  const campoPres    = document.getElementById('campoPresencial');
  const campoHome    = document.getElementById('campoHomeOffice');
  const diasPres     = document.getElementById('diasPresenciais');
  const diasHome     = document.getElementById('diasHomeOffice');
  const erroDias     = document.getElementById('erroDias');
  const moedaSelect  = document.getElementById('moeda');
  const simboloSpan  = document.getElementById('simboloMoeda');
  const salarioInput = document.getElementById('salario');
  const form         = document.getElementById('formPublicarVaga');

  const simbolos = { BRL:'R$', USD:'US$', EUR:'€', GBP:'£', JPY:'¥', /*…*/ };

  // Ajusta campos dias
  tipo.addEventListener('change', () => {
    const v = tipo.value; // Presencial | Home_Office | H_brido
    campoPres.style.display = 'none';
    campoHome.style.display = 'none';
    diasPres.value = diasHome.value = '';
    erroDias.textContent = '';
    diasPres.removeAttribute('required');
    diasHome.removeAttribute('required');

    if (v === 'Presencial') {
      campoPres.style.display = 'flex';
      diasPres.setAttribute('required','');
    } else if (v === 'Home_Office') {
      campoHome.style.display = 'flex';
      diasHome.setAttribute('required','');
    } else if (v === 'H_brido') {
      campoPres.style.display = 'flex';
      campoHome.style.display = 'flex';
      diasPres.setAttribute('required','');
      diasHome.setAttribute('required','');
    }
  });

  const validarDias = () => {
    if (tipo.value !== 'H_brido') { erroDias.textContent = ''; return true; }
    const p = parseInt(diasPres.value)||0, h = parseInt(diasHome.value)||0;
    if (!diasPres.value||!diasHome.value) {
      erroDias.textContent = 'Preencha ambos os dias.'; return false;
    }
    if (p+h >7) {
      erroDias.textContent = 'Total de dias não pode exceder 7.'; return false;
    }
    erroDias.textContent = '';
    return true;
  };
  diasPres.addEventListener('input', validarDias);
  diasHome.addEventListener('input', validarDias);

  // Máscara de salário
  salarioInput.addEventListener('input', () => {
    let s = salarioInput.value.replace(/\D/g,'');
    if (!s) return salarioInput.value='';
    if (s.length>11) s=s.slice(0,11);
    const i = s.slice(0,-2), d = s.slice(-2);
    salarioInput.value = `${parseInt(i||'0').toLocaleString('pt-BR')},${d}`;
  });

  moedaSelect.addEventListener('change', () => {
    simboloSpan.textContent = simbolos[moedaSelect.value]||moedaSelect.value;
  });

  // Seleção de áreas e skills (JSON)
  const areaBtns  = document.querySelectorAll('.area-btn');
  const skillBtns = document.querySelectorAll('.skill-btn');
  const areasIn   = document.getElementById('areasSelecionadas');
  const skillsIn  = document.getElementById('habilidadesSelecionadas');
  const areasSet  = new Set();
  const skillsSet = new Set();

  areaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (areasSet.has(id)) {
        areasSet.delete(id);
        btn.classList.replace('btn-primary','btn-outline-primary');
      } else if (areasSet.size<3) {
        areasSet.add(id);
        btn.classList.replace('btn-outline-primary','btn-primary');
      }
      areasIn.value = JSON.stringify([...areasSet]);
    });
  });

  skillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (skillsSet.has(id)) {
        skillsSet.delete(id);
        btn.classList.replace('btn-primary','btn-outline-primary');
      } else if (skillsSet.size<3) {
        skillsSet.add(id);
        btn.classList.replace('btn-outline-primary','btn-primary');
      }
      skillsIn.value = JSON.stringify([...skillsSet]);
    });
  });

  // Validação final
  form.addEventListener('submit', (e) => {
    let ok = true;
    document.querySelectorAll('.is-invalid').forEach(x=>x.classList.remove('is-invalid'));
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
    if (areasSet.size<1) {
      document.getElementById('erroAreas').innerText='Selecione ao menos 1 área.'; ok=false;
    }
    if (skillsSet.size<1) {
      document.getElementById('erroHabilidades').innerText='Selecione ao menos 1 skill.'; ok=false;
    }
    if (!ok) e.preventDefault();
  });
});
