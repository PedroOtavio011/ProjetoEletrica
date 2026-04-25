// Variável global para armazenar os dados do JSON
let basePotencias = [];

// 1. Carregar os dados do JSON assim que a página abre
fetch('potencias.json')
    .then(response => response.json())
    .then(data => {
        basePotencias = data;
        console.log("Dicionário de potências carregado com sucesso!");
    })
    .catch(error => console.error("Erro ao carregar o JSON:", error));

// --- LÓGICA DAS ABAS ---
function abrirAba(nomeAba) {
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.add('hidden');
    });
    
    document.getElementById(nomeAba).classList.remove('hidden');

    // Ajusta o estilo visual dos botões das abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Adiciona classe ativa ao botão clicado (baseado no texto)
    event.currentTarget.classList.add('active');
}

// --- LÓGICA DE BUSCA NO DICIONÁRIO ---
const inputBusca = document.getElementById('inputBusca');
const btnBuscar = document.getElementById('btnBuscarWatts');
const containerResultados = document.getElementById('containerResultados');
const listaResultados = document.getElementById('listaResultados');

btnBuscar.addEventListener('click', () => {
    const termo = inputBusca.value.toLowerCase().trim();
    
    if (termo.length < 2) {
        alert("Digite pelo menos 2 letras para buscar.");
        return;
    }

    // Filtra os itens que contêm o termo digitado
    const filtrados = basePotencias.filter(item => 
        item.nome.toLowerCase().includes(termo) || 
        item.categoria.toLowerCase().includes(termo)
    );

    listaResultados.innerHTML = ""; // Limpa resultados anteriores

    if (filtrados.length > 0) {
        containerResultados.classList.remove('hidden');
        
        filtrados.forEach(item => {
            const li = document.createElement('li');
            li.className = 'item-busca';
            li.innerHTML = `
                <div>
                    <strong>${item.nome}</strong><br>
                    <small>${item.categoria}</small>
                </div>
                <strong>${item.watts}W</strong>
            `;
            
            // AÇÃO AO CLICAR NO ITEM: Preenche e volta para a calculadora
            li.onclick = () => {
                document.getElementById('potencia').value = item.watts;
                abrirAba('calculo'); // Volta para a aba principal
                containerResultados.classList.add('hidden');
                inputBusca.value = "";
                
                // Opcional: focar no campo de distância para o próximo passo
                document.getElementById('distancia').focus();
            };
            
            listaResultados.appendChild(li);
        });
    } else {
        alert("Nenhum equipamento encontrado.");
        containerResultados.classList.add('hidden');
    }
});

// --- LÓGICA DA CALCULADORA (O seu código original com ajustes) ---
const btnCalcular = document.getElementById('btnCalcular');

btnCalcular.addEventListener('click', async () => {
    const material_id = document.getElementById('material_id').value;
    const potencia = document.getElementById('potencia').value;
    const tensao = document.getElementById('tensao').value;
    const distancia = document.getElementById('distancia').value;

    if (!potencia || !distancia) {
        alert("Preencha a potência e a distância!");
        return;
    }

    try {
        const params = new URLSearchParams({ potencia, tensao, distancia, material_id });
        const response = await fetch(`http://localhost:3000/calcular?${params}`);
        const data = await response.json();

        if (response.ok) {
            document.getElementById('res-bitola').innerText = data.bitola + " mm²";
            document.getElementById('res-disjuntor').innerText = data.disjuntor;
            document.getElementById('res-queda').innerText = data.queda_tensao;
            document.getElementById('resultado').classList.remove('hidden');
        } else {
            alert(data.error || "Erro ao calcular.");
        }
    } catch (error) {
        console.error("Erro na API:", error);
        alert("Verifique se o servidor Node está rodando!");
    }
});