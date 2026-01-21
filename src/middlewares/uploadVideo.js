const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary'); 

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
  limits: { fileSize: 50 * 1024 * 1024 }
});

module.exports = { uploadVideo };