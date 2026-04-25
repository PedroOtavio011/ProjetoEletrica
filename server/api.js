const db = require('./db');
const express = require('express');
const app = express();
const cors = require('cors');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 3000;

app.get('/materiais', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM materiais');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar materiais' });
    }
});

app.get('/calcular', async (req, res) => {
    const {potencia, tensao, distancia, material_id} = req.query;

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

        const [cabos] = await db.query('SELECT * FROM dimensionamento WHERE material_id = ? AND max_amperes >= ? ORDER BY bitola ASC', [material_id, I]);
        if (cabos.length === 0) {
            return res.status(404).json({ error: 'Nenhum cabo encontrado para os parâmetros fornecidos' });
        }

        let caboSelecionado = null;
        let quedaPercentual = 0;

        for(const cabo of cabos) {
            const S = cabo.bitola;
            //Calculo delta V = I * (rho * L / S)
            const quedaVolts = (2 * rho * L * I) / S;
            quedaPercentual = (quedaVolts / V) * 100;

            if (quedaPercentual <= 4) {
                caboSelecionado = cabo;
                break;
            }
        }

        if (!caboSelecionado) {
            return res.status(404).json({ error: 'Nenhum cabo encontrado que atenda à queda de tensão máxima de 4%', sugestao: cabos[cabos.length - 1] 

            });
        }
        res.json({
            bitola: caboSelecionado.bitola,
            disjuntor: caboSelecionado.disjuntor_sugerido,
            corrente: I.toFixed(2),
            queda_tensao: quedaPercentual.toFixed(2) + '%'
        })

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao calcular dimensionamento' });
    }
        
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});


