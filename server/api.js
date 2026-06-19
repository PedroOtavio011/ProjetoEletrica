require('dotenv').config();
const db = require('./db');
const express = require('express');
const app = express();
const cors = require('cors');
const { registrarRotasAuth, exigirLicencaAtiva } = require('./auth');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 3000;

// Registra as rotas de cadastro/login/ativação de licença
registrarRotasAuth(app);

// =========================================================
// ROTA GRÁTIS: a calculadora de bitola fica aberta pra todos
// =========================================================
app.get('/calcular', async (req, res) => {
    const { potencia, tensao, distancia, material_id } = req.query;

    if (!potencia || !tensao || !distancia || !material_id) {
        return res.status(400).json({ error: 'Parâmetros insuficientes' });
    }

    const I = potencia / tensao;
    const L = parseFloat(distancia);
    const V = parseFloat(tensao);

    try {
        const [material] = await db.query('SELECT resistividade FROM materiais WHERE id = ?', [material_id]);
        if (material.length === 0) {
            return res.status(404).json({ error: 'Material não encontrado' });
        }
        const rho = material[0].resistividade;

        const [cabos] = await db.query(
            'SELECT * FROM dimensionamento WHERE material_id = ? AND max_amperes >= ? ORDER BY bitola ASC',
            [material_id, I]
        );
        if (cabos.length === 0) {
            return res.status(404).json({ error: 'Nenhum cabo encontrado para os parâmetros fornecidos' });
        }

        let caboSelecionado = null;
        let quedaPercentual = 0;

        for (const cabo of cabos) {
            const S = cabo.bitola;
            const quedaVolts = (2 * rho * L * I) / S;
            quedaPercentual = (quedaVolts / V) * 100;

            if (quedaPercentual <= 4) {
                caboSelecionado = cabo;
                break;
            }
        }

        if (!caboSelecionado) {
            return res.status(404).json({
                error: 'Nenhum cabo encontrado que atenda à queda de tensão máxima de 4%',
                sugestao: cabos[cabos.length - 1]
            });
        }

        res.json({
            bitola: caboSelecionado.bitola,
            disjuntor: caboSelecionado.disjuntor_sugerido,
            corrente: I.toFixed(2),
            queda_tensao: quedaPercentual.toFixed(2) + '%'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao calcular dimensionamento' });
    }
});

app.get('/materiais', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM materiais');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar materiais' });
    }
});

app.get('/equipamentos', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM equipamentos');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar equipamentos' });
    }
});

// =========================================================
// ROTAS PAGAS: exigem licença ativa (orçamento completo, busca de preços)
// =========================================================
app.get('/buscar-precos', exigirLicencaAtiva, async (req, res) => {
    const { termo } = req.query;

    if (!termo) {
        return res.status(400).json({ error: 'Termo de busca não fornecido' });
    }

    try {
        const urlMeli = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&limit=3`;
        const response = await fetch(urlMeli, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });

        if (!response.ok) {
            return res.status(502).json({ error: `Mercado Livre retornou status ${response.status}` });
        }

        const data = await response.json();
        if (!data.results) {
            return res.status(502).json({ error: 'Resposta inesperada do Mercado Livre' });
        }

        const resultados = data.results.map(produto => ({
            id: produto.id,
            titulo: produto.title,
            preco: produto.price,
            link: `${produto.permalink}?YOUR_AFFILIATE_ID_HERE`,
            foto: produto.thumbnail
        }));

        res.json(resultados);

    } catch (err) {
        console.error('Erro na API de preços:', err);
        res.status(500).json({ error: 'Erro ao buscar preços no mercado' });
    }
});

// Exemplo: se no futuro você quiser salvar orçamentos no servidor (histórico do cliente)
app.post('/orcamento/salvar', exigirLicencaAtiva, async (req, res) => {
    // req.usuario.id já vem disponível aqui, vindo do middleware
    res.json({ sucesso: true, mensagem: 'Orçamento salvo (implemente a query de INSERT aqui).' });
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});