const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: 'dxfg3pb5d',
  api_key: '127619153986259',
  api_secret: '3Ith4U_bQMu7G_0tlZ7J1INUpc8'
});



const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'storepulse_reports', // Nombre de la carpeta en Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }] // Optimiza tamaño
  },
});

const uploadCloud = multer({ storage: storage });

module.exports = uploadCloud;
