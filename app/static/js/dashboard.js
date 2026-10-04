const $ = (id) => document.getElementById(id);
const num = (v, d = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(Number(v || 0));
const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let market;
let logPollingTimer = null;
let logPollingPaused = false;
let logEvents = [];

function enabled() {
  return [...document.querySelectorAll('[data-indicator]:checked')].map(x => x.dataset.indicator);
}

function bars(items, target) {
  if (!items || !items.length) {
    target.innerHTML = '<p class="empty" style="color:var(--text-muted); font-size:11px;">Tidak ada data.</p>';
    return;
  }
  let max = Math.max(...items.map(x => x.value), 1);
  target.innerHTML = items.map(x => `
    <div class="bar" style="margin-bottom:6px;">
      <div style="display:flex; justify-between; font-size:11px; margin-bottom:2px;">
        <span>${esc(x.label)}</span>
        <span style="font-family:var(--font-mono);">${num(x.value)}</span>
      </div>
      <div style="background:rgba(255,255,255,0.05); height:4px; border-radius:2px; overflow:hidden;">
        <div style="background:var(--gold); width:${(x.value / max) * 100}%; height:100%;"></div>
      </div>
    </div>
  `).join('');
}

function feed(items, target, render, empty) {
  if (!target) return;
  target.innerHTML = items && items.length ? items.map(render).join('') : `<p class="empty" style="color:var(--text-muted); font-size:11px;">${empty}</p>`;
}

function drawLine(ctx, c, key, color, y, left, width) {
  ctx.beginPath();
  let on = false;
  c.forEach((x, i) => {
    if (x[key] == null) return;
    let px = left + (i / (c.length - 1)) * width;
    let py = y(x[key]);
    on ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), on = true);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function draw() {
  if (!market?.candles?.length || !$('market-chart')) return;
  let c = market.candles, canvas = $('market-chart'), r = canvas.getBoundingClientRect(), s = devicePixelRatio || 1;
  canvas.width = r.width * s;
  canvas.height = r.height * s;
  let ctx = canvas.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  let p = { t: 16, r: 65, b: 28, l: 10 }, w = r.width - p.l - p.r, h = r.height - p.t - p.b;
  let e = enabled();
  let vals = c.flatMap(x => [x.low, x.high, e.includes('bollinger') ? x.bb_lower : null, e.includes('bollinger') ? x.bb_upper : null]).filter(Number.isFinite);
  let lo = Math.min(...vals), hi = Math.max(...vals), range = hi - lo || 1;
  let y = v => p.t + ((hi - v) / range) * h;

  ctx.clearRect(0, 0, r.width, r.height);
  ctx.font = '10px monospace';

  for (let i = 0; i < 5; i++) {
    let py = p.t + (h * i) / 4;
    ctx.strokeStyle = '#2b3139';
    ctx.beginPath();
    ctx.moveTo(p.l, py);
    ctx.lineTo(p.l + w, py);
    ctx.stroke();
    ctx.fillStyle = '#848e9c';
    ctx.fillText(num(hi - (range * i) / 4, 2), p.l + w + 7, py + 3);
  }

  if (e.includes('bollinger')) {
    drawLine(ctx, c, 'bb_upper', '#f0b90b', y, p.l, w);
    drawLine(ctx, c, 'bb_lower', '#f0b90b', y, p.l, w);
  }
  if (e.includes('sma_20')) drawLine(ctx, c, 'sma_20', '#f0b90b', y, p.l, w);
  if (e.includes('ema_50')) drawLine(ctx, c, 'ema_50', '#0ecb81', y, p.l, w);

  let step = w / c.length, bw = Math.max(1, step * .6);
  c.forEach((x, i) => {
    let px = p.l + (i + .5) * step, up = x.close >= x.open;
    ctx.strokeStyle = ctx.fillStyle = up ? '#0ecb81' : '#f6465d';
    ctx.beginPath();
    ctx.moveTo(px, y(x.high));
    ctx.lineTo(px, y(x.low));
    ctx.stroke();
    let top = y(Math.max(x.open, x.close));
    ctx.fillRect(px - bw / 2, top, bw, Math.max(1, Math.abs(y(x.open) - y(x.close))));
    if (e.includes('trade_signals') && x.trade_signal) {
      ctx.fillStyle = x.trade_signal === 'BUY' ? '#0ecb81' : '#f6465d';
      ctx.fillText(x.trade_signal, px - 10, x.trade_signal === 'BUY' ? y(x.low) + 16 : y(x.high) - 8);
    }
  });

  let last = c.at(-1), change = ((last.close - c[0].open) / c[0].open) * 100;
  if ($('market-price')) $('market-price').textContent = `${market.symbol} ${num(last.close, 2)}`;
  if ($('market-change')) $('market-change').textContent = `${change >= 0 ? '+' : ''}${num(change, 2)}%`;
  if ($('ticker-xau')) {
    $('ticker-xau').textContent = `${num(last.close, 2)} ${change >= 0 ? '+' : ''}${num(change, 2)}%`;
    $('ticker-xau').style.color = change >= 0 ? '#0ecb81' : '#f6465d';
  }
}

async function loadMarket() {
  try {
    let symbol = $('market-symbol')?.value || 'XAUUSDm';
    let interval = $('market-interval')?.value || '1h';
    let res = await fetch(`/api/market/chart?symbol=${symbol}&interval=${interval}`);
    let data = await res.json();
    if (!res.ok) throw Error(data.detail);
    market = data;
    if ($('market-source')) $('market-source').textContent = `${data.provider} / ${data.interval}`;
    draw();
  } catch (e) {
    if ($('market-source')) $('market-source').textContent = e.message || 'Connection unavailable';
  }
}

function renderDashboard(d) {
  let o = d.overview || {};
  if ($('avg-confluence')) $('avg-confluence').textContent = o.average_confluence ? `${num(o.average_confluence, 1)}%` : '-';
  if ($('latest-regime')) $('latest-regime').textContent = o.latest_regime || 'No data';
  if ($('updated')) $('updated').textContent = `Updated ${new Date(d.generated_at).toLocaleString()}`;
  
  let sig = d.open_signal_feed || [];
  if ($('signal-feed-count')) $('signal-feed-count').textContent = `${sig.length} items`;
  if ($('signal-feed')) feed(sig, $('signal-feed'), x => `<div class="row" style="margin-bottom:8px; font-size:12px;"><div><strong>${esc(x.symbol)}</strong> / ${esc(x.direction)}<div class="meta" style="color:var(--text-muted); font-size:10px;">Entry ${num(x.entry, 2)} | Stop ${num(x.stop_loss, 2)}</div></div><b class="badge" style="background:rgba(255,255,255,0.1);">${esc(x.status)}</b></div>`, 'Belum ada sinyal terbuka.');
  if ($('confluence-feed')) feed(d.confluence_feed || [], $('confluence-feed'), x => `<div class="row" style="margin-bottom:8px; font-size:12px;"><div>Signal #${x.signal_id} - Score ${num(x.total, 1)}<div class="meta" style="color:var(--text-muted); font-size:10px;">Trend ${num(x.trend_score, 1)} | Momentum ${num(x.momentum_score, 1)}</div></div></div>`, 'Belum ada skor confluence.');
  
  let risk = d.risk_feed || [];
  if ($('risk-feed-count')) $('risk-feed-count').textContent = `${risk.length} events`;
  if ($('risk-feed')) feed(risk, $('risk-feed'), x => `<div class="row" style="margin-bottom:8px; font-size:12px;"><div><strong>${esc(x.event_type || 'Risk event')}</strong><div class="meta" style="color:var(--text-muted); font-size:10px;">${esc(x.action_taken || 'No action')}</div></div><b class="badge ${x.resolved ? '' : 'risk'}" style="background:${x.resolved ? 'rgba(14,203,129,0.15)' : 'rgba(246,70,93,0.15)'}; color:${x.resolved ? '#0ecb81' : '#f6465d'};">${x.resolved ? 'resolved' : 'active'}</b></div>`, 'Tidak ada event risiko.');
}

async function loadDashboard() {
  try {
    let r = await fetch('/api/dashboard/summary');
    if (!r.ok) throw Error('Dashboard unavailable');
    renderDashboard(await r.json());
  } catch (e) {
    if ($('updated')) $('updated').textContent = e.message;
  }
}

/* AI Analysis trigger */
async function runAiAnalysis() {
  let btn = $('run-ai-btn');
  if (!btn) return;
  let symbol = $('market-symbol')?.value || 'XAUUSDm';
  let interval = $('market-interval')?.value || '1h';
  btn.disabled = true;
  btn.innerHTML = '<span class="sparkle">⏳</span> Menganalisis...';
  try {
    let res = await fetch(`/api/ai/analyze?symbol=${symbol}&interval=${interval}`);
    let data = await res.json();
    if (!res.ok) throw Error(data.detail || 'Gagal analisis AI');
    
    if ($('ai-result-box')) $('ai-result-box').style.display = 'block';
    if ($('ai-provider-tag')) $('ai-provider-tag').textContent = data.provider || 'AI Engine';
    if ($('ai-bias-badge')) {
      $('ai-bias-badge').textContent = `${data.bias} SCENARIO`;
      $('ai-bias-badge').className = `badge ${data.bias === 'LONG' ? 'buy' : data.bias === 'SHORT' ? 'danger' : 'muted'}`;
    }
    if ($('ai-confidence-val')) $('ai-confidence-val').textContent = `Confidence: ${data.confidence}%`;
    
    if ($('ai-levels-list') && data.scenarios?.main) {
      let m = data.scenarios.main;
      $('ai-levels-list').innerHTML = `
        <span>Entry: <strong>${num(m.entry_min, 2)} - ${num(m.entry_max, 2)}</strong></span>
        <span>SL: <strong style="color:var(--red);">${num(m.stop_loss, 2)}</strong></span>
        <span>TP1: <strong style="color:var(--green);">${num(m.take_profit_1, 2)}</strong></span>
      `;
    }
    if ($('ai-reasons-list') && data.rationale) {
      $('ai-reasons-list').innerHTML = data.rationale.map(r => `<li>${esc(r)}</li>`).join('');
    }
  } catch (err) {
    alert(`Analisis Gagal: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="sparkle">✨</span> Analisis Chart Aktif';
  }
}

/* Log Diagnostics (On-Demand) */
async function fetchDiagnostics() {
  if (logPollingPaused) return;
  try {
    let res = await fetch('/api/diagnostics');
    if (!res.ok) return;
    let data = await res.json();
    logEvents = data.events || [];
    renderLogs();
  } catch (e) {
    // Ignore transient network errors
  }
}

function renderLogs() {
  let tbody = $('log-events-tbody');
  if (!tbody) return;
  let level = $('log-level-filter')?.value || 'ALL';
  let query = ($('log-search-input')?.value || '').toLowerCase();

  let filtered = logEvents.filter(ev => {
    if (level !== 'ALL' && ev.level !== level) return false;
    if (query && !ev.message.toLowerCase().includes(query) && !ev.source.toLowerCase().includes(query)) return false;
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">Tidak ada event log yang sesuai.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(ev => `
    <tr>
      <td style="color:var(--text-muted);">${new Date(ev.timestamp).toLocaleTimeString()}</td>
      <td class="log-level-${ev.level}"><strong>${esc(ev.level)}</strong></td>
      <td style="color:var(--gold);">${esc(ev.source)}</td>
      <td>${esc(ev.message)}</td>
    </tr>
  `).join('');
}

/* Tab Switching */
function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(tc => {
    tc.classList.toggle('active', tc.id === tabId);
  });

  // Start/stop diagnostics log polling on demand
  if (tabId === 'tab-logs') {
    fetchDiagnostics();
    if (!logPollingTimer) logPollingTimer = setInterval(fetchDiagnostics, 5000);
  } else {
    if (logPollingTimer) {
      clearInterval(logPollingTimer);
      logPollingTimer = null;
    }
  }

  // Trigger chart draw if workspace tab activated
  if (tabId === 'tab-workspace') {
    setTimeout(draw, 50);
  }
}

// Event Listeners
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});

if ($('market-symbol')) $('market-symbol').onchange = loadMarket;
if ($('market-interval')) $('market-interval').onchange = loadMarket;
if ($('run-ai-btn')) $('run-ai-btn').onclick = runAiAnalysis;

if ($('log-level-filter')) $('log-level-filter').onchange = renderLogs;
if ($('log-search-input')) $('log-search-input').oninput = renderLogs;

if ($('toggle-log-polling')) {
  $('toggle-log-polling').onclick = () => {
    logPollingPaused = !logPollingPaused;
    $('toggle-log-polling').textContent = logPollingPaused ? 'Lanjutkan Polling' : 'Jeda Polling';
  };
}

if ($('export-logs-btn')) {
  $('export-logs-btn').onclick = () => {
    let blob = new Blob([JSON.stringify(logEvents, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `log_diagnostik_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

document.querySelectorAll('[data-indicator]').forEach(x => x.onchange = draw);
addEventListener('resize', draw);

// Initial Load
loadDashboard();
loadMarket();
setInterval(loadMarket, 30000);
