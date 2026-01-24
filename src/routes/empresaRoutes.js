const express = require('express');
const router = express.Router();

const empresaController = require('../controllers/empresaController');
const uploadEmpresa = require('../config/multerEmpresa')
const { uploadVaga } = require('../middlewares/uploadVaga');
const vagaArquivoController = require('../controllers/vagaArquivoController');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const withEncodedParam = require('../middlewares/withEncodedParam');
const candidatoController = require('../controllers/candidatoController');
const empresaArquivoController = require('../controllers/empresaArquivoController');
const vagaController = require('../controllers/vagaController');

let ensureEmpresa = null;
let ensureUsuarioEmpresa = null;

try {
  const auth = require('../middlewares/auth');

  ensureEmpresa = (auth && typeof auth.ensureEmpresa === 'function')
    ? auth.ensureEmpresa
    : (req, res, next) => next();

  ensureUsuarioEmpresa = (auth && typeof auth.ensureUsuarioEmpresa === 'function')
    ? auth.ensureUsuarioEmpresa
    : (req, res, next) => next();

} catch {
  ensureEmpresa = (req, res, next) => next();
  ensureUsuarioEmpresa = (req, res, next) => next();
}

const remember = (req, _res, next) => {
  if (req.method === 'GET') {
    req.session.lastEmpresaPage = req.originalUrl;
  }
  next();
};

router.get('/perfil/:id', (req, res, next) => {
  console.log("ROTA ATINGIDA: /perfil/" + req.params.id);
  next();
}, empresaController.perfilPublico);

router.get('/complementar', ensureUsuarioEmpresa, empresaController.telaComplementarGoogle);
router.post('/complementar', ensureUsuarioEmpresa, empresaController.salvarComplementarGoogle);
router.get('/nome-empresa', ensureEmpresa, empresaController.telaNomeEmpresa);
router.post('/nome-empresa', ensureEmpresa, empresaController.salvarNomeEmpresa);
router.get('/localizacao', ensureEmpresa, empresaController.telaLocalizacao);
router.post('/localizacao', ensureEmpresa, empresaController.salvarLocalizacao);
router.get('/telefone', ensureEmpresa, empresaController.telaTelefone);
router.post('/telefone', ensureEmpresa, empresaController.salvarTelefone);
router.get('/foto-perfil', ensureEmpresa, empresaController.telaFotoPerfil);
router.post('/foto-perfil', ensureEmpresa, uploadEmpresa.single('novaFoto'), empresaController.salvarFotoPerfil);


router.get('/home', remember, ensureEmpresa, empresaController.homeEmpresa);
router.get('/meu-perfil', ensureEmpresa, remember, empresaController.telaPerfilEmpresa);
router.get('/editar-empresa', ensureEmpresa, empresaController.telaEditarPerfil);
router.post('/editar-empresa', ensureEmpresa, uploadEmpresa.single('novaFoto'), empresaController.salvarEdicaoPerfil);

router.get('/publicar-vaga', ensureEmpresa, empresaController.telaPublicarVaga);
router.post('/publicar-vaga', ensureEmpresa, uploadVaga.array('anexosVaga'), empresaController.salvarVaga);

router.get('/public/vaga/anexos/:id/abrir', vagaArquivoController.abrirAnexoPublico);
router.get('/public/vaga/:id', withEncodedParam('id'), candidatoController.vagaDetalhes);

router.get('/anexos/:id/abrir', ensureEmpresa, empresaArquivoController.abrirAnexo);
router.get('/anexos/:id/deletar', ensureEmpresa, empresaArquivoController.deletarAnexo);
router.post('/upload-anexos', ensureEmpresa, uploadEmpresa.array('anexos'), empresaArquivoController.uploadAnexos);
router.get('/public/anexos/:id/abrir', empresaArquivoController.abrirAnexo);

router.get('/vagas', ensureEmpresa, remember, empresaController.mostrarVagas);

router.get('/vaga/:id', ensureEmpresa, empresaController.telaVagaDetalhe);
router.get('/vaga/:id/editar', ensureEmpresa, empresaController.telaEditarVaga);
router.post('/vaga/:id/editar', ensureEmpresa, uploadVaga.array('anexosVaga'), empresaController.salvarEditarVaga);

router.post('/vaga/:id/fechar', ensureEmpresa, empresaController.fecharVaga);
router.post('/vaga/:id/reabrir', ensureEmpresa, empresaController.reabrirVaga);
router.post('/vaga/:id/excluir', ensureEmpresa, empresaController.excluirVaga);

router.get('/detalhes-da-vaga', ensureEmpresa, (req, res) =>
  res.render('empresas/detalhes-da-vaga')
);
router.get('/candidatos-encontrados', ensureEmpresa, (req, res) =>
  res.render('empresas/candidatos-encontrados')
);

router.get('/ranking-candidatos/:vagaId', ensureEmpresa, empresaController.rankingCandidatos);

router.post('/excluir-conta', ensureEmpresa, empresaController.excluirConta);

router.get('/editar-vaga/:id', ensureEmpresa, (req, res) =>
   res.redirect(301, `/empresas/vaga/${req.params.id}/editar`)
);
router.post('/editar-vaga/:id', ensureEmpresa, (req, res) =>
   res.redirect(307, `/empresas/vaga/${req.params.id}/editar`)
);
//router.get('/empresa/vaga/:id/editar', ensureEmpresa, (req, res) =>
//   res.redirect(301, `/empresas/vaga/${req.params.id}/editar`)
//);
//router.post('/empresa/vaga/:id/editar', ensureEmpresa, (req, res) =>
//   res.redirect(307, `/empresas/vaga/${req.params.id}/editar`)
//);
router.post('/excluir-vaga/:id', ensureEmpresa, (req, res) =>
   res.redirect(307, `/empresas/vaga/${req.params.id}/excluir`)
);

router.get('/pular-cadastro', empresaController.pularCadastroEmpresa);

router.post('/vaga/links/:id/delete', ensureEmpresa, withEncodedParam('id'), async (req, res) => {
  try {
    const empresaId = req.session.empresa.id; // 1. ID seguro da sessão
    const linkId = Number(req.params.id); // 2. ID do link (decodificado pelo middleware)

    // 3. Verifica se o link existe E pertence a uma vaga desta empresa
    const lk = await prisma.vaga_link.findFirst({
      where: { 
          id: linkId,
          vaga: { empresa_id: empresaId }
      },
      select: { vaga_id: true }
    });

    // 4. Se não encontrou (ou não pertence à empresa), bloqueia.
    if (!lk) {
      req.session.erro = 'Link não encontrado ou acesso negado.';
      return res.redirect('/empresas/meu-perfil');
    }

    // 5. Agora é seguro deletar
    await prisma.vaga_link.delete({ where: { id: linkId } });
    return res.redirect(`/empresas/vaga/${lk.vaga_id}/editar`);

  } catch (e) {
    console.error('Erro ao excluir link da vaga:', e);
    req.session.erro = 'Erro ao excluir link.';
    return res.redirect('/empresas/meu-perfil');
  }
});


router.post('/vaga/anexos/:id/delete', ensureEmpresa,  withEncodedParam('id'), async (req, res) => {
  try {
    const empresaId = req.session.empresa.id; // 1. ID seguro da sessão
    const anexoId = Number(req.params.id); // 2. ID do anexo (decodificado pelo middleware)

    // 3. Verifica se o anexo existe E pertence a uma vaga desta empresa
    const ax = await prisma.vaga_arquivo.findFirst({
      where: { 
          id: anexoId,
          vaga: { empresa_id: empresaId }
      },
      select: { vaga_id: true }
    });
    
    // 4. Se não encontrou (ou não pertence à empresa), bloqueia.
    if (!ax) {
      req.session.erro = 'Anexo não encontrado ou acesso negado.';
      return res.redirect('/empresas/meu-perfil');
    }

    // 5. Agora é seguro deletar
    await prisma.vaga_arquivo.delete({ where: { id: anexoId } });
    return res.redirect(`/empresas/vaga/${ax.vaga_id}/editar`);

  } catch (e) {
    console.error('Erro ao excluir anexo da vaga:', e);
    req.session.erro = 'Erro ao excluir anexo.';
    return res.redirect('/empresas/meu-perfil');
  }
});

router.post(
  '/vaga/feedback-geral', 
  ensureEmpresa,           
  vagaController.salvarFeedbackCandidato
);

router.post('/vaga/gerar-ia', ensureEmpresa, empresaController.gerarDescricaoIA);

module.exports = router;