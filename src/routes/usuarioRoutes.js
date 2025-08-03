const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');

// Cadastro e login
router.post('/cadastrar', usuarioController.criarUsuario);
router.post('/login', usuarioController.login);

// Verificação de e-mail
router.get('/verificar-email', usuarioController.verificarEmail);
router.get('/aguardando-verificacao', usuarioController.telaAguardandoVerificacao);
router.get('/status-verificacao', usuarioController.statusVerificacao);
router.get('/email-verificado', usuarioController.telaEmailVerificado);
router.post('/reenviar-email', usuarioController.reenviarEmail);

// Recuperação de senha
router.get('/recuperar-senha', usuarioController.telaRecuperarSenha);
router.post('/recuperar-senha', usuarioController.recuperarSenha);
router.get('/redefinir-senha', usuarioController.telaRedefinirSenha);
router.post('/redefinir-senha', usuarioController.redefinirSenha);
router.get('/redefinir-senha/:token', usuarioController.telaRedefinirSenha);

module.exports = router;
