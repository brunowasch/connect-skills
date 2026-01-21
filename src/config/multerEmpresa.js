const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary'); 

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'empresas',
    allowed_formats: ['jpg', 'jpeg', 'png'],
  },
});

const uploadEmpresa = multer({ storage: storage });

module.exports = uploadEmpresa;