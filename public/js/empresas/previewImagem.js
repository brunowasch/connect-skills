function abrirCamera() {
  const video = document.getElementById('camera');
  const cameraContainer = document.getElementById('cameraContainer');

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
      cameraContainer.classList.remove('d-none');
    })
    .catch(err => {
      alert('Não foi possível acessar a câmera: ' + err.message);
    });
}

function capturarFoto() {
  const video = document.getElementById('camera');
  const canvas = document.getElementById('canvas');
  const preview = document.getElementById('previewImagem');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataURL = canvas.toDataURL('image/png');
  preview.src = dataURL;
  document.getElementById('fotoBase64').value = dataURL;

  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  document.getElementById('cameraContainer').classList.add('d-none');
}

function previewFoto(input) {
  const preview = document.getElementById('previewImagem');
  const botoesFoto = document.getElementById('botoesFoto');

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;

      // ✅ Exibir novamente os botões após escolher nova imagem
      if (botoesFoto) {
        botoesFoto.classList.remove('d-none');
        botoesFoto.classList.add('d-flex');
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}
