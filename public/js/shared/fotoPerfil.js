// Elementos do DOM
const tirarFotoBtn  = document.getElementById('tirarFotoBtn');
const outraFotoBtn  = document.getElementById('outraFoto');
const video         = document.getElementById('video');
const canvas        = document.getElementById('canvas');
const preview       = document.getElementById('previewFoto');
const uploadInput   = document.getElementById('foto');
const opcoesFoto    = document.getElementById('opcoesFoto');
const acoesFoto     = document.getElementById('acoesFoto');
const form          = document.getElementById('formFoto');
const erroFoto      = document.getElementById('erroFoto');

let cameraAtiva = false;

// Função para resetar a prévia ao avatar padrão
function resetPreview() {
  preview.src = '/img/avatar.png';
  preview.style.display = 'block';
  uploadInput.value = '';
  acoesFoto.style.display = 'none';
  opcoesFoto.style.display = 'flex';
  erroFoto.style.display = 'none';
}

uploadInput?.addEventListener('change', () => {
  const file = uploadInput.files[0];
  if (!file) return resetPreview();

  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.style.display = 'block';
    opcoesFoto.style.display = 'none';
    acoesFoto.style.display = 'flex';
  };
  reader.readAsDataURL(file);
});

tirarFotoBtn?.addEventListener('click', () => {
  if (!cameraAtiva) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
        video.style.display = 'block';
        opcoesFoto.style.display = 'none';
        cameraAtiva = true;
      })
      .catch(err => alert('Erro ao acessar a câmera: ' + err));
  } else {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      const file = new File([blob], `camera-${Date.now()}.png`, { type: 'image/png' });
      const dt   = new DataTransfer();
      dt.items.add(file);
      uploadInput.files = dt.files;

      const reader = new FileReader();
      reader.onload = e => {
        preview.src = e.target.result;
        preview.style.display = 'block';
        acoesFoto.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    }, 'image/png');

    video.srcObject.getTracks().forEach(t => t.stop());
    video.style.display = 'none';
    cameraAtiva = false;
  }
});

outraFotoBtn?.addEventListener('click', resetPreview);

form?.addEventListener('submit', e => {
  if (!uploadInput.files.length) {
    e.preventDefault();
    erroFoto.style.display = 'block';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  resetPreview();
});