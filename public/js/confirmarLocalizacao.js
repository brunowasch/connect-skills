    const form = document.getElementById('formLocalizacao');
    const localidadeInput = document.getElementById('localidade');
    const erroLocalidade = document.getElementById('erro-localidade');

    form.addEventListener('submit', function (e) {
      const valor = localidadeInput.value.trim();

      localidadeInput.classList.remove('is-invalid');
      erroLocalidade.classList.add('d-none');

      if (valor === '') {
        e.preventDefault();
        localidadeInput.classList.add('is-invalid');
        erroLocalidade.classList.remove('d-none');
      }
    });