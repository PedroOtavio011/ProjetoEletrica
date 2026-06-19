/**
 * auth.js
 * Sistema de cadastro/login simples + ativação de licença por chave manual.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET

function registrarRotasAuth(app) {

    // --- CADASTRO ---
    app.post('/auth/registro', async (req, res) => {
        const { email, senha } = req.body;
        if (!email || !senha || senha.length < 6) {
            return res.status(400).json({ error: 'Email válido e senha com no mínimo 6 caracteres são obrigatórios.' });
        }

        try {
            const [existente] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
            if (existente.length > 0) {
                return res.status(409).json({ error: 'Este email já está cadastrado.' });
            }

            const senhaHash = await bcrypt.hash(senha, 10);
            const [resultado] = await db.query('INSERT INTO usuarios (email, senha_hash) VALUES (?, ?)', [email, senhaHash]);

            const token = jwt.sign({ id: resultado.insertId, email }, JWT_SECRET, { expiresIn: '90d' });
            res.json({ token, email });

        } catch (err) {
            console.error('Erro no registro:', err);
            res.status(500).json({ error: 'Erro ao criar conta.' });
        }
    });

    // --- LOGIN ---
    app.post('/auth/login', async (req, res) => {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }

        try {
            const [usuarios] = await db.query('SELECT id, email, senha_hash FROM usuarios WHERE email = ?', [email]);
            if (usuarios.length === 0) {
                return res.status(401).json({ error: 'Email ou senha incorretos.' });
            }

            const senhaCorreta = await bcrypt.compare(senha, usuarios[0].senha_hash);
            if (!senhaCorreta) {
                return res.status(401).json({ error: 'Email ou senha incorretos.' });
            }

            const token = jwt.sign({ id: usuarios[0].id, email: usuarios[0].email }, JWT_SECRET, { expiresIn: '90d' });
            res.json({ token, email: usuarios[0].email });

        } catch (err) {
            console.error('Erro no login:', err);
            res.status(500).json({ error: 'Erro ao fazer login.' });
        }
    });

    // --- ATIVAR LICENÇA (precisa estar logado) ---
    app.post('/auth/ativar-licenca', verificarToken, async (req, res) => {
        const { chave } = req.body;
        if (!chave) {
            return res.status(400).json({ error: 'Informe a chave de licença.' });
        }

        try {
            const [licencas] = await db.query('SELECT * FROM licencas WHERE chave = ?', [chave.trim().toUpperCase()]);

            if (licencas.length === 0) {
                return res.status(404).json({ error: 'Chave de licença inválida.' });
            }
            if (licencas[0].usuario_id !== null) {
                return res.status(409).json({ error: 'Esta chave já foi ativada em outra conta.' });
            }

            await db.query(
                'UPDATE licencas SET usuario_id = ?, ativa = TRUE, ativada_em = NOW() WHERE id = ?',
                [req.usuario.id, licencas[0].id]
            );

            res.json({ sucesso: true, mensagem: 'Licença ativada com sucesso!' });

        } catch (err) {
            console.error('Erro ao ativar licença:', err);
            res.status(500).json({ error: 'Erro ao ativar licença.' });
        }
    });

    // --- STATUS DA CONTA (o frontend chama isso pra saber se libera as funções pagas) ---
    app.get('/auth/status', verificarToken, async (req, res) => {
        try {
            const [licencas] = await db.query(
                'SELECT chave, ativada_em FROM licencas WHERE usuario_id = ? AND ativa = TRUE LIMIT 1',
                [req.usuario.id]
            );

            res.json({
                email: req.usuario.email,
                temLicencaAtiva: licencas.length > 0,
                licenca: licencas[0] || null
            });

        } catch (err) {
            console.error('Erro ao checar status:', err);
            res.status(500).json({ error: 'Erro ao checar status da conta.' });
        }
    });
}

// --- MIDDLEWARE: exige apenas estar logado ---
function verificarToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Faça login para continuar.' });
    }

    try {
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sessão expirada, faça login novamente.' });
    }
}

// --- MIDDLEWARE: exige login E licença ativa (usar nas rotas pagas) ---
async function exigirLicencaAtiva(req, res, next) {
    verificarToken(req, res, async () => {
        try {
            const [licencas] = await db.query(
                'SELECT id FROM licencas WHERE usuario_id = ? AND ativa = TRUE LIMIT 1',
                [req.usuario.id]
            );

            if (licencas.length === 0) {
                return res.status(403).json({ error: 'Esta função exige uma licença ativa. Adquira uma chave para continuar.' });
            }

            next();
        } catch (err) {
            console.error('Erro ao validar licença:', err);
            res.status(500).json({ error: 'Erro ao validar licença.' });
        }
    });
}

module.exports = { registrarRotasAuth, verificarToken, exigirLicencaAtiva };
