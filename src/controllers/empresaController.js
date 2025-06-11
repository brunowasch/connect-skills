const fs = require('fs');
const path = require('path');

exports.telaCadastro = (req, res) => {
  res.render('empresas/cadastro-pessoa-juridica');
};

exports.cadastrarEmpresa = (req, res) => {
  const { cnpj, email, senha } = req.body;

  // Simulação: salvando dados iniciais na sessão
  req.session.empresa = { cnpj, email, senha };

  res.redirect('/empresa/nome-empresa');
};

// Tela e salvamento do nome e descrição
exports.telaNomeEmpresa = (req, res) => {
  res.render('empresas/nome-empresa');
};

exports.salvarNomeEmpresa = (req, res) => {
  const { nome, descricao } = req.body;

  req.session.empresa = {
    ...req.session.empresa,
    nome,
    descricao
  };

  res.redirect('/empresa/localizacao');
};

// Tela e salvamento da localização
exports.telaLocalizacao = (req, res) => {
  res.render('empresas/localizacao-login-juridica');
};

exports.salvarLocalizacao = (req, res) => {
  const { localidade } = req.body;

  req.session.empresa = {
    ...req.session.empresa,
    localidade
  };

  res.redirect('/empresa/telefone');
};

// Tela e salvamento do telefone
exports.telaTelefone = (req, res) => {
  res.render('empresas/telefone-empresa');
};

exports.salvarTelefone = (req, res) => {
  const { ddd, telefone } = req.body;

  req.session.empresa = {
    ...req.session.empresa,
    ddd,
    telefone
  };

  res.redirect('/empresa/foto-perfil');
};

// Tela da foto (logo da empresa)
exports.telaFotoPerfil = (req, res) => {
  res.render('empresas/foto-perfil-empresa');
};

// Salva imagem como base64 na sessão
exports.salvarFotoPerfil = (req, res) => {
  if (req.body.fotoBase64) {
    req.session.empresa = {
      ...req.session.empresa,
      fotoPerfil: req.body.fotoBase64
    };
  } else if (req.file) {
    req.session.empresa = {
      ...req.session.empresa,
      fotoPerfil: `/uploads/${req.file.filename}` // ✅ caminho público
    };
  }

  res.redirect('/empresa/home');
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

