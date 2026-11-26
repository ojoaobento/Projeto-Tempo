const BAIRROS = [
  // Norte
  { n: 'Jardim Alvorada',     r: 'norte',  lat: -23.3900, lon: -51.9420 },
  { n: 'Vila Morangueira',    r: 'norte',  lat: -23.3780, lon: -51.9560 },
  { n: 'Zona 7 (UEM)',        r: 'norte',  lat: -23.4075, lon: -51.9400 },
  // Centro
  { n: 'Zona 1 (Centro)',     r: 'centro', lat: -23.4205, lon: -51.9331 },
  { n: 'Zona 2',              r: 'centro', lat: -23.4140, lon: -51.9255 },
  { n: 'Zona 3',              r: 'centro', lat: -23.4260, lon: -51.9400 },
  // Leste
  { n: 'Zona 6',              r: 'leste',  lat: -23.4180, lon: -51.9040 },
  { n: 'Jardim Novo Horizonte', r: 'leste', lat: -23.4290, lon: -51.9100 },
  { n: 'Jardim Monte Carlo',  r: 'leste',  lat: -23.4400, lon: -51.9150 },
  // Oeste
  { n: 'Zona 8',              r: 'oeste',  lat: -23.4270, lon: -51.9560 },
  { n: 'Jardim Tropical',     r: 'oeste',  lat: -23.4390, lon: -51.9560 },
  { n: 'Chácaras Aeroporto',  r: 'oeste',  lat: -23.4700, lon: -52.0000 },
  // Sul
  { n: 'Jardim Aclimação',    r: 'sul',    lat: -23.4560, lon: -51.9330 },
  { n: 'Cidade Alta',         r: 'sul',    lat: -23.4500, lon: -51.9000 },
  { n: 'Zona 5',              r: 'sul',    lat: -23.4480, lon: -51.9450 }
];
const REGIOES = { norte: 'Região Norte', centro: 'Região Central', leste: 'Região Leste', oeste: 'Região Oeste', sul: 'Região Sul' };
const ROTULO = ['Tranquilo', 'Atenção', 'Risco', 'Perigo'];
const CLASSE = ['tranquilo', 'atencao', 'risco', 'perigo'];
const CIDADE = [
  'Tranquilo: sem risco previsto pelo modelo. Temporais localizados podem não aparecer.',
  'Atenção: possibilidade de chuva forte.',
  'Risco de temporal: evite sair e fique atento.',
  'Perigo: procure abrigo seguro agora.'
];
const ACAO = ['', 'Fique atento ao tempo.', 'Evite sair e afaste-se de janelas.', 'Procure abrigo seguro agora.'];
const ATUALIZAR_MIN = 10;

/* Janela de análise (em horas) */
const HORAS_FUTURO = 6;   // quantas horas à frente olhar
const HORAS_PASSADO = 2;  // quantas horas atrás olhar (chuva que acabou de cair)

/* ===== REGRAS DE NÍVEL (ajuste os limites se quiser) ===== */
const chuvaTxt = mm => mm < 0.1 ? 'Sem chuva' : mm < 2.5 ? 'Fraca' : mm < 7.6 ? 'Moderada' : mm < 20 ? 'Forte' : 'Muito forte';
const ventoTxt = kmh => kmh < 40 ? 'Fraco' : kmh < 60 ? 'Forte' : 'Muito forte';
const tempTxt = ['Baixa', 'Média', 'Alta'];

const maximo = arr => Math.max(0, ...(arr || []).map(v => v || 0));

function analisar(p) {
  const c = p.current, h = p.hourly;

  // pior caso da janela (passado recente + agora + próximas horas)
  const chuva = Math.max(c.precipitation || 0, maximo(h.precipitation));
  const vento = Math.max(c.wind_gusts_10m || 0, maximo(h.wind_gusts_10m));
  const prob = maximo(h.precipitation_probability);
  const cape = maximo(h.cape);
  const trovoada = (c.weather_code >= 95) || (h.weather_code || []).some(v => v >= 95);

  let nivel = 0;
  if (chuva >= 2.5 || vento >= 40 || prob >= 50 || cape >= 1000) nivel = 1;
  if (chuva >= 7.6 || vento >= 60 || trovoada || (cape >= 1500 && prob >= 50)) nivel = 2;
  if (chuva >= 20 || vento >= 75 || (trovoada && chuva >= 7.6)) nivel = 3;

  const chance = trovoada || (cape >= 1500 && prob >= 50) ? 2 : (cape >= 800 && prob >= 40) ? 1 : 0;
  return { nivel, chuva, vento, chance };
}

/* ===== ESTADO E ATALHOS ===== */
const $ = s => document.querySelector(s);
let dados = [];       // bairros com análise
let aberta = null;    // região aberta
let local = null;     // bairro do usuário

const km = (a, b) => {
  const r = Math.PI / 180, dx = (b.lon - a.lon) * r * Math.cos(a.lat * r), dy = (b.lat - a.lat) * r;
  return Math.sqrt(dx * dx + dy * dy) * 6371;
};

/* ===== BUSCA NA API (Open-Meteo, gratuita e sem chave) ===== */
async function carregar() {
  $('#hora').textContent = '';
  try {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + BAIRROS.map(b => b.lat).join(',')
      + '&longitude=' + BAIRROS.map(b => b.lon).join(',')
      + '&current=precipitation,wind_gusts_10m,weather_code'
      + '&hourly=precipitation,precipitation_probability,wind_gusts_10m,cape,weather_code'
      + '&past_hours=' + HORAS_PASSADO
      + '&forecast_hours=' + HORAS_FUTURO
      + '&wind_speed_unit=kmh&timezone=America%2FSao_Paulo';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let json = await res.json();
    if (!Array.isArray(json)) json = [json];
    dados = BAIRROS.map((b, i) => ({ ...b, ...analisar(json[i]) }));
    $('#hora').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    desenhar();
  } catch (e) {
    console.error(e);
    erro();
  }
}

/* ===== AGRUPAR POR REGIÃO ===== */
function regioes() {
  return Object.keys(REGIOES).map(id => {
    const bs = dados.filter(b => b.r === id).sort((a, b) => b.nivel - a.nivel || b.chuva - a.chuva);
    return {
      id, bs,
      nivel: Math.max(...bs.map(b => b.nivel)),
      chuva: Math.max(...bs.map(b => b.chuva)),
      vento: Math.max(...bs.map(b => b.vento)),
      chance: Math.max(...bs.map(b => b.chance))
    };
  }).sort((a, b) => (local ? (b.id === local.r) - (a.id === local.r) : 0) || b.nivel - a.nivel);
}

/* ===== DESENHO ===== */
function desenhar() {
  const rs = regioes();
  const pior = Math.max(...rs.map(r => r.nivel));

  const alerta = $('#alerta');
  alerta.className = 'alerta-cidade ' + CLASSE[pior];
  $('#alerta-txt').textContent = CIDADE[pior];
  $('#status-nav').className = 'pill-nav ' + CLASSE[pior];
  $('#status-nav-txt').textContent = 'Maringá: ' + ROTULO[pior];

  $('#lista').innerHTML = rs.map(r => {
    const open = aberta === r.id;
    const top = r.bs[0];
    let corpo = '';
    if (local && local.r === r.id) {
      const eu = dados.find(b => b.n === local.n);
      let msg = 'Você está perto de <strong>' + eu.n + '</strong> <span class="status ' + CLASSE[eu.nivel] + '">' + ROTULO[eu.nivel] + '</span>';
      if (eu.nivel >= 2) msg += '<br><strong>' + ACAO[eu.nivel] + '</strong>';
      else if (top.nivel > 0 && top.n !== eu.n) msg += '<br>Seu bairro está mais calmo. Chuva em ' + top.n + '.';
      corpo += '<p class="voce">' + msg + '</p>';
    }
    if (top.nivel === 0 && top.chuva < 0.1) corpo += '<p class="mais">Sem chuva nos bairros desta região.</p>';
    else corpo += '<p class="mais">Mais afetado agora</p>';
    corpo += '<ul class="bairros">' + r.bs.map(b =>
      '<li>' + b.n + '<span class="status ' + CLASSE[b.nivel] + '">' + ROTULO[b.nivel] + '</span></li>').join('') + '</ul>'
      + '<p class="nota">Previsão por bairro. Não confirma alagamentos ou danos.</p>';
    return '<article class="card-lista ' + CLASSE[r.nivel] + (local && local.r === r.id ? ' destaque' : '') + '" id="r-' + r.id + '">'
      + '<button class="cl-topo" data-r="' + r.id + '" aria-expanded="' + open + '">'
      + '<span class="cl-nome">' + REGIOES[r.id] + '<span class="status">' + ROTULO[r.nivel] + '</span></span>'
      + '<span class="sub">Chuva: ' + chuvaTxt(r.chuva) + ' · Vento: ' + ventoTxt(r.vento) + ' · Tempestade: ' + tempTxt[r.chance] + '</span>'
      + '<span class="ic material-symbols-outlined seta" aria-hidden="true">expand_more</span></button>'
      + (open ? '<div class="detalhe">' + corpo + '</div>' : '') + '</article>';
  }).join('');

  document.querySelectorAll('#mapa .regiao').forEach(el => {
    const r = rs.find(x => x.id === el.dataset.r);
    el.className = 'regiao ' + CLASSE[r.nivel] + (aberta === r.id || (local && local.r === r.id) ? ' destaque' : '');
    el.setAttribute('aria-label', REGIOES[r.id] + ': ' + ROTULO[r.nivel]);
  });
}

function erro() {
  $('#alerta').className = 'alerta-cidade neutro';
  $('#alerta-txt').textContent = 'Não foi possível carregar a previsão. Em emergência, ligue 199 ou 193.';
  $('#status-nav').className = 'pill-nav neutro';
  $('#status-nav-txt').textContent = 'Maringá: sem dados';
  $('#lista').innerHTML = '<div class="msg"><strong>Previsão indisponível.</strong><br>Verifique sua internet e tente de novo.<br><button id="tentar" type="button">Tentar novamente</button></div>';
}

/* ===== INTERAÇÕES ===== */
function alternar(id) {
  aberta = aberta === id ? null : id;
  desenhar();
  const el = $('#r-' + id);
  if (el && aberta) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-r], #tentar');
  if (!t) return;
  if (t.id === 'tentar') { $('#lista').innerHTML = '<div class="msg">Carregando...</div>'; carregar(); }
  else alternar(t.dataset.r);
});

$('#btn-local').addEventListener('click', () => {
  const btn = $('#btn-local');
  if (!navigator.geolocation) { btn.textContent = 'Localização indisponível'; return; }
  btn.textContent = 'Localizando...';
  navigator.geolocation.getCurrentPosition(pos => {
    const eu = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const perto = BAIRROS.map(b => ({ b, d: km(eu, b) })).sort((a, b) => a.d - b.d)[0];
    btn.innerHTML = '<span class="ic material-symbols-outlined" aria-hidden="true">my_location</span> Usar minha localização';
    if (perto.d > 25) { alert('Você parece estar fora de Maringá. Mostrando a previsão da cidade.'); return; }
    local = perto.b; aberta = local.r;
    desenhar();
    $('#lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, () => {
    btn.innerHTML = '<span class="ic material-symbols-outlined" aria-hidden="true">my_location</span> Usar minha localização';
    alert('Não foi possível obter sua localização. Verifique a permissão do navegador.');
  }, { enableHighAccuracy: false, timeout: 10000 });
});

/* ===== INÍCIO ===== */
$('#zap').href = 'https://wa.me/?text=' + encodeURIComponent('Veja onde está o temporal em Maringá e como pedir ajuda: ' + location.href);
$('#lista').innerHTML = '<div class="msg">Carregando a previsão...</div>';
carregar();
setInterval(carregar, ATUALIZAR_MIN * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });