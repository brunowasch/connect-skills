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

    let cameraAtiva = false;

    tirarFotoBtn.addEventListener('click', () => {
      if (!cameraAtiva) {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            video.srcObject = stream;
            video.style.display = 'block';
            tirarFotoBtn.textContent = '📸 Capturar agora';
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
        let tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());

        video.style.display = 'none';
        opcoesFoto.style.display = 'none';
        acoesFoto.style.display = 'block';
        cameraAtiva = false;
        tirarFotoBtn.textContent = '📸 Capturar agora';
      }
    });

    outraFotoBtn.addEventListener('click', () => {
      preview.style.display = 'none';
      acoesFoto.style.display = 'none';
      opcoesFoto.style.display = 'flex';
    });

    uploadInput.addEventListener('change', () => {
      const file = uploadInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          fotoBase64.value = e.target.result;
          preview.src = e.target.result;
          preview.style.display = 'block';
          opcoesFoto.style.display = 'none';
          acoesFoto.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
    form.addEventListener('submit', function (e) {
    if (!fotoBase64.value || fotoBase64.value.trim() === "") {
      e.preventDefault();
      document.getElementById('erroFoto').style.display = 'block';
    } else {
      document.getElementById('erroFoto').style.display = 'none';
    }
  });
