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
        const arquivo = req.file;

        if (!vagaId) {
             console.error('[VIDEO] Erro: vagaId não recebido.');
             req.session.erro = 'Erro ao identificar a vaga.';
             return res.redirect('/candidatos/home'); // Ou rota apropriada
        }

        if (!req.file) {
            req.session.erro = 'Falha ao carregar o arquivo de vídeo ou formato inválido.';
            return res.redirect(`/candidatos/vagas/${vagaId}/etapa-video`);
        }

        await prisma.vaga_avaliacao.updateMany({
            where: {
                vaga_id: vagaId,
                candidato_id: req.session.usuario.id
            },
            data: {
                video_url: req.file.path, // URL que vem do Cloudinary
                updated_at: new Date()
            }
        });

        console.log(`[VIDEO] Upload realizado com sucesso: ${req.file.path}`);

        req.session.sucesso = 'Vídeo de apresentação enviado com sucesso! A empresa já pode visualizá-lo.';
        
        return res.redirect(`/candidatos/vagas/${vagaId}`);
    } catch (err) {
        console.error('[VIDEO] Erro no controller:', err);
        req.session.erro = 'Erro interno ao processar vídeo.';
        const redirectUrl = req.body.vagaId ? `/vagas/${req.body.vagaId}` : '/';
        return res.redirect(redirectUrl);
    }
};

exports.exibirTelaUploadVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const usuarioId = req.session.usuario.id;

        // 1. Busca a vaga e a avaliação do candidato (onde está a data do convite)
        const avaliacao = await prisma.vaga_avaliacao.findFirst({
            where: {
                vaga_id: String(id),
                candidato_id: usuarioId
            }
        });

        if (!avaliacao) {
            req.session.erro = 'Você não tem permissão para acessar esta etapa.';
            return res.redirect('/candidatos/home');
        }

        // 2. LÓGICA DE 3 DIAS
        // Verificamos o campo 'updated_at' (ou 'criado_em') de quando ele foi movido para essa etapa
        const dataConvite = new Date(avaliacao.updated_at);
        const agora = new Date();
        const diferencaDias = Math.floor((agora - dataConvite) / (1000 * 60 * 60 * 24));

        if (diferencaDias > 3) {
            return res.render('candidatos/etapa-video-expirado', {
                vagaTitulo: "Esta oportunidade expirou",
                mensagem: "O prazo de 3 dias para envio do vídeo de apresentação encerrou."
            });
        }

        const vaga = await prisma.vaga.findUnique({
            where: { id: String(id) },
            include: { empresa: true }
        });

        res.render('candidatos/etapa-video', {
            vaga,
            msgErro: req.session.erro,
            msgSucesso: req.session.sucesso
        });

    } catch (error) {
        console.error('Erro ao validar etapa de vídeo:', error);
        res.redirect('/candidatos/home');
    }
};