// public/js/shared/botoesFotosEditar-perfil-empresa.js

document.addEventListener('DOMContentLoaded', () => {
  const btnAlterar     = document.getElementById('btnAlterarFoto');
  const botoesFoto     = document.getElementById('botoesFoto');
  const cameraContainer= document.getElementById('cameraContainer');
  const video          = document.getElementById('camera');
  const canvas         = document.getElementById('canvas');
  const fotoFileInput  = document.getElementById('fotoArquivo');
  const hiddenBase64   = document.getElementById('fotoBase64');
  const preview        = document.getElementById('previewImagem');
  let stream            = null;

  // mostra os botões de escolha
  btnAlterar.addEventListener('click', () => {
    btnAlterar.classList.add('d-none');
    botoesFoto.classList.remove('d-none');
  });

  // expõe no escopo global para poder chamar do onclick
  window.abrirCamera = () => {
    botoesFoto.classList.add('d-none');
    cameraContainer.classList.remove('d-none');

    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => {
        stream = s;
        video.srcObject = s;
      })
      .catch(err => {
        alert('Não foi possível acessar a câmera: ' + err);
      });
  };

  window.capturarFoto = () => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);

    canvas.toBlob(blob => {
      // 1) popula o input type=file para o multer captar
      const file = new File([blob], `camera_${Date.now()}.png`, { type: 'image/png' });
      const dt   = new DataTransfer();
      dt.items.add(file);
      fotoFileInput.files = dt.files;

      // 2) atualiza o campo hidden com base64 e o preview
      const reader = new FileReader();
      reader.onload = e => {
        hiddenBase64.value = e.target.result;
        preview.src       = e.target.result;
      };
      reader.readAsDataURL(file);

      // 3) para a câmera
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      cameraContainer.classList.add('d-none');
    }, 'image/png');
  };

  // preview quando seleciona do dispositivo
  fotoFileInput.addEventListener('change', () => {
    const file = fotoFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      hiddenBase64.value = e.target.result;
      preview.src       = e.target.result;
    };
    reader.readAsDataURL(file);
  });
});
