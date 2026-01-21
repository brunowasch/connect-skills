require('dotenv').config(); // Garante que lê o .env
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME, // Tenta os dois nomes comuns
  api_key:    process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET,
});

// Teste de log para ver se carregou (aparecerá no terminal)
if (!cloudinary.config().api_key) {
    console.error("ERRO CRÍTICO: Cloudinary API Key não encontrada! Verifique o .env");
} else {
    console.log("Cloudinary configurado com sucesso. Cloud Name:", cloudinary.config().cloud_name);
}

module.exports = cloudinary;