const express = require('express');
const router = express.Router();

router.get('/candidato/nome', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/candidatos/cadastro/nome${qs}`);
});

router.get('/candidato/localizacao', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/candidatos/localizacao${qs}`);
});

router.get('/candidato/telefone', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/candidatos/cadastro/telefone${qs}`);
});

router.get('/candidato/cadastro/foto-perfil', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/candidatos/cadastro/foto-perfil${qs}`);
});

router.get('/candidato/cadastro/areas', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/candidatos/cadastro/areas${qs}`);
});

// EMPRESA
router.get('/empresa/nome-empresa', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/empresas/cadastro/nome-empresa${qs}`);
});

router.get('/empresa/localizacao', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/empresas/cadastro/localizacao${qs}`);
});

router.get('/empresa/telefone', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/empresas/cadastro/telefone${qs}`);
});

router.get('/empresas/foto-perfil', (req, res) => { // Rota está no plural
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/empresa/foto-perfil${qs}`);
});

module.exports = router;
