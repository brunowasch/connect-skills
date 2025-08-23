module.exports = (req, res, next) => {
  // Se a sessão ainda não foi criada, segue o fluxo sem tentar acessar
  if (!req.session) return next();

  res.locals.sucesso = req.session.sucesso || null;
  res.locals.erro = req.session.erro || null;

  delete req.session.sucesso;
  delete req.session.erro;

  next();
};
