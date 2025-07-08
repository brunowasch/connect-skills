const vagaModel = require('../models/vagaModel');

exports.salvarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');

    const {
      cargo,
      tipo,
      escala,
      diasPresenciais,
      diasHomeOffice,
      salario,
      moeda,
      descricao,
      areasSelecionadas,
      habilidadesSelecionadas
    } = req.body;

    const empresa_id = req.session.empresa.id;

    const areas_ids = JSON.parse(areasSelecionadas);
    const soft_skills_ids = JSON.parse(habilidadesSelecionadas);

    await vagaModel.criarVaga({
      empresa_id,
      cargo,
      tipo_local_trabalho: tipo,
      escala_trabalho: escala,
      dias_presenciais: diasPresenciais ? parseInt(diasPresenciais, 10) : null,
      dias_home_office: diasHomeOffice ? parseInt(diasHomeOffice, 10) : null,
      salario,
      moeda,
      descricao,
      areas_ids,
      soft_skills_ids
    });

    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('Erro ao salvar vaga:', err);
    res.status(500).send('Erro ao salvar vaga.');
  }
};
