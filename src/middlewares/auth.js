function ensureEmpresa(req, res, next) {
  if (!req.session.usuario || req.session.usuario.tipo !== 'empresa') {
    return res.redirect('/login');
  }
  next();
}

function ensureCandidato(req, res, next) {
  if (!req.session.usuario || req.session.usuario.tipo !== 'candidato') {
    return res.redirect('/login');
  }
  next();
}

module.exports = { ensureEmpresa, ensureCandidato };
