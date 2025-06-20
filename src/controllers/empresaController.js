const fs = require('fs');
const path = require('path');
const empresaModel = require('../models/empresaModel');

exports.telaCadastro = (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica');
};

exports.cadastrarEmpresa = (req, res) => {
  const { email, senha } = req.body;

  // Simulação: salvando dados iniciais na sessão
  req.session.empresa = { email, senha };

  res.redirect('/empresa/nome-empresa');
};

// Tela e salvamento do nome e descrição
exports.telaNomeEmpresa = (req, res) => {
  const { usuario_id } = req.query;

  if (!usuario_id) {
    return res.status(400).send("ID do usuário não foi informado.");
  }

  res.render('empresas/nome-empresa', { usuario_id });
};


exports.salvarNomeEmpresa = (req, res) => {
  const { usuario_id, nome_empresa, descricao } = req.body;

  if (!usuario_id || !nome_empresa || !descricao) {
    return res.status(400).send("Todos os campos são obrigatórios.");
  }

  const dados = {
    usuario_id,
    nome_empresa,
    descricao
  };

  empresaModel.inserirNomeDescricao(dados, (err, result) => {
    if (err) {
      console.error("Erro ao inserir empresa:", err);
      return res.status(500).send("Erro ao salvar os dados da empresa.");
    }

    // Redireciona para a próxima etapa com o ID preservado
    res.redirect(`/empresa/localizacao?usuario_id=${usuario_id}`);
  });
};


// Tela e salvamento da localização
// Tela de localização (GET)
exports.telaLocalizacao = (req, res) => {
  const { usuario_id } = req.query;

  if (!usuario_id) {
    return res.status(400).send("ID do usuário não informado.");
  }

  res.render('empresas/localizacao-login-juridica', { usuario_id });
};


// Salvar localização (POST)
exports.salvarLocalizacao = (req, res) => {
  const { usuario_id, localidade } = req.body;

  if (!usuario_id || !localidade) {
    return res.status(400).send('Informe sua localidade para continuar.');
  }

  // Quebra a string em partes: cidade, estado, país
  const partes = localidade.split(',').map(p => p.trim());

  if (partes.length < 3) {
    return res.status(400).send('Formato de localidade inválido. Use: Cidade, Estado, País.');
  }

  const [cidade, estado, pais] = partes;

  empresaModel.atualizarLocalizacao({ usuario_id, pais, estado, cidade }, (err) => {
    if (err) {
      console.error('Erro ao salvar localização:', err);
      return res.status(500).send('Erro ao salvar localização.');
    }

    res.redirect(`/empresa/telefone?usuario_id=${usuario_id}`);
  });
};

// Tela e salvamento do telefone
exports.telaTelefone = (req, res) => {
  const { usuario_id } = req.query;

  if (!usuario_id) {
    return res.status(400).send("ID do usuário não informado.");
  }

  res.render('empresas/telefone-empresa', { usuario_id });
};



exports.salvarTelefone = (req, res) => {

  const { usuario_id, ddi, ddd, telefone } = req.body;

  if (!usuario_id || !ddi || !ddd || !telefone) {
    return res.status(400).send("Preencha todos os campos de telefone.");
  }

  const telefoneCompleto = `${ddi} (${ddd}) ${telefone}`;

  empresaModel.atualizarTelefone({ usuario_id, telefone: telefoneCompleto }, (err) => {
    if (err) {
      console.error("Erro ao salvar telefone:", err);
      return res.status(500).send("Erro ao salvar telefone.");
    }

    res.redirect(`/empresa/foto-perfil?usuario_id=${usuario_id}`);
  });
};




// Tela da foto (logo da empresa)

exports.telaFotoPerfil = (req, res) => {
  const { usuario_id } = req.query;

  if (!usuario_id) {
    return res.status(400).send("ID do usuário não informado.");
  }

  res.render('empresas/foto-perfil-empresa', { usuario_id });
};

// Salva imagem como base64 ou arquivo na sessão
exports.salvarFotoPerfil = (req, res) => {
  const { usuario_id, fotoBase64 } = req.body;

  if (!usuario_id) {
    return res.status(400).send('ID do usuário não fornecido.');
  }

  let caminhoFoto = '';

  if (req.file) {
    // Upload tradicional
    caminhoFoto = `/uploads/${req.file.filename}`;
  } else if (fotoBase64 && fotoBase64.startsWith('data:image')) {
    // Foto tirada da câmera (base64)
    const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const nomeArquivo = `${Date.now()}-camera.png`;

    // Caminho correto: connect-skills/public/uploads
    const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const caminho = path.join(uploadDir, nomeArquivo);
    fs.writeFileSync(caminho, buffer);
    caminhoFoto = `/uploads/${nomeArquivo}`;
  } else {
    return res.status(400).send("Nenhuma imagem recebida.");
  }

  // Atualiza o caminho da imagem no banco de dados
  empresaModel.atualizarFotoPerfil({ usuario_id, foto_perfil: caminhoFoto }, (err) => {
    if (err) {
      console.error("Erro ao salvar foto no banco:", err);
      return res.status(500).send("Erro ao salvar foto.");
    }

    // Recarrega empresa completa na sessão
    empresaModel.buscarPorUsuarioId(usuario_id, (err, empresa) => {
      if (err || !empresa) {
        return res.redirect('/login');
      }

      req.session.empresa = empresa;
      res.redirect('/empresa/home');
    });
  });
};



// Página inicial da empresa (dashboard)
exports.homeEmpresa = (req, res) => {
  res.render('empresas/home-empresas');
};

// Tela do perfil da empresa
exports.telaPerfilEmpresa = (req, res) => {
  const empresa = req.session.empresa;
  const vagasDaEmpresa = (global.vagasPublicadas || []).filter(vaga =>
    vaga.empresa.nome === req.session.empresa.nome
  );
  if (!empresa) {
    return res.redirect('/login');
  }

  res.render('empresas/meu-perfil', {
    empresa,
    vagasPublicadas: vagasDaEmpresa
  });
};

// Publicação da Vaga
exports.telaPublicarVaga = (req, res) => {
  res.render('empresas/publicar-vaga');
};

exports.salvarVaga = (req, res) => {
  console.log('========== RECEBENDO POST DE PUBLICAÇÃO ==========');
  console.log('req.body:', req.body);

  const { cargo, tipo, descricao, areasSelecionadas, habilidadesSelecionadas } = req.body;

  // Garante que exista a empresa na sessão
  if (!req.session.empresa) {
    return res.redirect('/login');
  }



  // Cria uma nova vaga e adiciona ao array da sessão
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

  if (!empresa) {
    return res.redirect('/login');
  }

  res.render('empresas/meu-perfil', {
    nomeFantasia: empresa.nomeFantasia,
    area: empresa.area,
    localidade: empresa.localidade,
    telefone: empresa.telefone,
    fotoPerfil: empresa.fotoPerfil,
    vagasPublicadas: req.session.vagasPublicadas || [] 
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

  // Atualiza os dados da sessão
  Object.assign(req.session.empresa, {
    nome,
    descricao,
    telefone,
    localidade
  });

     if (fotoBase64 && fotoBase64.startsWith('data:image')) {
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
  const vagas = (global.vagasPublicadas || []).filter(vaga =>
    vaga.empresa.nome === empresa.nome
  );

  res.render('empresas/vagas', { vagas });
};

