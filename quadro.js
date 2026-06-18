const selectEquipamentos = document.querySelector('#seletorEquipamento');
const gerar = document.querySelector('#btnCalcularQuadro');
const voltagemQuadro = document.querySelector('#voltagemQuadro');
const listaTues = document.querySelector('#listaTUEs');
const resultadoQuadro = document.querySelector('#res-quadro');
const quadroVisual = document.querySelector('#quadroVisual');

let listaSelecionados = [];

// 1. Carregar equipamentos do Banco de Dados
fetch('http://localhost:3000/equipamentos')
    .then(response => response.json())
    .then(equipamentos => {
        // Opção padrão
        selectEquipamentos.innerHTML = '<option value="">-- Selecione um equipamento --</option>';
        equipamentos.forEach(equipamento => {
            const option = document.createElement('option');
            option.value = equipamento.id;
            option.dataset.amperagem = equipamento.amperagem;
            option.dataset.polos = equipamento.polos;
            option.textContent = `${equipamento.nome} (${equipamento.potencia}W)`;
            selectEquipamentos.appendChild(option);
        });
    })
    .catch(error => console.error('Erro ao carregar equipamentos:', error));

// 2. Adicionar item e atualizar interface
selectEquipamentos.addEventListener('change', () => {
    const selectedOption = selectEquipamentos.options[selectEquipamentos.selectedIndex];
    if (selectedOption.value === "") return;

    const nome = selectedOption.textContent;
    const amperagem = selectedOption.dataset.amperagem;
    const polos = selectedOption.dataset.polos;

    listaSelecionados.push({ nome, amperagem, polos });
    
    // Reseta o select para a opção padrão
    selectEquipamentos.value = "";
    
    renderizarListaLateral();
});

// 3. Função para renderizar a lista lateral com botão de excluir
function renderizarListaLateral() {
    listaTues.innerHTML = listaSelecionados.map((equip, index) => `
        <div class="tue-item">
            <span>${equip.nome} - <b>${equip.amperagem}A</b></span>
            <button onclick="removerItem(${index})" style="width: auto; padding: 2px 8px; margin: 0; background: #ff4757; font-size: 12px;">X</button>
        </div>
    `).join('');
}

// 4. Função para remover item específico
window.removerItem = (index) => {
    listaSelecionados.splice(index, 1); // Remove 1 item na posição index
    renderizarListaLateral();
    // Se o resultado já estiver aberto, recalcula automaticamente
    if (!document.getElementById('resultadoQuadro').classList.contains('hidden')) {
        calcular();
    }
};

// 5. Desenho Visual dos Disjuntores
function desenharDisjuntor(label, polos, cor) {
    const div = document.createElement('div');
    div.classList.add('disjuntor-bloco');
    if (polos >= 2) div.style.width = (35 * polos) + "px";
    div.style.borderTopColor = cor;
    div.innerHTML = `<span>${label}</span><small>${polos}P</small>`;
    quadroVisual.appendChild(div);
}

// 6. Cálculo e Geração do Memorial
function calcular() {
    const iluminacao = document.querySelector('#iluminacao').value || 0;
    const tomadas = document.querySelector('#tomadasSimples').value || 0;
    const capacidadeDisjuntores = document.querySelector('#capacidadeDoQuadro').value || 0;

    let totalPolos = 0;
    let memoriaHtml = "";
    quadroVisual.innerHTML = ''; 

    // --- PROTEÇÃO (Geral, DR, DPS) ---
    if (voltagemQuadro.value === '127') {
        totalPolos += 5;
        desenharDisjuntor('GERAL', 1, '#333');
        desenharDisjuntor('DR', 2, '#ff9f43');
        desenharDisjuntor('DPS', 1, '#ee5253');
        desenharDisjuntor('DPS', 1, '#ee5253');
        memoriaHtml += `<p><b>Proteção:</b> Geral 40A, DR e 2x DPS.</p>`;
    } else {
        totalPolos += 6;
        desenharDisjuntor('GERAL', 2, '#333');
        desenharDisjuntor('DR', 2, '#ff9f43');
        desenharDisjuntor('DPS', 1, '#ee5253');
        desenharDisjuntor('DPS', 1, '#ee5253');
        memoriaHtml += `<p><b>Proteção:</b> Geral 50A, DR e 2x DPS.</p>`;
    }

    // --- CIRCUITOS BÁSICOS ---
    const totalIluminacao = Math.ceil(iluminacao / 10);
    for(let i=0; i < totalIluminacao; i++) desenharDisjuntor('Luz', 1, '#feca57');
    totalPolos += totalIluminacao;

    const totalTomadas = Math.ceil(tomadas / 8);
    for(let i=0; i < totalTomadas; i++) desenharDisjuntor('TUG', 1, '#54a0ff');
    totalPolos += totalTomadas;

    // --- ITENS SELECIONADOS (TUEs) ---
    listaSelecionados.forEach(equip => {
        const p = parseInt(equip.polos);
        totalPolos += p;
        desenharDisjuntor('TUE', p, '#00d2d3');
        memoriaHtml += `<p>• ${equip.nome} (${equip.amperagem}A)</p>`;
    });

    // --- EXIBIÇÃO ---
    const resContainer = document.getElementById('resultadoQuadro');
    resContainer.classList.remove('hidden');

    if (totalPolos > capacidadeDisjuntores) {
        resultadoQuadro.innerHTML = `
            <div style="color: #ff4757; font-weight: bold;">
                ❌ ESPAÇO INSUFICIENTE! (Ocupado: ${totalPolos} | Limite: ${capacidadeDisjuntores})
            </div>${memoriaHtml}`;
    } else {
        resultadoQuadro.innerHTML = `
            <div style="color: #1dd1a1; font-weight: bold;">
                ✅ CONFIGURAÇÃO VÁLIDA! (Ocupado: ${totalPolos}/${capacidadeDisjuntores})
            </div>${memoriaHtml}`;
    }
}

gerar.addEventListener('click', calcular);