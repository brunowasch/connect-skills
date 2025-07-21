const form = document.getElementById('formTelefone');
const dddInput = document.getElementById('ddd');
const telInput = document.getElementById('telefone');

// Permitir apenas números
function apenasNumeros(e) {
  const permitido = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
  if (permitido.includes(e.key)) return;

  if (!/^\d$/.test(e.key)) {
    e.preventDefault(); // bloqueia se não for número
  }
}

dddInput.addEventListener('keydown', apenasNumeros);
telInput.addEventListener('keydown', apenasNumeros);

// Máscara automática no telefone com hífen
telInput.addEventListener('input', () => {
  let valor = telInput.value.replace(/\D/g, '');
  if (valor.length > 11) valor = valor.slice(0, 11);

  // Formatar para padrão nacional com hífen
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

  dddInput.classList.remove('is-invalid');
  telInput.classList.remove('is-invalid');

  const ddd = dddInput.value.trim();
  const tel = telInput.value.replace(/\D/g, '');

  const dddValido = /^[1-9]{2}$/.test(ddd); // DDDs de 11 a 99
  const telValido = /^\d{8,11}$/.test(tel);

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
