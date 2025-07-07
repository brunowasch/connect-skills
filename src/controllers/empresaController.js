// controllers/empresaController.js
const fs = require('fs');
const path = require('path');
const empresaModel = require('../models/empresaModel');

exports.telaCadastro = (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica');
};

exports.cadastrarEmpresa = (req, res) => {
  const { email, senha } = req.body;
  req.session.empresa = { email, senha };
  res.redirect('/empresa/nome-empresa');
};

exports.telaNomeEmpresa = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) return res.status(400).send("ID do usuário não foi informado.");
  res.render('empresas/nome-empresa', { usuario_id });
};

exports.salvarNomeEmpresa = async (req, res) => {
  try {
    let { usuario_id, nome_empresa, descricao } = req.body;

    if (!usuario_id || !nome_empresa || !descricao) {
      return res.status(400).send("Todos os campos são obrigatórios.");
    }

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) {
      return res.status(400).send("ID do usuário inválido.");
    }

    const empresaExistente = await empresaModel.obterEmpresaPorUsuarioId(usuario_id);
    if (empresaExistente) {
      return res.status(400).send("Empresa já cadastrada para esse usuário.");
    }

    await empresaModel.criarEmpresa({ usuario_id, nome_empresa, descricao });
    res.redirect(`/empresa/localizacao?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error("Erro ao inserir empresa:", err);
    res.status(500).send("Erro ao salvar os dados da empresa.");
  }
};

exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) return res.status(400).send("ID do usuário não informado.");
  res.render('empresas/localizacao-login-juridica', { usuario_id });
};

exports.salvarLocalizacao = async (req, res) => {
  try {
    let { usuario_id, localidade } = req.body;

    if (!usuario_id || !localidade) return res.status(400).send('Informe sua localidade.');
    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) return res.status(400).send('ID do usuário inválido.');

    const partes = localidade.split(',').map(p => p.trim());
    if (partes.length < 3) return res.status(400).send('Formato inválido. Use: Cidade, Estado, País.');

    const [cidade, estado, pais] = partes;
    await empresaModel.atualizarLocalizacao({ usuario_id, pais, estado, cidade });
    res.redirect(`/empresa/telefone?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error('Erro ao salvar localização:', err);
    res.status(500).send('Erro ao salvar localização.');
  }
};

exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) return res.status(400).send("ID do usuário não informado.");
  res.render('empresas/telefone-empresa', { usuario_id });
};

exports.salvarTelefone = async (req, res) => {
  try {
    let { usuario_id, ddi, ddd, telefone } = req.body;

    if (!usuario_id || !ddi || !ddd || !telefone)
      return res.status(400).send("Preencha todos os campos de telefone.");

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) return res.status(400).send("ID do usuário inválido.");

    const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;
    await empresaModel.atualizarTelefone({ usuario_id, telefone: telefoneCompleto });

    res.redirect(`/empresa/foto-perfil?usuario_id=${usuario_id}`);
  } catch (err) {
    console.error("Erro ao salvar telefone:", err);
    res.status(500).send("Erro ao salvar telefone.");
  }
};

exports.telaFotoPerfil = (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) return res.status(400).send("ID do usuário não informado.");
  res.render('empresas/foto-perfil-empresa', { usuario_id });
};

exports.salvarFotoPerfil = async (req, res) => {
  try {
    let { usuario_id, fotoBase64 } = req.body;
    if (!usuario_id) return res.status(400).send('ID do usuário não fornecido.');

    usuario_id = parseInt(usuario_id, 10);
    if (isNaN(usuario_id)) return res.status(400).send('ID do usuário inválido.');

    let caminhoFoto = '';
    if (req.file) {
      caminhoFoto = `/uploads/${req.file.filename}`;
    } else if (fotoBase64?.startsWith('data:image')) {
      const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const nomeArquivo = `${Date.now()}-camera.png`;
      const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, nomeArquivo), buffer);
      caminhoFoto = `/uploads/${nomeArquivo}`;
    } else {
      return res.status(400).send("Nenhuma imagem recebida.");
    }

    await empresaModel.atualizarFotoPerfil({ usuario_id, foto_perfil: caminhoFoto });
    const empresa = await empresaModel.obterEmpresaPorUsuarioId(usuario_id);
    if (!empresa) return res.redirect('/login');
    req.session.empresa = empresa;
    res.redirect('/empresa/home');
  } catch (err) {
    console.error("Erro ao salvar foto:", err);
    res.status(500).send("Erro ao salvar foto.");
  }
};

exports.homeEmpresa = (req, res) => {
  res.render('empresas/home-empresas');
};

exports.telaPerfilEmpresa = (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');
  const vagasDaEmpresa = (global.vagasPublicadas || []).filter(vaga => vaga.empresa.nome === empresa.nome);
  res.render('empresas/meu-perfil', { empresa, vagasPublicadas: vagasDaEmpresa });
};

exports.telaPublicarVaga = (req, res) => {
  res.render('empresas/publicar-vaga');
};

exports.salvarVaga = (req, res) => {
  const { cargo, tipo, descricao, areasSelecionadas, habilidadesSelecionadas } = req.body;
  if (!req.session.empresa) return res.redirect('/login');

  const novaVaga = {
    id: Date.now(),
    empresa: {
      nome: req.session.empresa.nome,
      logo: req.session.empresa.fotoPerfil || '/img/logo-default.png'
    },
    cargo,
    tipo,
    descricao,
    areas: areasSelecionadas.split(','),
    habilidades: habilidadesSelecionadas.split(','),
    data: new Date().toLocaleString('pt-BR')
  };

  global.vagasPublicadas = global.vagasPublicadas || [];
  global.vagasPublicadas.push(novaVaga);
  res.redirect('/empresa/meu-perfil');
};

exports.mostrarPerfil = (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');
  res.render('empresas/meu-perfil', {
    empresa,
    nome: empresa.nome_empresa,
    vagasPublicadas: global.vagasPublicadas || [],
    activePage: 'perfil'
  });
};

exports.telaEditarPerfil = (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');
  res.render('empresas/editar-empresa', {
    nome: empresa.nome,
    descricao: empresa.descricao,
    telefone: empresa.telefone,
    localidade: empresa.localidade,
    fotoPerfil: empresa.fotoPerfil
  });
};

exports.salvarEdicaoPerfil = (req, res) => {
  const { nome, descricao, telefone, localidade, fotoBase64 } = req.body;
  Object.assign(req.session.empresa, { nome, descricao, telefone, localidade });

  if (fotoBase64?.startsWith('data:image')) {
    const matches = fotoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    const ext = matches[1];
    const data = matches[2];
    const filename = Date.now() + '-camera.' + ext;
    const filepath = path.join(__dirname, '../../public/uploads', filename);
    fs.writeFileSync(filepath, data, 'base64');
    req.session.empresa.fotoPerfil = '/uploads/' + filename;
  }

  if (req.file) {
    req.session.empresa.fotoPerfil = '/uploads/' + req.file.filename;
  }

  res.redirect('/empresa/meu-perfil');
};

exports.mostrarVagas = (req, res) => {
  const empresa = req.session.empresa;
  if (!empresa) return res.redirect('/login');
  const vagas = (global.vagasPublicadas || []).filter(v => v.empresa.nome === empresa.nome);
  res.render('empresas/vagas', { vagas });
};
