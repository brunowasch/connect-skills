// src/routes/empresaRoutes.js
const express = require('express');
const router = express.Router();

const empresaController = require('../controllers/empresaController');
const { uploadEmpresa } = require('../middlewares/uploadEmpresa');

// Tenta carregar ensureEmpresa; se não for função, usa no-op pra não quebrar em dev
let ensureEmpresa = null;
try {
  const maybe = require('../middlewares/auth');
  ensureEmpresa = (maybe && typeof maybe.ensureEmpresa === 'function')
    ? maybe.ensureEmpresa
    : (req, res, next) => next();
} catch {
  ensureEmpresa = (req, res, next) => next();
}

/* =========================
 * Fluxo de cadastro / edição de perfil
 * ========================= */
router.get('/cadastro', empresaController.telaCadastro);
router.post('/cadastro', empresaController.cadastrarEmpresa);

router.get('/complementar', ensureEmpresa, empresaController.telaComplementarGoogle);
router.post('/complementar', empresaController.salvarComplementarGoogle);

router.get('/nome-empresa', empresaController.telaNomeEmpresa);
router.post('/nome-empresa', empresaController.salvarNomeEmpresa);

router.get('/localizacao', empresaController.telaLocalizacao);
router.post('/localizacao', empresaController.salvarLocalizacao);

router.get('/telefone', empresaController.telaTelefone);
router.post('/telefone', empresaController.salvarTelefone);

router.get('/foto-perfil', empresaController.telaFotoPerfil);
router.post('/foto-perfil', uploadEmpresa.single('novaFoto'), empresaController.salvarFotoPerfil);

router.get('/home', empresaController.homeEmpresa);
router.get('/meu-perfil', ensureEmpresa, empresaController.telaPerfilEmpresa);

router.get('/editar-empresa', ensureEmpresa, empresaController.telaEditarPerfil);
router.post('/editar-empresa', ensureEmpresa, uploadEmpresa.single('novaFoto'), empresaController.salvarEdicaoPerfil);

/* =========================
 * Publicação de vaga
 * ========================= */
router.get('/publicar-vaga', ensureEmpresa, empresaController.telaPublicarVaga);
router.post('/publicar-vaga', ensureEmpresa, empresaController.salvarVaga);

/* =========================
 * Listagem e detalhe de vagas (empresa)
 * ========================= */
router.get('/vagas', ensureEmpresa, empresaController.mostrarVagas);
router.get('/vaga/:id', ensureEmpresa, empresaController.telaVagaDetalhe);

// Editar vaga
router.get('/vaga/:id/editar', ensureEmpresa, empresaController.telaEditarVaga);
router.post('/vaga/:id/editar', ensureEmpresa, empresaController.salvarEditarVaga);

// Ações de status/exclusão da vaga
router.post('/vaga/:id/fechar', ensureEmpresa, empresaController.fecharVaga);
router.post('/vaga/:id/reabrir', ensureEmpresa, empresaController.reabrirVaga);
router.post('/vaga/:id/excluir', ensureEmpresa, empresaController.excluirVaga);

/* =========================
 * Views auxiliares internas
 * ========================= */
router.get('/detalhes-da-vaga', ensureEmpresa, (req, res) =>
  res.render('empresas/detalhes-da-vaga')
);
router.get('/candidatos-encontrados', ensureEmpresa, (req, res) =>
  res.render('empresas/candidatos-encontrados')
);

/* =========================
 * Perfil público da empresa / Ranking
 * ========================= */
router.get('/perfil/:id', empresaController.perfilPublico);
router.get('/ranking-candidatos/:vagaId', ensureEmpresa, empresaController.rankingCandidatos);

/* =========================
 * Exclusão de conta (empresa)
 * ========================= */
router.post('/excluir-conta', ensureEmpresa, empresaController.excluirConta);

/* =========================
 * Rotas legadas (redirects para manter compatibilidade)
 * ========================= */
// /editar-vaga/:id  ->  /empresa/vaga/:id/editar
router.get('/editar-vaga/:id', (req, res) =>
  res.redirect(301, `/empresa/vaga/${req.params.id}/editar`)
);
router.post('/editar-vaga/:id', (req, res) =>
  res.redirect(307, `/empresa/vaga/${req.params.id}/editar`)
);

// /empresa/vaga/:id/editar -> /empresa/vaga/:id/editar (mantido)
router.get('/empresa/vaga/:id/editar', (req, res) =>
  res.redirect(301, `/empresa/vaga/${req.params.id}/editar`)
);
router.post('/empresa/vaga/:id/editar', (req, res) =>
  res.redirect(307, `/empresa/vaga/${req.params.id}/editar`)
);

// Exclusão legada
router.post('/excluir-vaga/:id', ensureEmpresa, (req, res) =>
  res.redirect(307, `/empresa/vaga/${req.params.id}/excluir`)
);

module.exports = router;
