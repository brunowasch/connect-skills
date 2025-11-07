function wantsJSON(req) {
  const accept = req.get && req.get('accept') ? req.get('accept').toLowerCase() : '';
  return Boolean(req.xhr || (accept && accept.toLowerCase().includes('json')));
}

function ensureEmpresa(req, res, next) {
  if (!req.session?.empresa) {
    if (wantsJSON(req)) {
      return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Empresa.' });
    }
    return res.redirect('/login');
  }
  next();
}

function ensureCandidato(req, res, next) {
  if (!req.session?.candidato) {
    if (wantsJSON(req)) {
      return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Candidato.' });
    }
    return res.redirect('/login');
  }
  next();
}

function ensureUsuarioCandidato(req, res, next) {
  if (req.session?.usuario?.tipo === 'candidato') return next();
  if (wantsJSON(req)) {
    return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Candidato.' });
  }
  return res.redirect('/login');
}

function ensureUsuarioEmpresa(req, res, next) {
  if (req.session?.usuario?.tipo === 'empresa') return next();
  if (wantsJSON(req)) return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Empresa.' });
  return res.redirect('/login');
}

module.exports = { ensureEmpresa, ensureCandidato, ensureUsuarioEmpresa, ensureUsuarioCandidato, };
