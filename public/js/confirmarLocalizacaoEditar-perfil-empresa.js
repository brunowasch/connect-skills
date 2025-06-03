document.addEventListener('DOMContentLoaded', () => {

  const inputLocalidade = document.getElementById('localidade');
  const sugestoes = document.getElementById('sugestoesLocalidade');
  const btnLocalizacao = document.getElementById('btnLocalizacao');
  const form = document.querySelector('form');
  const erroLocalidade = document.getElementById('erro-localidade');
  const btnEditarLocal = document.getElementById('btnEditarLocal');

  let debounce;
  let localidadeValida = false;

  function montarLocalidade(cidade, estado, pais) {
    const normalizar = str => str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const partesOriginais = [cidade, estado, pais].filter(Boolean);
    const partesUnicas = [];
    const vistos = new Set();
    for (const parte of partesOriginais) {
      const normalizada = normalizar(parte);
      if (!vistos.has(normalizada)) {
        vistos.add(normalizada);
        partesUnicas.push(parte.trim());
      }
    }
    return partesUnicas.slice(0, 3).join(', ');
  }

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
            cidade = inputLocalidade.value.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
          }
          const texto = montarLocalidade(cidade, estado, pais);
          const li = document.createElement('li');
          li.classList.add('list-group-item', 'list-group-item-action');
          li.textContent = texto;
          li.addEventListener('click', () => {
            inputLocalidade.value = texto;
            inputLocalidade.readOnly = true;
            sugestoes.classList.add('d-none');
            localidadeValida = true;
            if (btnEditarLocal) btnEditarLocal.classList.remove('d-none');
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

  inputLocalidade.addEventListener('input', () => localidadeValida = false);
  inputLocalidade.addEventListener('change', () => localidadeValida = false);
  inputLocalidade.addEventListener('paste', () => localidadeValida = false);
  inputLocalidade.addEventListener('keydown', () => localidadeValida = false);

  document.addEventListener('click', (e) => {
    if (!sugestoes.contains(e.target) && e.target !== inputLocalidade) {
      sugestoes.classList.add('d-none');
    }
  });

  if (btnLocalizacao) {
    btnLocalizacao.addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async position => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
              headers: { 'User-Agent': 'ConnectSkillsApp/1.0' }
            });
            const data = await res.json();
            const cidade = data.address.city || data.address.town || data.address.village || '';
            const estado = data.address.state || data.address.region || data.address.county || '';
            const pais = data.address.country || '';
            const textoFinal = montarLocalidade(cidade, estado, pais);
            inputLocalidade.value = textoFinal;
            inputLocalidade.readOnly = true;
            localidadeValida = true;
            if (btnEditarLocal) btnEditarLocal.classList.remove('d-none');
          } catch (err) {
            alert('Erro ao obter sua localização.');
          }
        }, () => alert('Não foi possível acessar sua localização.'));
      } else {
        alert('Seu navegador não suporta geolocalização.');
      }
    });
  }

  if (btnEditarLocal) {
    btnEditarLocal.addEventListener('click', () => {
        inputLocalidade.readOnly = false;
        inputLocalidade.value = ''; // limpa o valor antigo!
        localidadeValida = false;
        inputLocalidade.classList.remove('is-invalid');
        erroLocalidade.classList.add('d-none');
        sugestoes.classList.add('d-none');
        btnEditarLocal.classList.add('d-none');
        inputLocalidade.focus();
    });
  }

  form.addEventListener('submit', (e) => {
    const valor = inputLocalidade.value.trim();
    const partes = valor.split(',').map(p => p.trim()).filter(Boolean);
    const normalizar = str => str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const duplicadas = partes.some((parte, index, array) =>
      array.findIndex(p => normalizar(p) === normalizar(parte)) !== index
    );
    inputLocalidade.classList.remove('is-invalid');
    erroLocalidade.classList.add('d-none');
    const formatoCorreto = /^[\p{L}\p{M}\s,]+$/u.test(valor);
    if (partes.length !== 3 || !localidadeValida || duplicadas || !formatoCorreto) {
      e.preventDefault();
      inputLocalidade.classList.add('is-invalid');
      erroLocalidade.textContent = 'Informe uma localidade válida no formato: cidade, estado e país.';
      erroLocalidade.classList.remove('d-none');
    }
  });

  setTimeout(() => {
    if (inputLocalidade && inputLocalidade.value.trim().length > 0) {
      inputLocalidade.readOnly = true;
      if (btnEditarLocal) btnEditarLocal.classList.remove('d-none');
    }
  }, 100);

});