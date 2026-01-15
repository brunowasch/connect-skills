const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Certifique-se que o Cloudinary já está configurado no app.js ou num arquivo de config
// Se precisar configurar aqui de novo:
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'videos-vagas', 
    resource_type: 'video',      
    allowed_formats: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  },
});

const uploadVideo = multer({ 
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

module.exports = { uploadVideo };