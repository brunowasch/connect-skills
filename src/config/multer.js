const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary'); // config do Cloudinary separado

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'connect-skills/candidatos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 300, height: 300, crop: 'fill' }]
  },
});

const upload = multer({ storage });

module.exports = upload;
