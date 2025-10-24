const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('./cloudinary'); // ✅ pegue a instância

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'connect-skills/empresas',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'faces' }],
    public_id: (req, file) => `empresa_${req.session?.empresa?.id || 'anon'}_foto_perfil`,
    overwrite: true,
    resource_type: 'image'
  }
});

const uploadEmpresa = multer({ storage });
module.exports = uploadEmpresa;