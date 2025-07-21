exports.ensureEmpresa = (req, res, next) => {
  if (!req.session.empresa) {
    return res.redirect('/login');
  }
  next();
};

exports.ensureCandidato = (req, res, next) => {
  if (!req.session.candidato) {     
    return res.redirect('/login');
  }
  next();
};
