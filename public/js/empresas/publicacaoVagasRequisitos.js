document.addEventListener('DOMContentLoaded', () => {
  const tipo = document.getElementById('tipo');
  const campoPresencial = document.getElementById('campoPresencial');
  const campoHomeOffice = document.getElementById('campoHomeOffice');
  const diasPresenciais = document.getElementById('diasPresenciais');
  const diasHomeOffice = document.getElementById('diasHomeOffice');
  const erroDias = document.getElementById('erroDias');
  const form = document.getElementById('formPublicarVaga');
  const moedaSelect = document.getElementById('moeda');
  const simboloSpan = document.getElementById('simboloMoeda');
  const salarioInput = document.getElementById('salario');

  const simbolos = {
    'BRL': 'R$', 'USD': 'US$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'ARS': 'AR$', 'CAD': 'C$', 'AUD': 'A$',
    'CHF': 'CHF', 'CNY': '¥', 'INR': '₹', 'MXN': 'MX$', 'ZAR': 'R', 'KRW': '₩', 'SEK': 'kr', 'RUB': '₽'
  };

  tipo.addEventListener('change', () => {
    const valor = tipo.value;

    campoPresencial.style.display = 'none';
    campoHomeOffice.style.display = 'none';
    diasPresenciais.value = '';
    diasHomeOffice.value = '';
    erroDias.textContent = '';
    diasPresenciais.removeAttribute('required');
    diasHomeOffice.removeAttribute('required');

    if (valor === 'Presencial') {
      campoPresencial.style.display = 'flex';
      diasPresenciais.setAttribute('required', 'required');
    } else if (valor === 'Home Office') {
      campoHomeOffice.style.display = 'flex';
      diasHomeOffice.setAttribute('required', 'required');
    } else if (valor === 'Híbrido') {
      campoPresencial.style.display = 'flex';
      campoHomeOffice.style.display = 'flex';
      diasPresenciais.setAttribute('required', 'required');
      diasHomeOffice.setAttribute('required', 'required');
    }
  });

  function validarDiasHibrido() {
    const tipoValor = tipo.value;
    const p = parseInt(diasPresenciais.value) || 0;
    const h = parseInt(diasHomeOffice.value) || 0;

    if (tipoValor === 'Híbrido') {
      if (!diasPresenciais.value || !diasHomeOffice.value) {
        erroDias.textContent = 'Preencha os dois campos de dias.';
        return false;
      }
      if (p + h > 7) {
        erroDias.textContent = 'A soma dos dias não pode ser maior que 7.';
        return false;
      }
    }

    erroDias.textContent = '';
    return true;
  }

  diasPresenciais.addEventListener('input', validarDiasHibrido);
  diasHomeOffice.addEventListener('input', validarDiasHibrido);

  moedaSelect.addEventListener('change', () => {
    const moeda = moedaSelect.value;
    simboloSpan.textContent = simbolos[moeda] || moeda;
  });

  salarioInput.addEventListener('input', () => {
    let valor = salarioInput.value.replace(/\D/g, '');
    if (!valor) return salarioInput.value = '';

    if (valor.length > 11) valor = valor.slice(0, 11);
    const inteiro = valor.slice(0, -2);
    const decimal = valor.slice(-2);
    const inteiroFormatado = parseInt(inteiro || '0').toLocaleString('pt-BR');

    salarioInput.value = `${inteiroFormatado},${decimal}`;
  });

  // Áreas e habilidades
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
      const habilidade = btn.textContent;
      if (habilidadesSelecionadas.has(habilidade)) {
        habilidadesSelecionadas.delete(habilidade);
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
      } else {
        if (habilidadesSelecionadas.size >= 3) return;
        habilidadesSelecionadas.add(habilidade);
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-primary');
      }
      habilidadesSelecionadasInput.value = Array.from(habilidadesSelecionadas).join(',');
    });
  });

  // Validação final no envio
  form.addEventListener('submit', (e) => {
    let valido = true;

    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    document.getElementById('erroAreas').innerText = '';
    document.getElementById('erroHabilidades').innerText = '';
    erroDias.textContent = '';

    if (!validarDiasHibrido()) valido = false;

    const cargo = document.getElementById('cargo');
    if (!cargo.value.trim()) {
      cargo.classList.add('is-invalid');
      valido = false;
    }

    if (!tipo.value) {
      tipo.classList.add('is-invalid');
      valido = false;
    }

    const escala = document.getElementById('escala');
    if (!escala.value.trim()) {
      escala.classList.add('is-invalid');
      valido = false;
    }

    const areas = areasSelecionadasInput.value.split(',').filter(v => v.trim() !== '');
    if (areas.length < 1) {
      document.getElementById('erroAreas').innerText = 'Selecione pelo menos uma área de atuação.';
      valido = false;
    }

    const habilidades = habilidadesSelecionadasInput.value.split(',').filter(v => v.trim() !== '');
    if (habilidades.length < 1) {
      document.getElementById('erroHabilidades').innerText = 'Selecione pelo menos uma habilidade comportamental.';
      valido = false;
    }

    if (!valido) {
      console.log("Formulário inválido");
      e.preventDefault();
    } else {
      console.log("Formulário válido, será enviado");
    }
  });
  console.log("JS de publicação de vaga carregado");
});
