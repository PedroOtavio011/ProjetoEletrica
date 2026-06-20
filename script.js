/**
 * FD.tech - Sistema de Dimensionamento e Orçamentação Elétrica
 * Arquivo: script.js
 * Ajustes desta versão:
 *  - Corrigida a tabela de bitola reduzida do Neutro (NBR 5410 6.2.6.2.2)
 *  - Adicionado aviso de cor dos condutores (Neutro azul / Terra verde) no Orçamento e no WhatsApp
 *  - Pequena reorganização para reduzir buscas repetidas no DOM
 */

const CONFIG = {
    ENDPOINTS: {
        POTENCIAS_JSON: 'json/potencias.json',
        MATERIAIS_JSON: 'json/guiaRapido.json',
        CALCULO_API: 'http://localhost:3000/calcular',
        BUSCAR_PRECOS_API: 'http://localhost:3000/buscar-precos',
        AUTH_REGISTRO: 'http://localhost:3000/auth/registro',
        AUTH_LOGIN: 'http://localhost:3000/auth/login',
        AUTH_ATIVAR_LICENCA: 'http://localhost:3000/auth/ativar-licenca',
        AUTH_STATUS: 'http://localhost:3000/auth/status'
    },
    DEBUG: true
};

// Cores normativas dos condutores (NBR 5410 - item 6.4.4)
const CORES_NORMA = {
    fase: 'Preto, Vermelho, Branco ou Cinza',
    neutro: 'Azul-claro (obrigatório ser diferente da Fase)',
    terra: 'Verde ou Verde-Amarelo (exclusivo, nunca usar em outra função)'
};

// Cores disponíveis para seleção ao adicionar fio como material avulso
const CORES_FIO_DISPONIVEIS = ['Preto', 'Azul', 'Vermelho', 'Amarelo', 'Branco', 'Verde'];

let basePotencias = [];
let bancoMateriaisAvulsos = {};
let orcamentoAtual = {
    circuitos: [],
    materiaisAvulsos: [],
    maoDeObra: 0,
    outrosMateriais: 0
};
let ultimoCalculo = null;

function LOG(modulo, mensagem, dados = null) {
    if (CONFIG.DEBUG) {
        const timestamp = new Date().toLocaleTimeString();
        const prefixo = `[${timestamp}][FD.tech - ${modulo}]`;
        if (dados) console.log(`${prefixo} ${mensagem}`, dados);
        else console.log(`${prefixo} ${mensagem}`);
    }
}

function higienizarTexto(texto) {
    if (typeof texto !== 'string') return '';
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .trim();
}

// --- CACHE DE ELEMENTOS DO DOM (evita repetir getElementById nas mesmas funções) ---
const DOM = {};
function cachearElementos() {
    const ids = [
        'btnBuscarWatts', 'inputBusca', 'listaResultados', 'containerResultados',
        'btnCalcular', 'material_id', 'potencia', 'tensao', 'distancia',
        'qtd_fases', 'config_neutro', 'config_terra', 'nome_circuito',
        'resultado', 'res-bitola', 'res-disjuntor', 'res-queda',
        'btnAdicionarAoOrcamento', 'lista-circuitos-orcamento',
        'select_categoria_avulso', 'select_item_avulso', 'nome_material_avulso',
        'select_cor_avulso', 'qtd_material_avulso', 'btnAdicionarMaterialAvulso', 'lista-materiais-avulsos',
        'btnCalcularTotalOrcamento', 'valor_mao_de_obra', 'valor_outros_materiais',
        'resultado-geral-orcamento', 'total-geral-reais', 'btnGerarWhatsApp',
        // Tela de Conta
        'bloco-deslogado', 'bloco-logado', 'form-login', 'form-cadastro',
        'btn-toggle-login', 'btn-toggle-cadastro',
        'login_email', 'login_senha', 'btnLogin', 'erro-login',
        'cadastro_email', 'cadastro_senha', 'btnCadastro', 'erro-cadastro',
        'texto-email-logado', 'bloco-sem-licenca', 'bloco-com-licenca',
        'input_chave_licenca', 'btnAtivarLicenca', 'erro-licenca', 'btnLogout',
        'indicador-conta'
    ];
    ids.forEach(id => { DOM[id] = document.getElementById(id); });
}

document.addEventListener('DOMContentLoaded', () => {
    LOG('Inicialização', 'Aplicação iniciada. Carregando dependências...');
    cachearElementos();
    carregarPotencias();
    carregarMateriaisAvulsos();
    popularCoresAvulso();
    registrarEventos();
    registrarEventosAuth();
    atualizarTelaConta();
    registrarServiceWorker();
});

/**
 * Registra o Service Worker, que habilita o funcionamento como PWA
 * (cache offline + capacidade de "instalar" o app no celular).
 * Roda só se o navegador suportar essa tecnologia (todos os navegadores modernos suportam).
 */
function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        LOG('PWA', 'Este navegador não suporta Service Worker.');
        return;
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then((registro) => {
                LOG('PWA', 'Service Worker registrado com sucesso.', registro.scope);
            })
            .catch((erro) => {
                console.error('[FD.tech - PWA] Falha ao registrar o Service Worker:', erro);
            });
    });
}

function popularCoresAvulso() {
    const select = DOM.select_cor_avulso;
    if (!select) return;

    select.innerHTML = '<option value="">Sem cor específica (fica a critério)</option>';
    CORES_FIO_DISPONIVEIS.forEach(cor => {
        const opt = document.createElement('option');
        opt.value = cor;
        opt.textContent = cor;
        select.appendChild(opt);
    });
}

async function carregarPotencias() {
    try {
        const response = await fetch(CONFIG.ENDPOINTS.POTENCIAS_JSON);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        basePotencias = await response.json();
        LOG('Dicionário', 'Banco de potências carregado com sucesso.', `${basePotencias.length} itens.`);
    } catch (error) {
        console.error("[FD.tech - Erro Crítico] Falha ao buscar potências:", error);
    }
}

async function carregarMateriaisAvulsos() {
    try {
        const response = await fetch(CONFIG.ENDPOINTS.MATERIAIS_JSON);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        bancoMateriaisAvulsos = await response.json();
        LOG('Materiais Avulsos', 'Banco de materiais rápidos carregado via fetch.', bancoMateriaisAvulsos);
        popularCategoriasDinamicas();
    } catch (error) {
        console.error("[FD.tech - Erro Crítico] Falha ao buscar materiais avulsos:", error);
    }
}

function popularCategoriasDinamicas() {
    const selectCategoria = DOM.select_categoria_avulso;
    if (!selectCategoria || !bancoMateriaisAvulsos) return;

    selectCategoria.innerHTML = '<option value="">-- Selecione uma Categoria --</option>';

    Object.keys(bancoMateriaisAvulsos).forEach(chave => {
        const opt = document.createElement('option');
        opt.value = chave;
        opt.textContent = chave.charAt(0).toUpperCase() + chave.slice(1).replace(/_/g, ' ');
        selectCategoria.appendChild(opt);
    });

    const optOutro = document.createElement('option');
    optOutro.value = 'outro';
    optOutro.textContent = 'Outro (Digitar Nome Manuscrito)';
    selectCategoria.appendChild(optOutro);

    LOG('UX Materiais', 'Categorias do select populadas dinamicamente via JSON.');
}

function abrirAba(idAba) {
    const idLimpo = higienizarTexto(idAba);
    LOG('Navegação', `Alterando para a aba: ${idLimpo}`);

    document.querySelectorAll('.tab-content').forEach(section => section.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const abaAlvo = document.getElementById(idLimpo);
    const botaoAlvo = document.getElementById(`btn-tab-${idLimpo}`);

    if (abaAlvo) abaAlvo.classList.remove('hidden');
    if (botaoAlvo) botaoAlvo.classList.add('active');
}

function atualizarItensAvulsos() {
    const category = DOM.select_categoria_avulso?.value;
    const selectItem = DOM.select_item_avulso;
    const inputManual = DOM.nome_material_avulso;

    if (!selectItem || !inputManual) return;

    LOG('UX Materiais', `Categoria selecionada alterada para: ${category}`);
    selectItem.innerHTML = '<option value="">-- Selecione o Item --</option>';

    if (category === 'outro') {
        selectItem.classList.add('hidden');
        inputManual.classList.remove('hidden');
        inputManual.value = '';
    } else {
        selectItem.classList.remove('hidden');
        inputManual.classList.add('hidden');

        if (category && bancoMateriaisAvulsos && bancoMateriaisAvulsos[category]) {
            bancoMateriaisAvulsos[category].forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                selectItem.appendChild(opt);
            });
            LOG('UX Materiais', `Populados ${bancoMateriaisAvulsos[category].length} itens na lista.`);
        }
    }
}

function registrarEventos() {
    // --- BUSCA WATTS ---
    if (DOM.btnBuscarWatts) {
        DOM.btnBuscarWatts.addEventListener('click', buscarWatts);
    }

    // --- CALCULADORA ---
    if (DOM.btnCalcular) {
        DOM.btnCalcular.addEventListener('click', calcularCircuito);
    }

    // --- ADICIONAR AO ORÇAMENTO ---
    if (DOM.btnAdicionarAoOrcamento) {
        DOM.btnAdicionarAoOrcamento.addEventListener('click', adicionarCircuitoAoOrcamento);
    }

    // --- MATERIAIS AVULSOS ---
    if (DOM.btnAdicionarMaterialAvulso) {
        DOM.btnAdicionarMaterialAvulso.addEventListener('click', adicionarMaterialAvulso);
    }

    // --- FECHAMENTO DO ORÇAMENTO ---
    if (DOM.btnCalcularTotalOrcamento) {
        DOM.btnCalcularTotalOrcamento.addEventListener('click', fecharOrcamento);
    }

    // --- EXPORTAR WHATSAPP ---
    if (DOM.btnGerarWhatsApp) {
        DOM.btnGerarWhatsApp.addEventListener('click', enviarWhatsApp);
    }
}

function buscarWatts() {
    const termo = higienizarTexto(DOM.inputBusca?.value || '');
    if (termo.length < 2) { alert("Digite pelo menos 2 letras para buscar."); return; }

    const termoLower = termo.toLowerCase();
    const filtrados = basePotencias.filter(item =>
        (item.nome && item.nome.toLowerCase().includes(termoLower)) ||
        (item.categoria && item.categoria.toLowerCase().includes(termoLower))
    );

    if (!DOM.listaResultados || !DOM.containerResultados) return;

    DOM.listaResultados.innerHTML = "";
    if (filtrados.length > 0) {
        DOM.containerResultados.classList.remove('hidden');
        const fragmento = document.createDocumentFragment();

        filtrados.forEach(item => {
            const li = document.createElement('li');
            li.className = 'item-busca';
            li.innerHTML = `<div><strong>${higienizarTexto(item.nome)}</strong><br><small>${higienizarTexto(item.categoria)}</small></div><strong>${parseInt(item.watts)}W</strong>`;
            li.onclick = () => {
                if (DOM.potencia) DOM.potencia.value = item.watts;
                abrirAba('calculo');
                DOM.containerResultados.classList.add('hidden');
                if (DOM.inputBusca) DOM.inputBusca.value = "";
                DOM.distancia?.focus();
            };
            fragmento.appendChild(li);
        });

        DOM.listaResultados.appendChild(fragmento);
    } else {
        alert("Nenhum equipamento encontrado.");
        DOM.containerResultados.classList.add('hidden');
    }
}

async function calcularCircuito() {
    const material_id = parseInt(DOM.material_id?.value) || 1;
    const potencia = parseFloat(DOM.potencia?.value);
    const tensao = parseInt(DOM.tensao?.value) || 220;
    const distancia = parseFloat(DOM.distancia?.value);
    const qtdFases = parseInt(DOM.qtd_fases?.value) || 1;
    const configNeutro = DOM.config_neutro?.value || 'nao';
    const configTerra = DOM.config_terra?.value || 'nao';

    const nomeCircuito = higienizarTexto(DOM.nome_circuito?.value) || `Circuito ${orcamentoAtual.circuitos.length + 1}`;

    if (isNaN(potencia) || potencia <= 0 || isNaN(distancia) || distancia <= 0) {
        alert("Por favor, preencha a potência e a distância!");
        return;
    }

    const urlConsultada = `${CONFIG.ENDPOINTS.CALCULO_API}?potencia=${potencia}&tensao=${tensao}&distancia=${distancia}&material_id=${material_id}`;

    try {
        const response = await fetch(urlConsultada);
        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Erro ao calcular.");
            return;
        }

        const bitolaFase = parseFloat(data.bitola);

        // Define as bitolas de Neutro e Terra (já corrigido conforme NBR 5410)
        const bitolaNeutroFinal = configNeutro === 'nao'
            ? null
            : (configNeutro === 'reduzido' ? calcularBitolaReduzida(bitolaFase) : bitolaFase);

        const bitolaTerraFinal = configTerra === 'nao'
            ? null
            : (configTerra === 'reduzido' ? calcularBitolaReduzida(bitolaFase) : bitolaFase);

        // Monta a lista de condutores SEPARADOS por função (nunca soma Fase+Neutro+Terra,
        // mesmo que tenham a mesma bitola, pois são rolos de cores diferentes na compra)
        const distribuicaoMetragem = [
            {
                funcao: 'Fase',
                bitola: bitolaFase,
                metros: distancia * qtdFases,
                cor: 'Qualquer cor, exceto Azul ou Verde (sugestão: Preto/Vermelho/Branco)'
            }
        ];

        if (bitolaNeutroFinal !== null) {
            distribuicaoMetragem.push({
                funcao: 'Neutro',
                bitola: bitolaNeutroFinal,
                metros: distancia,
                cor: 'Azul-claro'
            });
        }
        if (bitolaTerraFinal !== null) {
            distribuicaoMetragem.push({
                funcao: 'Terra',
                bitola: bitolaTerraFinal,
                metros: distancia,
                cor: 'Verde ou Verde-Amarelo'
            });
        }

        const disjuntorFormatado = formatarDisjuntor(data.disjuntor);

        DOM['res-bitola'].innerText = bitolaFase + " mm²";
        DOM['res-disjuntor'].innerText = disjuntorFormatado;
        DOM['res-queda'].innerText = data.queda_tensao;
        DOM.resultado.classList.remove('hidden');

        ultimoCalculo = {
            nome: nomeCircuito,
            bitolaFase,
            bitolaNeutro: bitolaNeutroFinal,
            bitolaTerra: bitolaTerraFinal,
            neutroReduzido: configNeutro === 'reduzido',
            terraReduzido: configTerra === 'reduzido',
            disjuntor: disjuntorFormatado,
            queda: data.queda_tensao,
            distancia,
            potencia,
            fases: qtdFases,
            distribuicaoMetragem
        };

    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar ao servidor local.");
    }
}

function adicionarCircuitoAoOrcamento() {
    if (!ultimoCalculo) return;

    const complementaresEscolhidos = [];
    ['check-fita', 'check-conector', 'check-fita-pvc', 'check-bucha'].forEach(id => {
        const cb = document.getElementById(id);
        if (cb && cb.checked) complementaresEscolhidos.push(higienizarTexto(cb.value));
    });

    ultimoCalculo.materiaisAdicionais = complementaresEscolhidos;
    orcamentoAtual.circuitos.push(ultimoCalculo);
    renderizarCircuitosOrcamento();
    alert(`"${ultimoCalculo.nome}" adicionado à lista!`);

    DOM.potencia.value = '';
    DOM.distancia.value = '';
    DOM.nome_circuito.value = '';
    ['check-fita', 'check-conector', 'check-fita-pvc', 'check-bucha'].forEach(id => {
        const cb = document.getElementById(id);
        if (cb) cb.checked = false;
    });
    DOM.resultado.classList.add('hidden');
    ultimoCalculo = null;
}

function adicionarMaterialAvulso() {
    const categoria = DOM.select_categoria_avulso?.value;
    const selectItem = DOM.select_item_avulso;
    const inputManual = DOM.nome_material_avulso;
    const qtdInput = DOM.qtd_material_avulso;
    const corSelecionada = DOM.select_cor_avulso?.value || '';

    const nomeMaterial = categoria === 'outro'
        ? higienizarTexto(inputManual?.value || '')
        : higienizarTexto(selectItem?.value || '');

    const quantidade = parseInt(qtdInput?.value) || 1;

    if (!nomeMaterial || quantidade <= 0) {
        alert("Selecione um material válido.");
        return;
    }

    // A cor é totalmente opcional — se o usuário não escolher, o material entra sem cor definida
    orcamentoAtual.materiaisAvulsos.push({
        nome: nomeMaterial,
        qtd: quantidade,
        cor: corSelecionada || null
    });

    if (inputManual) inputManual.value = '';
    if (qtdInput) qtdInput.value = '1';
    if (selectItem) selectItem.selectedIndex = 0;
    if (DOM.select_cor_avulso) DOM.select_cor_avulso.selectedIndex = 0;
    renderMateriaisAvulsos();
}

function renderMateriaisAvulsos() {
    const container = DOM['lista-materiais-avulsos'];
    if (!container) return;
    if (orcamentoAtual.materiaisAvulsos.length === 0) { container.innerHTML = ''; return; }

    let html = '<h4 style="margin-top: 15px;">Materiais Adicionados Manualmente:</h4>';
    orcamentoAtual.materiaisAvulsos.forEach((m, index) => {
        const tagCor = m.cor ? ` <span style="color:#6c757d;">(cor: ${m.cor})</span>` : '';
        html += `
            <div class="card-result" style="margin-bottom: 8px; border-left: 4px solid #6c757d; padding: 10px; background: #f8f9fa; display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${m.nome}</strong>${tagCor}<span style="margin-left: 15px; color: var(--primary); font-weight: bold;">Qtd: ${m.qtd}</span></div>
                <button onclick="removerMaterialAvulso(${index})" style="background-color:#dc3545; color: white; border: none; padding: 4px 10px; font-size:12px; border-radius:4px; cursor: pointer;">Remover</button>
            </div>`;
    });
    container.innerHTML = html;
}

function removerMaterialAvulso(index) {
    orcamentoAtual.materiaisAvulsos.splice(index, 1);
    renderMateriaisAvulsos();
    if (!DOM['resultado-geral-orcamento'].classList.contains('hidden')) atualizarTotalGeral();
}

/**
 * Formata o valor do disjuntor garantindo que o sufixo "A" apareça uma única vez.
 * Extrai APENAS o primeiro número válido do valor recebido — isso evita problemas
 * caso o banco retorne algo como "32/40", "32,40" ou "32-40A" (concatenaria errado).
 */
function formatarDisjuntor(valor) {
    const match = String(valor).match(/[0-9]+(\.[0-9]+)?/);
    const numerico = match ? match[0] : String(valor).replace(/[^0-9.]/g, '');
    return `${numerico}A`;
}

// Monta o texto "Fase X mm² | Neutro Y mm² (azul) | Terra Z mm² (verde)" para um circuito
function montarResumoCondutores(c, comCor = true) {
    let texto = `Fase: ${c.bitolaFase} mm²`;

    if (c.bitolaNeutro) {
        const tagReduzido = c.neutroReduzido ? ' [reduzido]' : '';
        texto += ` | Neutro: ${c.bitolaNeutro} mm²${tagReduzido}`;
        if (comCor) texto += ` (cor: Azul-claro)`;
    }
    if (c.bitolaTerra) {
        const tagReduzido = c.terraReduzido ? ' [reduzido]' : '';
        texto += ` | Terra: ${c.bitolaTerra} mm²${tagReduzido}`;
        if (comCor) texto += ` (cor: Verde)`;
    }
    return texto;
}

// Monta a lista "• Fase: Xmm² - Ym (cor)" detalhando cada condutor do circuito, SEMPRE separados
function montarListaCabosCircuito(c, separador = '\n') {
    return c.distribuicaoMetragem
        .map(item => `  • ${item.funcao}: ${item.bitola}mm² - ${item.metros}m (cor: ${item.cor})`)
        .join(separador);
}

// Soma a metragem entre TODOS os circuitos, agrupando por função+bitola+cor
// (nunca mistura Fase com Neutro/Terra, mesmo que a bitola seja igual — são rolos diferentes)
function consolidarMetragemTotal() {
    const totalPorItem = {};
    orcamentoAtual.circuitos.forEach(c => {
        c.distribuicaoMetragem.forEach(item => {
            const chave = `${item.funcao}|${item.bitola}|${item.cor}`;
            if (!totalPorItem[chave]) {
                totalPorItem[chave] = { funcao: item.funcao, bitola: item.bitola, cor: item.cor, metros: 0 };
            }
            totalPorItem[chave].metros += item.metros;
        });
    });
    return Object.values(totalPorItem).sort((a, b) => parseFloat(a.bitola) - parseFloat(b.bitola));
}

function renderizarCircuitosOrcamento() {
    const container = DOM['lista-circuitos-orcamento'];
    if (!container) return;
    if (orcamentoAtual.circuitos.length === 0) {
        container.innerHTML = `<p style="color: #666; font-style: italic;">Nenhum circuito adicionado ainda.</p>`;
        return;
    }

    let html = '<h4>Circuitos Dimensionados:</h4>';
    orcamentoAtual.circuitos.forEach((c, index) => {
        const textoCondutores = montarResumoCondutores(c, false);
        const listaCabosHtml = montarListaCabosCircuito(c, '<br>');

        // Aviso de cor só aparece se houver Neutro e/ou Terra no circuito
        let avisoCor = '';
        if (c.bitolaNeutro || c.bitolaTerra) {
            avisoCor = `<div style="margin-top:6px; padding:8px; background:#fff8e1; border-left: 3px solid #f0ad4e; font-size:12px; border-radius:3px;">
                ⚠️ <strong>Atenção na compra do cabo:</strong>`;
            if (c.bitolaNeutro) avisoCor += ` Neutro deve ser <strong style="color:#1565c0;">Azul-claro</strong> (cor diferente da fase).`;
            if (c.bitolaTerra) avisoCor += ` Terra deve ser <strong style="color:#2e7d32;">Verde ou Verde-Amarelo</strong>.`;
            avisoCor += `</div>`;
        }

        html += `
            <div class="card-result" style="margin-bottom: 10px; border-left: 4px solid #007bff; padding: 12px; background: #f8f9fa;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${c.nome}</strong>
                    <button onclick="removerCircuito(${index})" style="background-color:#dc3545; color: white; border: none; padding: 4px 10px; font-size:12px; border-radius:4px; cursor: pointer;">Remover</button>
                </div>
                <small style="color: #555;">Potência: ${c.potencia}W | Distância: ${c.distancia}m</small><br>
                <small style="font-size: 13px;">👉 <strong>Condutores:</strong> ${textoCondutores} <br> Disjuntor: <strong>${c.disjuntor}</strong></small>
                <div style="margin-top:8px; padding:8px; background:#fff; border:1px dashed #ccc; border-radius:4px; font-size:13px;">
                    <strong>📏 Quanto comprar deste circuito:</strong><br>${listaCabosHtml}
                </div>
                ${avisoCor}
            </div>`;
    });
    container.innerHTML = html;
}

function removerCircuito(index) {
    orcamentoAtual.circuitos.splice(index, 1);
    renderizarCircuitosOrcamento();
    if (!DOM['resultado-geral-orcamento'].classList.contains('hidden')) atualizarTotalGeral();
}

function fecharOrcamento() {
    if (orcamentoAtual.circuitos.length === 0 && orcamentoAtual.materiaisAvulsos.length === 0) {
        alert("Adicione pelo menos um item.");
        return;
    }

    if (!exigirLicencaOuRedirecionar()) return;

    orcamentoAtual.maoDeObra = parseFloat(DOM.valor_mao_de_obra.value) || 0;
    orcamentoAtual.outrosMateriais = parseFloat(DOM.valor_outros_materiais.value) || 0;

    DOM['resultado-geral-orcamento'].classList.remove('hidden');
    atualizarTotalGeral();
}

function atualizarTotalGeral() {
    const totalGeral = orcamentoAtual.maoDeObra + orcamentoAtual.outrosMateriais;
    DOM['total-geral-reais'].innerText = 'R$ ' + totalGeral.toFixed(2).replace('.', ',');
}

function enviarWhatsApp() {
    if (!exigirLicencaOuRedirecionar()) return;

    let texto = "*Orçamento Elétrico - FD.tech*%0A%0A";

    if (orcamentoAtual.circuitos.length > 0) {
        texto += "*Lista de Materiais por Circuito:*%0A";
        orcamentoAtual.circuitos.forEach(c => {
            const resumoCabos = montarResumoCondutores(c, true);
            const listaCabosTexto = montarListaCabosCircuito(c, '%0A');

            texto += `• *${c.nome}*:%0A  - Condutores: ${resumoCabos}%0A  - Disjuntor: ${c.disjuntor} | Distância: ${c.distancia}m%0A`;
            texto += `  📏 *Quanto comprar:*%0A${listaCabosTexto}%0A`;
            if (c.materiaisAdicionais && c.materiaisAdicionais.length > 0) {
                texto += `  - Extras: ${c.materiaisAdicionais.join(', ')}%0A`;
            }
            texto += `%0A`;
        });

        // Lista consolidada: soma a metragem de cada condutor (função+bitola+cor) entre todos
        // os circuitos, pra ele comprar o rolo certo sem precisar somar na mão.
        const totalConsolidado = consolidarMetragemTotal();
        if (totalConsolidado.length > 0) {
            texto += "*🛒 Lista de Compra Consolidada (Cabos):*%0A";
            totalConsolidado.forEach(item => {
                texto += `- ${item.funcao} ${item.bitola}mm² (cor: ${item.cor}): ${item.metros}m no total%0A`;
            });
            texto += "%0A";
        }
    }

    if (orcamentoAtual.materiaisAvulsos.length > 0) {
        texto += "*Materiais Adicionais Gerais:*%0A";
        orcamentoAtual.materiaisAvulsos.forEach(m => {
            const tagCor = m.cor ? ` (cor: ${m.cor})` : '';
            texto += `- ${m.qtd}x ${m.nome}${tagCor}%0A`;
        });
        texto += "%0A";
    }

    // Aviso geral de cores, se algum circuito usar Neutro ou Terra
    const usaNeutroOuTerra = orcamentoAtual.circuitos.some(c => c.bitolaNeutro || c.bitolaTerra);
    if (usaNeutroOuTerra) {
        texto += "*⚠️ Atenção na compra dos cabos (NBR 5410):*%0A";
        texto += "- Condutor Neutro: cor Azul-claro (diferente da Fase)%0A";
        texto += "- Condutor Terra: cor Verde ou Verde-Amarelo (uso exclusivo)%0A%0A";
    }

    texto += "---%0A%0A";
    texto += `*Mão de Obra:* R$ ${orcamentoAtual.maoDeObra.toFixed(2).replace('.', ',')}%0A`;
    if (orcamentoAtual.outrosMateriais > 0) {
        texto += `*Custos Adicionais:* R$ ${orcamentoAtual.outrosMateriais.toFixed(2).replace('.', ',')}%0A`;
    }
    const totalGeral = orcamentoAtual.maoDeObra + orcamentoAtual.outrosMateriais;
    texto += `%0A*TOTAL DO SERVIÇO: R$ ${totalGeral.toFixed(2).replace('.', ',')}*`;

    window.open(`https://api.whatsapp.com/send?text=${texto}`, '_blank');
}

/**
 * Calcula a bitola reduzida do condutor Neutro conforme NBR 5410 (item 6.2.6.2.2).
 * Regra: a redução só é permitida quando a fase é MAIOR que 25 mm².
 * Abaixo ou igual a 25 mm², o Neutro deve OBRIGATORIAMENTE ter a mesma seção da Fase.
 */
function calcularBitolaReduzida(bitolaFase) {
    const fase = parseFloat(bitolaFase);
    if (isNaN(fase)) return 1.5;

    const tabelaReducao = {
        35: 25,
        50: 25,
        70: 35,
        95: 50,
        120: 70,
        150: 70,
        185: 95,
        240: 120
    };

    if (fase <= 25) return fase; // Norma proíbe redução até 25mm²
    return tabelaReducao[fase] || fase; // Se não estiver na tabela (bitola não padrão), mantém igual à fase por segurança
}

/* =========================================================
 * MÓDULO DE AUTENTICAÇÃO E LICENÇA
 * ========================================================= */

let statusConta = {
    logado: false,
    email: null,
    temLicencaAtiva: false
};

function registrarEventosAuth() {
    if (DOM['btnLogin']) DOM['btnLogin'].addEventListener('click', fazerLogin);
    if (DOM['btnCadastro']) DOM['btnCadastro'].addEventListener('click', fazerCadastro);
    if (DOM['btnAtivarLicenca']) DOM['btnAtivarLicenca'].addEventListener('click', ativarLicenca);
    if (DOM['btnLogout']) DOM['btnLogout'].addEventListener('click', fazerLogout);
}

function mostrarFormulario(qual) {
    const ehLogin = qual === 'login';
    DOM['form-login'].classList.toggle('hidden', !ehLogin);
    DOM['form-cadastro'].classList.toggle('hidden', ehLogin);
    DOM['btn-toggle-login'].classList.toggle('active', ehLogin);
    DOM['btn-toggle-cadastro'].classList.toggle('active', !ehLogin);
}

async function fazerCadastro() {
    const email = DOM['cadastro_email']?.value.trim();
    const senha = DOM['cadastro_senha']?.value;
    DOM['erro-cadastro'].innerText = '';

    if (!email || !senha) {
        DOM['erro-cadastro'].innerText = 'Preencha email e senha.';
        return;
    }

    try {
        const response = await fetch(CONFIG.ENDPOINTS.AUTH_REGISTRO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const data = await response.json();

        if (!response.ok) {
            DOM['erro-cadastro'].innerText = data.error || 'Erro ao criar conta.';
            return;
        }

        salvarSessao(data.token, data.email);
        await atualizarTelaConta();
    } catch (err) {
        console.error('Erro no cadastro:', err);
        DOM['erro-cadastro'].innerText = 'Não foi possível conectar ao servidor.';
    }
}

async function fazerLogin() {
    const email = DOM['login_email']?.value.trim();
    const senha = DOM['login_senha']?.value;
    DOM['erro-login'].innerText = '';

    if (!email || !senha) {
        DOM['erro-login'].innerText = 'Preencha email e senha.';
        return;
    }

    try {
        const response = await fetch(CONFIG.ENDPOINTS.AUTH_LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const data = await response.json();

        if (!response.ok) {
            DOM['erro-login'].innerText = data.error || 'Email ou senha incorretos.';
            return;
        }

        salvarSessao(data.token, data.email);
        await atualizarTelaConta();
    } catch (err) {
        console.error('Erro no login:', err);
        DOM['erro-login'].innerText = 'Não foi possível conectar ao servidor.';
    }
}

function fazerLogout() {
    localStorage.removeItem('fdtech_token');
    localStorage.removeItem('fdtech_email');
    statusConta = { logado: false, email: null, temLicencaAtiva: false };
    atualizarTelaConta();
}

function salvarSessao(token, email) {
    localStorage.setItem('fdtech_token', token);
    localStorage.setItem('fdtech_email', email);
}

function obterToken() {
    return localStorage.getItem('fdtech_token');
}

async function ativarLicenca() {
    const chave = DOM['input_chave_licenca']?.value.trim();
    DOM['erro-licenca'].innerText = '';

    if (!chave) {
        DOM['erro-licenca'].innerText = 'Digite a chave de licença.';
        return;
    }

    try {
        const response = await fetch(CONFIG.ENDPOINTS.AUTH_ATIVAR_LICENCA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${obterToken()}`
            },
            body: JSON.stringify({ chave })
        });
        const data = await response.json();

        if (!response.ok) {
            DOM['erro-licenca'].innerText = data.error || 'Não foi possível ativar a licença.';
            return;
        }

        alert('Licença ativada com sucesso! 🎉');
        await atualizarTelaConta();
    } catch (err) {
        console.error('Erro ao ativar licença:', err);
        DOM['erro-licenca'].innerText = 'Não foi possível conectar ao servidor.';
    }
}

// Consulta o backend pra saber se o token é válido e se a licença está ativa.
// Chamada no carregamento da página e depois de qualquer ação de login/cadastro/ativação.
async function atualizarTelaConta() {
    const token = obterToken();

    if (!token) {
        statusConta = { logado: false, email: null, temLicencaAtiva: false };
        renderizarTelaConta();
        return;
    }

    try {
        const response = await fetch(CONFIG.ENDPOINTS.AUTH_STATUS, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            // Token expirado ou inválido — desloga silenciosamente
            fazerLogout();
            return;
        }

        const data = await response.json();
        statusConta = {
            logado: true,
            email: data.email,
            temLicencaAtiva: data.temLicencaAtiva
        };
        renderizarTelaConta();

    } catch (err) {
        console.error('Erro ao checar status da conta:', err);
        // Falha de rede: mantém o usuário "logado" localmente, mas sem confirmar licença
    }
}

function renderizarTelaConta() {
    if (!DOM['bloco-deslogado']) return; // tela de conta pode não existir em todas as páginas

    DOM['bloco-deslogado'].classList.toggle('hidden', statusConta.logado);
    DOM['bloco-logado'].classList.toggle('hidden', !statusConta.logado);

    if (statusConta.logado) {
        DOM['texto-email-logado'].innerText = statusConta.email;
        DOM['bloco-sem-licenca'].classList.toggle('hidden', statusConta.temLicencaAtiva);
        DOM['bloco-com-licenca'].classList.toggle('hidden', !statusConta.temLicencaAtiva);
    }

    // Indicador visual no botão da aba (👤 vira ✅ quando licença ativa)
    if (DOM['indicador-conta']) {
        if (statusConta.logado && statusConta.temLicencaAtiva) {
            DOM['indicador-conta'].innerText = '✅ Conta';
        } else if (statusConta.logado) {
            DOM['indicador-conta'].innerText = '⚠️ Conta';
        } else {
            DOM['indicador-conta'].innerText = '👤 Conta';
        }
    }
}

// Checa se o usuário pode usar uma função paga. Se não puder, leva ele pra aba de Conta
// com a explicação certa (precisa logar OU precisa ativar licença).
function exigirLicencaOuRedirecionar() {
    if (!statusConta.logado) {
        alert('Você precisa criar uma conta ou entrar para usar esta função.');
        abrirAba('conta');
        return false;
    }
    if (!statusConta.temLicencaAtiva) {
        alert('Esta função exige uma licença ativa. Ative sua chave na aba Conta.');
        abrirAba('conta');
        return false;
    }
    return true;
}