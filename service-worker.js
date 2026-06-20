const CACHE_NAME = 'fdtech-cache-v2'; // Incrementado para v2

// Lista corrigida com base na árvore de arquivos real
const ARQUIVOS_PARA_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './quadro.html',
    './quadro.css',
    './quadro.js',
    './json/potencias.json',
    './json/guiaRapido.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// --- INSTALAÇÃO ---
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando e guardando arquivos em cache...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ARQUIVOS_PARA_CACHE);
        })
    );
    self.skipWaiting();
});

// --- ATIVAÇÃO ---
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
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Melhoria sênior: Se a requisição for para o backend local (porta 3000) 
    // ou contiver rotas de autenticação/cálculo, roda estritamente na rede.
    const ehChamadaDeApi = url.port === '3000' || 
                           url.pathname.includes('/auth') || 
                           url.pathname.includes('/calcular') || 
                           url.pathname.includes('/buscar-precos');

    if (ehChamadaDeApi) {
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

    // Estratégia "Cache First, fallback para Rede" para arquivos estáticos
    event.respondWith(
        caches.match(event.request).then((respostaEmCache) => {
            if (respostaEmCache) {
                return respostaEmCache;
            }
            return fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});