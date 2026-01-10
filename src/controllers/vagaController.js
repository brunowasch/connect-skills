const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const vagaModel = require('../models/vagaModel');
const { getDiscQuestionsForSkills } = require('../utils/discQuestionBank');
const { decodeId } = require('../utils/idEncoder');
const nodemailer = require('nodemailer');


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
    const { emailCandidato, nomeCandidato, nomeVaga, idVaga } = req.body;

    // Configuração do transporte usando suas variáveis do cPanel
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: false, // 587 usa STARTTLS
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    // URL base configurada no seu ambiente
    const linkVaga = `${process.env.APP_URL}/vagas/${idVaga}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM, //
        to: emailCandidato,
        subject: `🎥 Vídeo solicitado: ${nomeVaga} - Connect Skills`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; padding: 30px; border-radius: 12px;">
                <h2 style="color: #6200ee;">Olá, ${nomeCandidato}!</h2>
                <p style="font-size: 16px; line-height: 1.5;">A empresa da vaga <strong>${nomeVaga}</strong> analisou seu perfil e agora gostaria de te conhecer melhor através de um vídeo de apresentação.</p>
                
                <div style="background-color: #f3e5f5; padding: 15px; border-left: 5px solid #6200ee; margin: 20px 0;">
                    <strong>Requisitos do vídeo:</strong>
                    <ul style="margin: 10px 0;">
                        <li>Duração máxima: 3 minutos.</li>
                        <li>Fale sobre suas principais habilidades.</li>
                        <li>Conte por que você quer essa vaga.</li>
                    </ul>
                </div>

                <div style="text-align: center; margin: 35px 0;">
                    <a href="${linkVaga}" style="background-color: #6200ee; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Fazer Login e Subir Vídeo
                    </a>
                </div>

                <p style="font-size: 12px; color: #999; text-align: center;">
                    Este é um e-mail automático enviado pela plataforma Connect Skills.
                </p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.status(200).json({ 
            success: true, 
            message: 'E-mail enviado com sucesso para o candidato!' 
        });
    } catch (error) {
        console.error('Erro ao enviar e-mail via cPanel:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar envio de e-mail.' 
        });
    }
};