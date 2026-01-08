// src/utils/idEncoder.js
const CryptoJS = require('crypto-js');

// Certifique-se de que o .env tem ID_SECRET. Se não, ele usará o padrão abaixo.
const SECRET = process.env.ID_SECRET || 'connectskills-id-secret';

function encodeId(id) {
  if (!id) return null;
  return CryptoJS.AES.encrypt(String(id), SECRET).toString()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeId(encoded) {
  try {
    if (!encoded) return null;
    
    // Se o ID já for um UUID (não criptografado), retorna ele mesmo
    if (encoded.length === 36 && encoded.includes('-')) return encoded;

    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = CryptoJS.AES.decrypt(base64, SECRET);
    
    // O erro acontece aqui se a chave for diferente
    const original = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!original) return null;

    const num = Number(original);
    return !isNaN(num) && original.trim() !== "" ? num : original;
  } catch (error) {
    // Se der erro de UTF-8, retornamos null em vez de quebrar o servidor
    console.error("Erro ao decodificar ID (provavelmente chave incompatível):", error.message);
    return null;
  }
}

module.exports = { encodeId, decodeId };