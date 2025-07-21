const form = document.getElementById('formLocalizacao');
const ddiInput = document.getElementById('ddi');
const dddInput = document.getElementById('ddd');
const telInput = document.getElementById('telefone');

// Permitir apenas números
function apenasNumeros(e) {
  const permitido = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
  if (permitido.includes(e.key)) return;
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
  }
}

[ddiInput, dddInput, telInput].forEach(input => {
  input.addEventListener('keydown', apenasNumeros);
});

// Máscara automática no telefone com hífen
telInput.addEventListener('input', () => {
  let valor = telInput.value.replace(/\D/g, '');
  if (valor.length > 11) valor = valor.slice(0, 11);

  if (valor.length >= 9) {
    valor = valor.replace(/^(\d{5})(\d{4})$/, '$1-$2');
  } else if (valor.length >= 8) {
    valor = valor.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  }

  telInput.value = valor;
});

// Validação no envio
form.addEventListener('submit', function (e) {
  let valido = true;

  ddiInput.classList.remove('is-invalid');
  dddInput.classList.remove('is-invalid');
  telInput.classList.remove('is-invalid');

  const ddi = ddiInput.value.trim();
  const ddd = dddInput.value.trim();
  const tel = telInput.value.replace(/\D/g, '');

  const ddiValido = /^\d{1,3}$/.test(ddi);
  const dddValido = /^[1-9]{2}$/.test(ddd);
  const telValido = /^\d{8,11}$/.test(tel);

  if (!ddiValido) {
    ddiInput.classList.add('is-invalid');
    valido = false;
  }

  if (!dddValido) {
    dddInput.classList.add('is-invalid');
    valido = false;
  }

  if (!telValido) {
    telInput.classList.add('is-invalid');
    valido = false;
  }

  if (!valido) {
    e.preventDefault();
  }
});
