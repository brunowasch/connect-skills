  const tirarFotoBtn = document.getElementById('tirarFotoBtn');
  const outraFotoBtn = document.getElementById('outraFoto');
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const fotoBase64 = document.getElementById('fotoBase64');
  const preview = document.getElementById('previewFoto');
  const uploadInput = document.getElementById('upload');
  const opcoesFoto = document.getElementById('opcoesFoto');
  const acoesFoto = document.getElementById('acoesFoto');
  const form = document.getElementById('formFoto');
  const erroFoto = document.getElementById('erroFoto');

  let cameraAtiva = false;

  // Tirar foto pela câmera
  tirarFotoBtn.addEventListener('click', () => {
    if (!cameraAtiva) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          video.srcObject = stream;
          video.style.display = 'block';
          cameraAtiva = true;
        })
        .catch(err => alert('Erro ao acessar a câmera: ' + err));
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL('image/png');
      fotoBase64.value = dataURL;
      preview.src = dataURL;
      preview.style.display = 'block';

      // Parar câmera
      video.srcObject.getTracks().forEach(track => track.stop());
      video.style.display = 'none';
      opcoesFoto.style.display = 'none';
      acoesFoto.style.display = 'flex';
      cameraAtiva = false;
    }
  });

  // Upload de imagem do PC
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        fotoBase64.value = e.target.result;
        preview.src = e.target.result;
        preview.style.display = 'block';
        opcoesFoto.style.display = 'none';
        acoesFoto.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    }
  });

  // Trocar a foto
  outraFotoBtn.addEventListener('click', () => {
    preview.style.display = 'none';
    acoesFoto.style.display = 'none';
    opcoesFoto.style.display = 'flex';
    fotoBase64.value = '';
  });

  // Validação no envio
  form.addEventListener('submit', function (e) {
    if (!fotoBase64.value || fotoBase64.value.trim() === "") {
      e.preventDefault();
      erroFoto.style.display = 'block';
    } else {
      erroFoto.style.display = 'none';
    }
  });