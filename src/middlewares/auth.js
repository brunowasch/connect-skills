function ensureEmpresa(req, res, next) {
  if (!req.session.empresa) {
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Empresa.' });
    }
    return res.redirect('/login');
  }
  next();
}

function ensureCandidato(req, res, next) {
  if (!req.session.candidato) {
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Candidato.' });
    }
    return res.redirect('/login');
  }
  next();
}

module.exports = { ensureEmpresa, ensureCandidato };