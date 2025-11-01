// src/utils/idEncoder.js
const CryptoJS = require('crypto-js');

const SECRET = process.env.ID_SECRET || 'connectskills-id-secret';

function encodeId(id) {
  return CryptoJS.AES.encrypt(String(id), SECRET).toString()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeId(encoded) {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = CryptoJS.AES.decrypt(base64, SECRET);
    const original = bytes.toString(CryptoJS.enc.Utf8);
    const num = parseInt(original, 10);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

module.exports = { encodeId, decodeId };
