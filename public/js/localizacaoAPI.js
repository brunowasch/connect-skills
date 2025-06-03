  const inputLocalidade = document.getElementById('localidade');
  const sugestoes = document.getElementById('sugestoesLocalidade');
  const btnLocalizacao = document.getElementById('btnLocalizacao');
  const form = document.getElementById('formLocalizacao');
  const erroLocalidade = document.getElementById('erro-localidade');

  let debounce;
  let localidadeValida = false;

  // 🔍 Autocomplete
  inputLocalidade.addEventListener('input', () => {
    localidadeValida = false;
    clearTimeout(debounce);
    const valor = inputLocalidade.value.trim();

    if (valor.length < 3) {
      sugestoes.classList.add('d-none');
      return;
    }

    debounce = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(valor)}&addressdetails=1&limit=5`);
        const dados = await res.json();

        sugestoes.innerHTML = '';

        dados.forEach((lugar) => {
          let cidade = lugar.address.city || lugar.address.town || lugar.address.village || '';
          const estado = lugar.address.state || lugar.address.region || lugar.address.county || '';
          const pais = lugar.address.country || '';

          if (!cidade && inputLocalidade.value) {
            cidade = inputLocalidade.value.trim().toLowerCase()
              .split(' ')
              .map(p => p.charAt(0).toUpperCase() + p.slice(1))
              .join(' ');
          }

          const partes = [cidade, estado, pais].filter(Boolean);
          const texto = partes.filter((item, index) => partes.indexOf(item) === index).join(', ');

          const li = document.createElement('li');
          li.classList.add('list-group-item', 'list-group-item-action');
          li.textContent = texto;

          li.addEventListener('click', () => {
            inputLocalidade.value = texto;
            inputLocalidade.readOnly = true;
            sugestoes.classList.add('d-none');
            localidadeValida = true;
            btnEditarLocal.classList.remove('d-none'); // 👈 mostra o botão
          });

          sugestoes.appendChild(li);
        });

        sugestoes.classList.toggle('d-none', dados.length === 0);
      } catch (error) {
        console.error('Erro ao buscar sugestões:', error);
        sugestoes.classList.add('d-none');
      }
    }, 400);
  });

  // ⌨️ Enter → aplicar sugestão diferente do input
  inputLocalidade.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !localidadeValida) {
      const primeiraSugestao = sugestoes.querySelector('li');
      if (primeiraSugestao) {
        const textoDigitado = inputLocalidade.value.trim().toLowerCase().replace(/\s+/g, '');
        const textoSugestao = primeiraSugestao.textContent.trim().toLowerCase().replace(/\s+/g, '');

        if (textoDigitado !== textoSugestao) {
          e.preventDefault();
          primeiraSugestao.click();
        }
      }
    }
  });

  // Ocultar sugestões ao clicar fora
  document.addEventListener('click', (e) => {
    if (!sugestoes.contains(e.target) && e.target !== inputLocalidade) {
      sugestoes.classList.add('d-none');
    }
  });

  // 📍 Geolocalização
  btnLocalizacao.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async position => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'ConnectSkillsApp/1.0' } });
          const data = await res.json();

          const cidade = data.address.city || data.address.town || data.address.village || '';
          const estado = data.address.state || data.address.region || data.address.county || '';
          const pais = data.address.country || '';

          const partes = [cidade, estado, pais].filter(Boolean);
          const textoFinal = partes.filter((item, index) => partes.indexOf(item) === index).join(', ');

          inputLocalidade.value = textoFinal;
          inputLocalidade.readOnly = true;
          localidadeValida = true;
          btnEditarLocal.classList.remove('d-none');
        } catch (error) {
          alert('Erro ao obter sua localização. Tente novamente.');
        }
      }, () => {
        alert('Não foi possível acessar sua localização.');
      });
    } else {
      alert('Seu navegador não suporta geolocalização.');
    }
  });

  const btnEditarLocal = document.getElementById('btnEditarLocal');
  btnEditarLocal.addEventListener('click', () => {
    inputLocalidade.readOnly = false;
    inputLocalidade.focus(); // já coloca o cursor no campo
    localidadeValida = false;
    btnEditarLocal.classList.add('d-none');
  });

  // ✅ Validação no envio do formulário
  form.addEventListener('submit', function (e) {
    const valor = inputLocalidade.value.trim();
    const partes = valor.split(',').map(p => p.trim()).filter(Boolean);

    inputLocalidade.classList.remove('is-invalid');
    erroLocalidade.classList.add('d-none');

    if (partes.length !== 3 || !localidadeValida) {
      e.preventDefault();
      inputLocalidade.classList.add('is-invalid');
      erroLocalidade.textContent = 'Informe uma localidade válida no formato: cidade, estado e país.';
      erroLocalidade.classList.remove('d-none');
    }
  });