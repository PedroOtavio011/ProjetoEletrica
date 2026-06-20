/**
 * gerar-licencas.js
 * Roda este script pra gerar novas chaves de licença pra vender.
 * Uso: node gerar-licencas.js 10   (gera 10 chaves novas)
 */
const db = require('./db');
const crypto = require('crypto');

function gerarChave() {
    const bloco = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `FDTECH-${bloco()}-${bloco()}`;
}

async function gerarLote(quantidade) {
    const chavesGeradas = [];

    for (let i = 0; i < quantidade; i++) {
        const chave = gerarChave();
        await db.query('INSERT INTO licencas (chave, ativa) VALUES (?, FALSE)', [chave]);
        chavesGeradas.push(chave);
    }

    console.log(`\n✅ ${quantidade} licença(s) gerada(s):\n`);
    chavesGeradas.forEach(c => console.log(c));
    console.log('\nGuarde essas chaves para vender. Cada uma só pode ser ativada uma vez.\n');
    process.exit(0);
}

const quantidade = parseInt(process.argv[2]) || 1;
gerarLote(quantidade);