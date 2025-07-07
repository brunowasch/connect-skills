const tirarFotoBtn = document.getElementById('tirarFotoBtn');
const outraFotoBtn = document.getElementById('outraFoto');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const preview = document.getElementById('previewFoto');
const uploadInput = document.getElementById('upload');
const opcoesFoto = document.getElementById('opcoesFoto');
const acoesFoto = document.getElementById('acoesFoto');
const form = document.getElementById('formFoto');
const erroFoto = document.getElementById('erroFoto');

let cameraAtiva = false;

if (tirarFotoBtn) {
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

      canvas.toBlob(blob => {
        const file = new File([blob], `camera-foto-${Date.now()}.png`, { type: 'image/png' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        uploadInput.files = dataTransfer.files;

        const reader = new FileReader();
        reader.onload = e => {
          preview.src = e.target.result;
          preview.style.display = 'block';

          document.getElementById('fotoBase64').value = base64;
        };
        reader.readAsDataURL(file);
      });

      video.srcObject.getTracks().forEach(track => track.stop());
      video.style.display = 'none';
      opcoesFoto.style.display = 'none';
      acoesFoto.style.display = 'flex';
      cameraAtiva = false;
    }
  });
}

uploadInput?.addEventListener('change', () => {
  const file = uploadInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;
      preview.style.display = 'block';
      opcoesFoto.style.display = 'none';
      acoesFoto.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }
});

outraFotoBtn?.addEventListener('click', () => {
  preview.style.display = 'none';
  acoesFoto.style.display = 'none';
  opcoesFoto.style.display = 'flex';
  uploadInput.value = '';
});

form?.addEventListener('submit', function (e) {
  if (uploadInput.files.length === 0) {
    e.preventDefault();
    erroFoto.style.display = 'block';
  } else {
    erroFoto.style.display = 'none';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  if (preview && !preview.src.includes('blob') && !uploadInput.value) {
    preview.style.display = 'block'; // mostra o avatar.png inicial
  }
});
