 const form = document.getElementById('formTelefone');
    const dddInput = document.getElementById('ddd');
    const telInput = document.getElementById('telefone');

    form.addEventListener('submit', function (e) {
      let valido = true;

      // Limpa mensagens anteriores
      dddInput.classList.remove('is-invalid');
      telInput.classList.remove('is-invalid');

      const ddd = dddInput.value.trim();
      const tel = telInput.value.trim();

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
        e.preventDefault(); // Impede envio do form se inválido
      }
    });