const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');

router.post('/cadastrar', usuarioController.criarUsuario);
router.post('/login', usuarioController.login);
router.get('/verificar-email', usuarioController.verificarEmail);
router.get('/aguardando-verificacao', usuarioController.telaAguardandoVerificacao);
router.get('/status-verificacao', usuarioController.statusVerificacao);
router.get('/email-verificado', usuarioController.telaEmailVerificado);
router.post('/reenviar-email', usuarioController.reenviarEmail);
module.exports = router;