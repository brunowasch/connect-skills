const form = document.querySelector('form');
const senha = document.getElementById('senha');
const confirmarSenha = document.getElementById('confirmarSenha');
const erroSenha = document.getElementById('erro-senha');
const erroRequisitos = document.getElementById('erro-senha-requisitos');

form.addEventListener('submit', function (e) {
  let valido = true;

  senha.classList.remove('is-invalid');
  confirmarSenha.classList.remove('is-invalid');
  erroSenha.classList.add('d-none');
  erroRequisitos.style.display = 'none';

  const senhaValor = senha.value.trim();
  const confirmarValor = confirmarSenha.value.trim();
  const senhaValida = senhaValor.length >= 8 && /[^A-Za-z0-9]/.test(senhaValor);

  // 👇 Adiciona classe e mostra a mensagem corretamente
  if (!senhaValida) {
    senha.classList.add('is-invalid');
    erroRequisitos.style.display = 'block';
    valido = false;
  }

  if (senhaValor !== confirmarValor) {
    confirmarSenha.classList.add('is-invalid');
    erroSenha.classList.remove('d-none');
    valido = false;
  }

  if (!valido) e.preventDefault();
});

// Alternar visibilidade da senha
const toggleSenha = document.getElementById('toggleSenha');
const iconSenha = document.getElementById('iconSenha');

toggleSenha.addEventListener('click', () => {
  const isText = senha.type === 'text';
  senha.type = isText ? 'password' : 'text';
  iconSenha.className = isText ? 'bi bi-eye' : 'bi bi-eye-slash';
});

const toggleConfirmar = document.getElementById('toggleConfirmar');
const iconConfirmar = document.getElementById('iconConfirmar');

toggleConfirmar.addEventListener('click', () => {
  const isText = confirmarSenha.type === 'text';
  confirmarSenha.type = isText ? 'password' : 'text';
  iconConfirmar.className = isText ? 'bi bi-eye' : 'bi bi-eye-slash';
});

