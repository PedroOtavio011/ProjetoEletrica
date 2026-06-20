/**
 * service-worker.js
 * Roda em segundo plano, separado da página. Responsável por:
 *  - Guardar em cache os arquivos do app (HTML, CSS, JS, ícones)
 *  - Permitir que o app abra mesmo sem internet (usando o cache)
 *  - É o que faz o navegador considerar o site "instalável"
 *
 * IMPORTANTE: Sempre que você alterar arquivos do frontend (script.js, index.html, etc.),
 * mude o número da versão abaixo (CACHE_NAME). Isso força o navegador a baixar tudo de novo
 * em vez de continuar servindo a versão antiga do cache.
 */

const CACHE_NAME = 'fdtech-cache-v1';

// Lista de arquivos essenciais para o app funcionar offline.
// A calculadora (a parte gratuita) precisa funcionar mesmo sem internet,
// então os JSONs de dados locais também entram aqui.
const ARQUIVOS_PARA_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './json/potencias.json',
    './json/guiaRapido.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png'
];

// --- INSTALAÇÃO: roda uma vez quando o service worker é registrado pela primeira vez ---
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando e guardando arquivos em cache...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ARQUIVOS_PARA_CACHE);
        })
    );
    self.skipWaiting(); // ativa o novo service worker imediatamente, sem esperar fechar todas as abas
});

// --- ATIVAÇÃO: limpa caches antigos de versões anteriores do app ---
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Ativando e limpando caches antigos...');
    event.waitUntil(
        caches.keys().then((nomesCache) => {
            return Promise.all(
                nomesCache
                    .filter((nome) => nome !== CACHE_NAME)
                    .map((nome) => caches.delete(nome))
            );
        })
    );
    self.clients.claim();
});

// --- INTERCEPTAÇÃO DE REQUISIÇÕES ---
// Toda vez que o app pede um arquivo (HTML, CSS, JS, JSON local), o service worker decide
// se serve do cache ou busca na rede. Aqui usamos uma estratégia separada por tipo de chamada:
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // As chamadas para o backend (API de cálculo, login, licença, preços) NUNCA devem
    // vir do cache — são dados dinâmicos e sensíveis, sempre precisam ir direto na rede.
    const ehChamadaDeApi = url.port === '3000' || url.pathname.startsWith('/auth') || url.pathname.startsWith('/calcular') || url.pathname.startsWith('/buscar-precos');

    if (ehChamadaDeApi) {
        // Estratégia "network only": sempre busca da rede, nunca do cache
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(
                    JSON.stringify({ error: 'Sem conexão com o servidor. Verifique sua internet.' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // Para os arquivos estáticos do app (HTML, CSS, JS, ícones, JSONs locais):
    // Estratégia "cache first, fallback para rede" — abre rápido e funciona offline.
    event.respondWith(
        caches.match(event.request).then((respostaEmCache) => {
            if (respostaEmCache) {
                return respostaEmCache;
            }
            return fetch(event.request).catch(() => {
                // Se nem o cache nem a rede tiverem o arquivo, e for navegação de página,
                // devolve a página principal como fallback.
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});