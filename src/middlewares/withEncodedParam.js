const { encodeId, decodeId } = require('../utils/idEncoder');

module.exports = function withEncodedParam(paramName = 'id') {
  return (req, res, next) => {
    const raw = String(req.params[paramName] || '');
    const decoded = decodeId(raw);

    // Já veio codificado corretamente
    if (Number.isFinite(decoded)) {
      req.params[paramName] = String(decoded);
      return next();
    }

    // Veio numérico “cru”: redireciona 301 p/ versão codificada
    if (/^\d+$/.test(raw)) {
      const enc = encodeId(Number(raw));
      const canonical = req.originalUrl.replace(raw, enc);
      return res.redirect(301, canonical);
    }

    // Valor inválido
    return res.status(404).send('Recurso não encontrado');
  };
};
