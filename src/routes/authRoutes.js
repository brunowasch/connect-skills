const express = require('express');
const router = express.Router();

router.get('/cadastro', (req, res) => {
  res.render('auth/cadastro', { title: 'Cadastro - Connect Skills' });
});

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login - Connect Skills' });
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: {
        candidato: true,
        empresa: true
      }
    });

    if (!usuario) {
      return res.render('auth/login', { title: 'Login - Connect Skills', erro: 'Usuário não encontrado.' });
    }

    const senhaCorreta = usuario.senha === senha; // Use bcrypt em produção
    if (!senhaCorreta) {
      return res.render('auth/login', { title: 'Login - Connect Skills', erro: 'Senha incorreta.' });
    }

    // Define tipo com base em relacionamento
    const tipo = usuario.candidato ? 'candidato' : 'empresa';

    // Salva na sessão
    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      tipo
    };

    // Redireciona com base no tipo
    if (tipo === 'candidato') {
      return res.redirect('/candidatos/home');
    } else {
      return res.redirect('/empresa/home');
    }

  } catch (error) {
    console.error('Erro no login:', error);
    res.render('auth/login', { title: 'Login - Connect Skills', erro: 'Erro interno no servidor.' });
  }
});


module.exports = router;