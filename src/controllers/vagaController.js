const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const vagaModel = require('../models/vagaModel');
const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');
const { decodeId } = require('../utils/idEncoder');
const nodemailer = require('nodemailer');

const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

exports.salvarVaga = async (req, res) => {
  try {
    if (!req.session.empresa) return res.redirect('/login');
    // ... (lógica de salvar vaga) ...
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

    req.session.sucesso = 'Vaga publicada com sucesso!';
    return res.redirect('/empresa/meu-perfil');
  } catch (err) {
    console.error('Erro ao salvar vaga:', err);
    req.session.erro = 'Erro ao salvar vaga.';
    return res.redirect('/empresa/publicar-vaga');
  }
};

exports.apiPerguntasDISC = async (req, res) => {
  try {
    const vagaId = req.params.id;

    // 1. Buscar a vaga e as relações de soft skills
    const vaga = await prisma.vaga.findUnique({
      where: { id: vagaId },
      include: {
        // Se o seu include não funcionar por falta de relação no schema, 
        // usaremos a busca manual abaixo
      }
    });

    // 2. Buscar os nomes das Soft Skills (importante para o gerador DISC)
    const relacoes = await prisma.vaga_soft_skill.findMany({
      where: { vaga_id: vagaId }
    });
    
    // Extraímos os IDs das skills cadastradas na vaga
    const skillIds = relacoes.map(r => r.soft_skill_id);

    // Buscamos os nomes dessas skills na tabela soft_skill
    const skillsCadastradas = await prisma.soft_skill.findMany({
      where: { id: { in: skillIds } }
    });
    
    let skillNames = skillsCadastradas.map(s => s.nome);

    // --- ESTRATÉGIA PARA GARANTIR PERGUNTAS ---
    // Se a vaga tiver poucas skills, adicionamos skills "padrão" para 
    // garantir que o banco de questões DISC retorne mais perguntas.
    if (skillNames.length < 3) {
      skillNames = [...skillNames, "Comunicação", "Trabalho em Equipe", "Resiliência"];
    }

    // 3. Gerar perguntas DISC baseadas nas skills (reais + padrões)
    const discQs = getDiscQuestionsForSkills(skillNames);

    // 4. Pegar as perguntas extras manuais da vaga
    const extraQs = (() => {
      const raw = String(vaga.pergunta ?? '').trim();
      if (!raw) return [];
      return raw.replace(/\\n/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    })();

    // 5. Unir e limitar (ou expandir)
    // Se você quer EXATAMENTE 22, pode usar um slice ou garantir que o discQs tenha o suficiente
    let questions = [...discQs, ...extraQs];
    
    // Se ainda assim tiver poucas, você pode concatenar perguntas gerais
    if (questions.length < 20) {
       const gerais = ["Como você lida com prazos apertados?", "Descreva um desafio que superou."];
       questions = [...questions, ...gerais];
    }

    return res.json({ ok: true, vagaId, questions: questions.slice(0, 30) });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar perguntas' });
  }
};

exports.abrirAnexoVaga = async (req, res) => {
  try {
    const idEncodado = req.params.id;
    // Decodifica o ID (U2FsdGVk...) para o UUID real
    const realId = decodeId(idEncodado);

    if (!realId) {
      return res.status(400).send('ID de anexo inválido.');
    }

    // Busca manual na tabela de arquivos da vaga (vaga_arquivo)
    const arquivo = await prisma.vaga_arquivo.findUnique({
      where: { id: String(realId) }
    });

    if (!arquivo) {
      return res.status(404).send('Arquivo não encontrado.');
    }

    // Stream do Cloudinary via Axios
    const axios = require('axios'); // Garanta que o axios esteja instalado
    const upstream = await axios.get(arquivo.url, { responseType: 'stream' });
    
    // Define o tipo de arquivo (PDF ou imagem)
    const mime = (arquivo.mime && arquivo.mime !== 'raw') ? arquivo.mime : 'application/pdf';
    
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(arquivo.nome)}"`);
    
    upstream.data.pipe(res);
  } catch (err) {
    console.error('Erro ao abrir anexo da vaga:', err);
    if (!res.headersSent) res.status(500).send('Erro ao processar arquivo.');
  }
};

exports.solicitarVideoCandidato = async (req, res) => {
    try {
        const { idVaga, emailCandidato, nomeCandidato, nomeVaga } = req.body;
        const transporter = createTransporter();
        const linkVaga = `${process.env.APP_URL || 'http://localhost:3000'}/candidatos/vagas/${idVaga}/etapa-video`;
        
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to: emailCandidato,
            subject: `🎥 Gravação de Vídeo: ${nomeVaga}`,
            html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #0d6efd; padding: 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Connect Skills</h1>
                </div>
                <div style="padding: 30px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #0d6efd;">Olá, ${nomeCandidato}!</h2>
                    <p>A empresa responsável pela vaga <strong>${nomeVaga}</strong> solicitou um vídeo de apresentação para te conhecer melhor.</p>
                    <p>Esta é uma etapa importante do processo seletivo. Clique no botão abaixo para acessar a vaga e realizar o upload do seu vídeo:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${linkVaga}" style="background-color: #0d6efd; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Enviar meu Vídeo</a>
                    </div>
                    <p style="font-size: 12px; color: #777777;">Se o botão não funcionar, copie e cole este link: <br> ${linkVaga}</p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #999999;">
                    © 2026 Connect Skills - Todos os direitos reservados.
                </div>
            </div>
            `
        });

        return res.status(200).json({ success: true, message: 'E-mail enviado!' });
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        return res.status(500).json({ success: false });
    }
};

// Função para processar o upload do vídeo enviado pelo candidato
exports.uploadVideoCandidato = async (req, res) => {
    try {
        const { vagaId } = req.body;
        const usuarioLogado = req.session.usuario;

        // Validação básica de segurança
        if (!vagaId || !usuarioLogado) {
            req.session.erro = 'Sessão expirada ou vaga não identificada.';
            return res.redirect('/login');
        }

        // Verifica se o arquivo chegou (Multer + Cloudinary)
        if (!req.file || !req.file.path) {
            req.session.erro = 'Por favor, selecione um arquivo de vídeo válido.';
            return res.redirect(`/candidatos/vagas/${vagaId}/etapa-video`);
        }

        // 1. Buscamos o perfil do candidato vinculado ao usuário (para pegar o ID técnico se necessário)
        const perfilCandidato = await prisma.candidato.findUnique({
            where: { usuario_id: usuarioLogado.id }
        });

        // 2. Tenta encontrar a avaliação por qualquer um dos IDs (Usuario ou Candidato)
        // Isso é crucial porque se a empresa enviou o convite usando o ID do candidato, 
        // e você está logado com o ID do usuário, o updateMany precisa encontrar o registro certo.
        const avaliacaoExistente = await prisma.vaga_avaliacao.findFirst({
            where: {
                vaga_id: String(vagaId),
                OR: [
                    { candidato_id: usuarioLogado.id },
                    { candidato_id: perfilCandidato ? perfilCandidato.id : 'nao-encontrado' }
                ]
            }
        });

        if (!avaliacaoExistente) {
            console.error(`[VIDEO_UPLOAD] Registro de avaliação não encontrado para Vaga ${vagaId}`);
            req.session.erro = 'Erro ao vincular vídeo à sua candidatura. Tente novamente.';
            return res.redirect('/candidatos/home');
        }

        // 3. Executa a atualização no ID específico encontrado
        await prisma.vaga_avaliacao.update({
            where: { id: avaliacaoExistente.id },
            data: {
                resposta: req.file.path, // URL gerada pelo Cloudinary
                updated_at: new Date()
            }
        });

        console.log(`[VIDEO_UPLOAD] Sucesso! URL: ${req.file.path} para Vaga: ${vagaId}`);

        req.session.sucesso = 'Vídeo de apresentação enviado com sucesso! A empresa já pode visualizá-lo.';
        
        // Redireciona de volta para os detalhes da vaga
        return res.redirect(`/candidatos/vagas/${vagaId}`);

    } catch (err) {
        console.error('[VIDEO_UPLOAD] Erro crítico no processo:', err);
        req.session.erro = 'Houve um erro interno ao processar seu vídeo. Por favor, tente novamente.';
        return res.redirect('/candidatos/home');
    }
};

exports.exibirTelaUploadVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const usuarioLogado = req.session.usuario;

        if (!usuarioLogado) return res.redirect('/login');

        // 1. Buscamos o registro do candidato vinculado a esse usuário no banco
        const perfilCandidato = await prisma.candidato.findUnique({
            where: { usuario_id: usuarioLogado.id }
        });

        // 2. Agora buscamos a avaliação tentando os DOIS IDs (o do usuário e o do candidato)
        // Isso garante que independente de como a empresa salvou, nós vamos achar.
        const avaliacao = await prisma.vaga_avaliacao.findFirst({
            where: {
                vaga_id: String(id),
                OR: [
                    { candidato_id: usuarioLogado.id },
                    { candidato_id: perfilCandidato ? perfilCandidato.id : 'nao-existe' }
                ]
            }
        });

        if (!avaliacao) {
            console.error(`[VIDEO] Bloqueio: Registro não encontrado na vaga_avaliacao.`);
            req.session.erro = 'Você não tem permissão para acessar esta etapa.';
            return res.redirect('/candidatos/home');
        }

        // 3. Verificação de validade de 3 dias
        const dataConvite = new Date(avaliacao.updated_at || avaliacao.created_at);
        const agora = new Date();
        const tresDiasEmMs = 3 * 24 * 60 * 60 * 1000;

        if (agora - dataConvite > tresDiasEmMs) {
            return res.render('candidatos/etapa-video-expirado', {
                vagaTitulo: "Link Expirado",
                mensagem: "O prazo para envio do vídeo terminou."
            });
        }

        const vaga = await prisma.vaga.findUnique({
            where: { id: String(id) }
        });

        if (!vaga) {
            req.session.erro = 'Vaga não encontrada.';
            return res.redirect('/candidatos/home');
        }

        // 4. Como o include: { empresa: true } falhou, buscamos a empresa manualmente pelo id
        const empresa = await prisma.empresa.findUnique({
            where: { id: vaga.empresa_id }
        });

        vaga.empresa = empresa;

        res.render('candidatos/etapa-video', {
            vaga,
            msgErro: req.session.erro,
            msgSucesso: req.session.sucesso
        });

    } catch (error) {
        console.error('Erro crítico na rota de vídeo:', error);
        res.redirect('/candidatos/home');
    }
};

exports.removerVideoCandidato = async (req, res) => {
    try {
        const vagaId = req.params.id;
        const usuarioLogado = req.session.usuario;

        if (!usuarioLogado) return res.redirect('/login');

        // Busca candidato
        const candidato = await prisma.candidato.findUnique({
            where: { usuario_id: usuarioLogado.id }
        });

        if (!candidato) {
             return res.redirect(`/candidatos/vagas/${vagaId}`);
        }

        // Busca a avaliação
        const avaliacao = await prisma.vaga_avaliacao.findFirst({
            where: {
                vaga_id: String(vagaId),
                candidato_id: String(candidato.id)
            }
        });

        if (avaliacao) {
            await prisma.vaga_avaliacao.update({
                where: { id: avaliacao.id },
                data: { 
                    resposta: null, // Remove o link do vídeo
                    updated_at: new Date()
                }
            });
            console.log(`[VIDEO] Vídeo removido pelo candidato ${candidato.nome}`);
        }

        return res.redirect(`/candidatos/vagas/${vagaId}`);

    } catch (err) {
        console.error('Erro ao remover vídeo:', err);
        req.session.erro = "Não foi possível remover o vídeo.";
        return res.redirect(`/candidatos/vagas/${vagaId}`);
    }
};

// Adicione esta função para salvar o feedback
exports.salvarFeedbackCandidato = async (req, res) => {
    try {
        const { avaliacaoId, feedbackTexto, vagaId } = req.body;
        const empresaSessao = req.session.empresa;

        // 1. Busca a avaliação para pegar IDs de vaga e candidato
        const avaliacaoAtual = await prisma.vaga_avaliacao.findUnique({
            where: { id: String(avaliacaoId) }
        });
        
        if (!avaliacaoId || !avaliacaoAtual || !feedbackTexto.trim()) {
            req.session.erro = "Avaliação não encontrada.";
            return res.redirect('/empresas/home');
        }

        const [candidatoRelacionado, vaga] = await Promise.all([
            prisma.candidato.findUnique({
                where: { id: avaliacaoAtual.candidato_id },
                include: { usuario: true }
            }),
            prisma.vaga.findUnique({
                where: { id: avaliacaoAtual.vaga_id }
            })
        ]);

        const idDaVaga = avaliacaoAtual.vaga_id || vagaId;

        console.log("Avaliação Encontrada:", avaliacaoAtual);
        console.log("Tentando buscar Candidato ID:", avaliacaoAtual.candidato_id);

        const dadosUsuario = candidatoRelacionado?.usuario;
        const nomeExibicao = candidatoRelacionado?.nome || dadosUsuario?.nome || "Candidato";

        console.log('[DEBUG] Candidato encontrado:', candidatoRelacionado ? 'SIM' : 'NÃO');
        console.log('[DEBUG] Email para envio:', dadosUsuario?.email);

        // 3. Preserva o vídeo atual e anexa o novo feedback
        let videoLink = '';
        const respostaOriginal = avaliacaoAtual.resposta || '';

        if (respostaOriginal.includes('|||')) {
            videoLink = respostaOriginal.split('|||')[0].trim();
        } else if (respostaOriginal.startsWith('http')) {
            videoLink = respostaOriginal.trim();
        }
        
        const safeVideoLink = videoLink.substring(0, 90); 
        const safeFeedbackTexto = feedbackTexto.substring(0, 160);

        const novoConteudo = videoLink ? `${videoLink} ||| ${feedbackTexto}` : `||| ${feedbackTexto}`;

        // 4. Atualiza o banco
        try {
            console.log("[DEBUG] Tentando salvar texto completo no breakdown...");
            
            // TENTATIVA A: Tenta salvar o texto INTEIRO no campo breakdown (Se o banco suportar)
            await prisma.vaga_avaliacao.update({
                where: { id: String(avaliacaoId) },
                data: { 
                    resposta: safeVideoLink, 
                    breakdown: feedbackTexto, // Tenta salvar o texto completo aqui
                    updated_at: new Date()
                }
            });

        } catch (innerError) {
            console.error(">>>> Falha no campo breakdown, ativando Plano B (Compacto)...");
            
            // TENTATIVA B (FALLBACK): Se der erro acima, salva versão resumida no campo resposta
            // O formato será: LINK ||| TEXTO CURTO
            const conteudoCompacto = `${safeVideoLink}|||${safeFeedbackTexto}...`;

            await prisma.vaga_avaliacao.update({
                where: { id: String(avaliacaoId) },
                data: { 
                    resposta: conteudoCompacto,
                    // Não enviamos o breakdown aqui para não gerar erro novamente
                    updated_at: new Date()
                }
            });
        }
        
        console.log('[DEBUG DADOS USUARIO]', dadosUsuario);

        // 5. Envio do E-mail com link direto para a vaga
        if (dadosUsuario?.email) {
            console.log(`[SMTP] Preparando envio para: ${dadosUsuario.email}`);
            try {
                const transporter = createTransporter();
                const nomeEmpresa = empresaSessao?.nome_empresa || 'Connect Skills - Empresa';
                const linkVaga = `${process.env.APP_URL || 'http://localhost:3000'}/candidatos/vagas/${vaga.id}`;

                const info = await transporter.sendMail({
                    from: `"Connect Skills" <${process.env.SMTP_USER}>`,
                    to: dadosUsuario.email,
                    subject: `Novo feedback de ${nomeEmpresa}`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                            <h2 style="color: #6a11cb;">Olá, ${nomeExibicao}!</h2>
                            <p>Você recebeu um feedback da empresa <strong>${nomeEmpresa}</strong> sobre a vaga de <strong>${vaga.cargo}</strong>.</p>
                            <div style="background: #f4f4f4; padding: 15px; border-left: 4px solid #6a11cb; margin: 20px 0;">
                                <em>"${feedbackTexto}"</em>
                            </div>
                            <p>Para ver mais detalhes e o status da sua candidatura, clique no botão abaixo:</p>
                            <a href="${linkVaga}" style="background: #2575fc; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Ver Detalhes da Vaga</a>
                        </div>
                    `
                });
                console.log("[SMTP] Sucesso para:", dadosUsuario.email);
            } catch (mailError) {
                console.error("[SMTP ERROR]:", mailError.message);
            }
        } else {
            console.log("[SMTP] Usuário não possui e-mail cadastrado.");
        }

        req.session.sucesso = "Feedback enviado com sucesso!";
        console.log(`[CONTROLLER] Salvando sessão no ID: ${req.sessionID}`);
        const idParaRedirecionar = avaliacaoAtual.vaga_id || vaga.id;

        return req.session.save((err) => {
            if (err) console.error('Erro ao salvar sessão:', err);
            res.redirect(`/empresa/ranking-candidatos/${idParaRedirecionar}?feedback=success`);
        });

    } catch (err) {
        console.error('Erro no feedback:', err);
        req.session.erro = "Erro ao processar feedback.";
        return res.redirect('/empresas/home');
    }
};