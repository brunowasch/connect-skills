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

  // Máscara automática no telefone
  telInput.addEventListener('input', () => {
    let valor = telInput.value.replace(/\D/g, '');

    if (valor.length > 11) valor = valor.slice(0, 11);

    // Formata com hífen após 5 números
    if (valor.length > 5) {
      valor = valor.slice(0, valor.length - 4) + '-' + valor.slice(-4);
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

    const dddValido = /^\d{2}$/.test(ddd);
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