const $=id=>document.getElementById(id),num=(v,d=0)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(Number(v||0)),esc=v=>String(v??'-').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let market;
function enabled(){return [...document.querySelectorAll('[data-indicator]:checked')].map(x=>x.dataset.indicator)}
function bars(items,target){if(!items.length){target.innerHTML='<p class="empty">No records available.</p>';return}let max=Math.max(...items.map(x=>x.value),1);target.innerHTML=items.map(x=>`<div class="bar"><span>${esc(x.label)}</span><div class="track"><div class="fill" style="width:${x.value/max*100}%"></div></div><span>${num(x.value)}</span></div>`).join('')}
function feed(items,target,render,empty){target.innerHTML=items.length?items.map(render).join(''):`<p class="empty">${empty}</p>`}
function drawLine(ctx,c,key,color,y,left,width){ctx.beginPath();let on=false;c.forEach((x,i)=>{if(x[key]==null)return;let px=left+i/(c.length-1)*width,py=y(x[key]);on?ctx.lineTo(px,py):(ctx.moveTo(px,py),on=true)});ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.stroke()}
function draw(){if(!market?.candles?.length)return;let c=market.candles,canvas=$('market-chart'),r=canvas.getBoundingClientRect(),s=devicePixelRatio||1;canvas.width=r.width*s;canvas.height=r.height*s;let ctx=canvas.getContext('2d');ctx.setTransform(s,0,0,s,0,0);let p={t:16,r:65,b:28,l:10},w=r.width-p.l-p.r,h=r.height-p.t-p.b,e=enabled(),vals=c.flatMap(x=>[x.low,x.high,e.includes('bollinger')?x.bb_lower:null,e.includes('bollinger')?x.bb_upper:null]).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals),range=hi-lo||1,y=v=>p.t+(hi-v)/range*h;ctx.clearRect(0,0,r.width,r.height);ctx.font='10px monospace';for(let i=0;i<5;i++){let py=p.t+h*i/4;ctx.strokeStyle='#2b3139';ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(p.l+w,py);ctx.stroke();ctx.fillStyle='#848e9c';ctx.fillText(num(hi-range*i/4,2),p.l+w+7,py+3)}if(e.includes('bollinger')){drawLine(ctx,c,'bb_upper','#f0b90b',y,p.l,w);drawLine(ctx,c,'bb_lower','#f0b90b',y,p.l,w)}if(e.includes('sma_20'))drawLine(ctx,c,'sma_20','#f0b90b',y,p.l,w);if(e.includes('ema_50'))drawLine(ctx,c,'ema_50','#0ecb81',y,p.l,w);let step=w/c.length,bw=Math.max(1,step*.6);c.forEach((x,i)=>{let px=p.l+(i+.5)*step,up=x.close>=x.open;ctx.strokeStyle=ctx.fillStyle=up?'#0ecb81':'#f6465d';ctx.beginPath();ctx.moveTo(px,y(x.high));ctx.lineTo(px,y(x.low));ctx.stroke();let top=y(Math.max(x.open,x.close));ctx.fillRect(px-bw/2,top,bw,Math.max(1,Math.abs(y(x.open)-y(x.close))));if(e.includes('trade_signals')&&x.trade_signal){ctx.fillStyle=x.trade_signal==='BUY'?'#0ecb81':'#f6465d';ctx.fillText(x.trade_signal,px-10,x.trade_signal==='BUY'?y(x.low)+16:y(x.high)-8)}});let last=c.at(-1),change=(last.close-c[0].open)/c[0].open*100;$('market-price').textContent=`${market.symbol} ${num(last.close,2)}`;$('market-change').textContent=`${change>=0?'+':''}${num(change,2)}%`;$('ticker-xau').textContent=`${num(last.close,2)} ${change>=0?'+':''}${num(change,2)}%`;$('ticker-xau').style.color=change>=0?'#0ecb81':'#f6465d'}
async function loadMarket(){try{let res=await fetch(`/api/market/chart?symbol=${$('market-symbol').value}&interval=${$('market-interval').value}`);let data=await res.json();if(!res.ok)throw Error(data.detail);market=data;if(!$('market-chart'))$('chart-wrap').innerHTML='<canvas id="market-chart"></canvas>';$('market-source').textContent=`${data.provider} / ${data.interval}`;draw()}catch(e){$('chart-wrap').innerHTML=`<p class="empty">${esc(e.message)}</p>`;$('market-source').textContent='Connection unavailable'}}
function render(d){let o=d.overview||{};
  if($('total-signals')) $('total-signals').textContent=num(o.total_signals);
  if($('open-signals')) $('open-signals').textContent=num(o.open_signals);
  if($('risk-alerts')) $('risk-alerts').textContent=num(o.risk_alerts);
  if($('avg-confluence')) $('avg-confluence').textContent=num(o.average_confluence,1);
  if($('high-confidence')) $('high-confidence').textContent=num(o.high_confidence_signals);
  if($('latest-regime')) $('latest-regime').textContent=o.latest_regime||'No data';
  if($('updated')) $('updated').textContent=`Updated ${new Date(d.generated_at).toLocaleString()}`;
  if($('signal-chart')) bars(d.signal_status||[],$('signal-chart'));
  if($('regime-chart')) bars(d.regime_distribution||[],$('regime-chart'));
  let sig=d.open_signal_feed||[];
  if($('signal-feed-count')) $('signal-feed-count').textContent=`${sig.length} items`;
  if($('signal-feed')) feed(sig,$('signal-feed'),x=>`<div class="row"><div>${esc(x.symbol)} / ${esc(x.direction)}<div class="meta">Entry ${num(x.entry,5)} | Stop ${num(x.stop_loss,5)}</div></div><b class="badge">${esc(x.status)}</b></div>`,'No open signals.');
  if($('confluence-feed')) feed(d.confluence_feed||[],$('confluence-feed'),x=>`<div class="row"><div>Signal #${x.signal_id} - ${num(x.total,1)}<div class="meta">Trend ${num(x.trend_score,1)} | Momentum ${num(x.momentum_score,1)}</div></div><b class="badge">${esc(x.flag||'scored')}</b></div>`,'No confluence scores.');
  if($('regime-feed')) feed(d.latest_regimes||[],$('regime-feed'),x=>`<div class="row"><div>${esc(x.symbol)} - ${esc(x.regime)}<div class="meta">Score ${num(x.regime_score,2)} | ${esc(x.volatility_state||'n/a')}</div></div></div>`,'No regime readings.');
  let risk=d.risk_feed||[];
  if($('risk-feed-count')) $('risk-feed-count').textContent=`${risk.length} events`;
  if($('risk-feed')) feed(risk,$('risk-feed'),x=>`<div class="row"><div>${esc(x.event_type||'Risk event')}<div class="meta">Trigger ${num(x.trigger_value,2)} | ${esc(x.action_taken||'No action')}</div></div><b class="badge ${x.resolved?'':'risk'}">${x.resolved?'resolved':'active'}</b></div>`,'No risk events.');
}
async function loadDashboard(){try{let r=await fetch('/api/dashboard/summary');if(!r.ok)throw Error('Dashboard unavailable');render(await r.json())}catch(e){$('updated').textContent=e.message}}
function refresh(){loadDashboard();loadMarket()}
if($('refresh')) $('refresh').onclick=refresh;
if($('market-symbol')) $('market-symbol').onchange=loadMarket;
if($('market-interval')) $('market-interval').onchange=loadMarket;
document.querySelectorAll('[data-indicator]').forEach(x=>x.onchange=draw);
addEventListener('resize',draw);
refresh();
setInterval(loadMarket,30000);

// Placeholder UI interactivity
document.querySelectorAll('.mode-btn, .seg-btn').forEach(btn => {
  btn.onclick = (e) => {
    e.target.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  };
});

