const form = document.querySelector('form');
  const senha = document.getElementById('senha');
  const confirmarSenha = document.getElementById('confirmarSenha');
  const erroSenha = document.getElementById('erro-senha');

  form.addEventListener('submit', function (e) {
    // Limpa os estilos antes de validar
    senha.classList.remove('is-invalid');
    confirmarSenha.classList.remove('is-invalid');
    erroSenha.classList.add('d-none');

    if (senha.value !== confirmarSenha.value) {
      e.preventDefault(); // Impede envio
      senha.classList.add('is-invalid');
      confirmarSenha.classList.add('is-invalid');
      erroSenha.classList.remove('d-none');
    }
  });
