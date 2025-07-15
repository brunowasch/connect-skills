// middlewares/upload.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

function createStorage(folder) {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `connect-skills/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png'],
      transformation: [{ width: 300, height: 300, crop: 'fill' }]
    }
  });
}

const uploadCandidato = multer({ storage: createStorage('candidatos') });
const uploadEmpresa   = multer({ storage: createStorage('empresas') });

module.exports = { uploadCandidato, uploadEmpresa };
