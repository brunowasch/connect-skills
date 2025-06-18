  const form = document.querySelector('form');
  const dataNascimentoInput = document.getElementById('dataNascimento');
  const erroIdade = document.getElementById('erro-idade');

  form.addEventListener('submit', function (e) {
    const dataNascimento = new Date(dataNascimentoInput.value);
    const hoje = new Date();

    const idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const mes = hoje.getMonth() - dataNascimento.getMonth();
    const dia = hoje.getDate() - dataNascimento.getDate();
    const idadeFinal = (mes < 0 || (mes === 0 && dia < 0)) ? idade - 1 : idade;

    // Reset
    dataNascimentoInput.classList.remove('is-invalid');
    erroIdade.classList.add('d-none');
    erroIdade.textContent = '';

    if (isNaN(idadeFinal)) {
      e.preventDefault(); // data inválida
    } else if (idadeFinal < 16) {
      e.preventDefault();
      dataNascimentoInput.classList.add('is-invalid');
      erroIdade.textContent = 'Você precisa ter pelo menos 16 anos para se cadastrar no Connect Skills.';
      erroIdade.classList.remove('d-none');
    } else if (idadeFinal > 150) {
      e.preventDefault();
      dataNascimentoInput.classList.add('is-invalid');
      erroIdade.textContent = 'Parece improvável alguém ter esta idade. Verifique sua data de nascimento.';
      erroIdade.classList.remove('d-none');
    }
  });
