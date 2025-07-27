const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const express = require('express');
const router = express.Router();
const candidatoController = require('../controllers/candidatoController');
const uploadCandidato = require('../middlewares/upload');
const { ensureCandidato } = require('../middlewares/auth');

// Fluxo de cadastro
router.get('/cadastro/nome', candidatoController.telaNomeCandidato);
router.post('/cadastro/nome', candidatoController.salvarNomeCandidato);

router.get('/cadastro/google/complementar', async (req, res) => {
  const usuario = req.session.usuario;

  if (!usuario || usuario.tipo !== 'candidato') {
    return res.redirect('/login');
  }

  res.render('candidatos/cadastro-complementar-google', { erro: null });
});

router.post('/cadastro/google/complementar', async (req, res) => {
  try {
    if (!req.session.usuario || req.session.usuario.tipo !== 'candidato') {
      return res.redirect('/login');
    }

    const { data_nascimento, localidade, ddi, ddd, numero, areas } = req.body;
    const usuario_id = req.session.usuario.id;

    const telefone = `${ddi || ''}-${ddd || ''}-${numero || ''}`;
    const dataNascimentoConvertida = new Date(data_nascimento);

    const areasArray = Array.isArray(areas)
      ? areas.map(areaId => ({ area_interesse_id: Number(areaId) }))
      : areas
      ? [{ area_interesse_id: Number(areas) }]
      : [];

    await prisma.candidato.update({
      where: { usuario_id },
      data: {
        data_nascimento: dataNascimentoConvertida,
        localidade,
        telefone,
        candidato_area: {
          create: areasArray
        }
      }
    });

    const candidato = await prisma.candidato.findUnique({
        where: { usuario_id },
    });

    req.session.usuario = {
    ...req.session.usuario,
    nome: candidato.nome,
    sobrenome: candidato.sobrenome,
    tipo: 'candidato'
    };

req.session.candidato = candidato;

req.session.save(() => {
  res.redirect('/candidatos/home');
});

  } catch (error) {
    console.error('Erro ao salvar dados complementares:', error);
    res.render('candidatos/cadastro-complementar-google', {
      title: 'Cadastro complementar',
      erro: 'Erro ao salvar as informações. Tente novamente.'
    });
  }
});


// Outras etapas do cadastro padrão
router.get('/localizacao', candidatoController.telaLocalizacao);
router.post('/localizacao', candidatoController.salvarLocalizacao);

router.get('/telefone', candidatoController.telaTelefone);
router.post('/telefone', candidatoController.salvarTelefone);

router.get('/cadastro/foto-perfil', candidatoController.telaFotoPerfil);
router.post('/cadastro/foto-perfil', uploadCandidato.single('novaFoto'), candidatoController.salvarFotoPerfil);

router.get('/cadastro/areas', candidatoController.telaSelecionarAreas);
router.post('/cadastro/areas', candidatoController.salvarAreas);

// Rotas autenticadas
router.get('/home', ensureCandidato, candidatoController.telaHomeCandidato);
router.get('/meu-perfil', ensureCandidato, candidatoController.renderMeuPerfil);
router.get('/vagas', ensureCandidato, candidatoController.mostrarVagas);

// Edição de perfil
router.get('/editar-perfil', ensureCandidato, candidatoController.telaEditarPerfil);
router.post('/editar-perfil', ensureCandidato, uploadCandidato.single('novaFoto'), candidatoController.salvarEditarPerfil);

router.get('/editar-areas', ensureCandidato, candidatoController.telaEditarAreas);
router.post('/editar-areas', candidatoController.salvarEditarAreas);

module.exports = router;
