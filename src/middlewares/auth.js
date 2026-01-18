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
  // 1. Verifica se o usuário está logado e se é do tipo candidato
  if (!req.session?.usuario || req.session.usuario.tipo !== 'candidato') {
    if (wantsJSON(req)) {
      return res.status(401).json({ ok: false, error: 'Sessão expirada ou acesso negado.' });
    }
    req.session.returnTo = req.originalUrl; 
    return res.redirect('/login');
  }

  // 2. EXCEÇÃO DE OURO: Se a URL contém 'etapa-video', permite o acesso
  // mesmo que o objeto 'candidato' na sessão ainda não esteja totalmente populado.
  if (req.originalUrl.includes('etapa-video')) {
    console.log(`[AUTH] Permitindo acesso direto à etapa de vídeo: ${req.originalUrl}`);
    return next();
  }

  // 3. Verificação padrão para as demais rotas (Home, Vagas, etc)
  // Exige que o perfil do candidato já tenha sido criado/identificado
  if (!req.session?.candidato || !req.session.candidato.id) {
    console.log("[AUTH] Candidato sem perfil completo acessando rota restrita. Redirecionando...");
    return res.redirect('/candidatos/cadastro/nome');
  }

  return next();
}

// Função auxiliar (caso não tenha aí)
function wantsJSON(req) {
  return req.xhr || (req.headers.accept && req.headers.accept.includes('json'));
}

function ensureUsuarioCandidato(req, res, next) {
  if (req.session?.usuario?.tipo === 'candidato') return next();
  if (wantsJSON(req)) {
    return res.status(401).json({ ok: false, error: 'Acesso negado.' });
  }

  req.session.returnTo = req.originalUrl; 
  res.redirect('/login');
}

function ensureUsuarioEmpresa(req, res, next) {
  if (req.session?.usuario?.tipo === 'empresa') return next();
  if (wantsJSON(req)) return res.status(401).json({ ok: false, error: 'Acesso negado. Faça login como Empresa.' });
  return res.redirect('/login');
}

module.exports = { ensureEmpresa, ensureCandidato, ensureUsuarioEmpresa, ensureUsuarioCandidato, };
