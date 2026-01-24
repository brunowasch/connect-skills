module.exports = (req, res, next) => {
    const rotasIgnoradas = ['/_leave', '/usuarios/_leave', '/api/'];

    if (rotasIgnoradas.some(rota => req.url.includes(rota))) {
        // Se for uma rota de "saída" ou API, apenas passa adiante sem tocar no flash
        return next();
    }

    // Lógica normal do seu flash
    res.locals.sucesso = req.session.sucesso || null;
    res.locals.erro = req.session.erro || null;

    // Limpa apenas se não for uma rota ignorada
    delete req.session.sucesso;
    delete req.session.erro;

    next();
};