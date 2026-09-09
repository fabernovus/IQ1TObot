import { BANDS, MODES, locatorFromGPS, validateSpot, formatFrequency } from './radio.js';
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
let locator = '', mine = null, busy = false, loading = false, authenticated = false;
let requestId = crypto.randomUUID();
const status = (text,error=false) => { $('status').textContent=text; $('status').classList.toggle('error',error); };
for (const [band] of BANDS) $('band').add(new Option(`${band.replace('.',',')} m`,band));
for (const mode of MODES) $('mode').add(new Option(mode,mode));
$('band').value = '40'; $('mode').value = 'Fonia';
function bandHint() {
  const b = BANDS.find(b=>b[0]===$('band').value);
  $('frequency-hint').textContent=`Da ${formatFrequency(b[1])} a ${formatFrequency(b[2])} MHz`;
}
$('band').addEventListener('change',bandHint); bandHint();
try { $('callsign').value=localStorage.getItem('iq1to-callsign') || ''; } catch {}
function locks() {
  $('fields').disabled=!authenticated || busy;
  $('refresh').disabled=!authenticated || busy || loading;
  $('qrt').disabled=busy;
}
async function api(path,method='GET',payload) {
  const response=await fetch(`/api${path}`,{method,headers:{'X-Telegram-Init-Data':initData || '',...(payload ? {'Content-Type':'application/json'}:{})},body:payload ? JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok) {
    if(response.status===401 || response.status===403) { authenticated=false; locks(); }
    throw new Error(data.error || 'Richiesta non riuscita.');
  }
  return data;
}
function card(spot,own=false) {
  const el=document.createElement('article');el.className='spot';
  const top=document.createElement('div');top.className='spot-top';
  const call=document.createElement('span');call.className='callsign';call.textContent=spot.callsign;
  const badge=document.createElement('span');badge.className='badge';badge.textContent=`${spot.band} m · ${spot.mode}`;
  top.append(call,badge);
  const freq=document.createElement('div');freq.className='frequency';freq.textContent=`${formatFrequency(spot.frequency_hz)} MHz`;
  const meta=document.createElement('div');meta.className='spot-meta';
  meta.textContent=`${spot.locator} · ${new Date(spot.created_at*1000).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${own ? ' · Il tuo SPOT' : ''}`;
  el.append(top,freq,meta);return el;
}
async function refresh(quiet=false) {
  if(loading) return;
  loading=true; locks();
  try {
    const data=await api('/spots');authenticated=true;mine=data.mine;
    const active=mine && !mine.ended_at;
    $('composer').hidden=!!active; $('my-spot').hidden=!active;
    $('my-details').replaceChildren(...(active ? [card(mine)] : []));
    $('spots').replaceChildren(...data.spots.map(s=>card(s,s.id===mine?.id)));
    if(!data.spots.length) { const p=document.createElement('p');p.className='empty';p.textContent='Nessuno SPOT attivo. Ci sentiamo in radio?';$('spots').append(p); }
    $('count').textContent=data.spots.length===200 ? '200+' : data.spots.length;
    $('updated').textContent=`Aggiornato alle ${new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · ogni minuto`;
    if(mine?.sync_state==='failed') status('SPOT salvato, ma la notifica Telegram non è riuscita. Contatta un amministratore.',true);
    else if(mine && mine.sync_state!=='synced') status('SPOT salvato. Aggiornamento del topic in corso…');
    else if(!quiet) status(active ? 'Il tuo SPOT è attivo nel gruppo.' : 'Annuncia la tua presenza nel topic CQ Spot.');
    else if($('status').textContent.includes('in corso')) status('Topic aggiornato.');
  } finally { loading=false;locks(); }
}
function browserGPS() {
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error('GPS non disponibile su questo dispositivo.'));
    navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),()=>reject(new Error('Posizione non disponibile. Abilita il GPS e consenti l’accesso alla posizione.')),{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  });
}
async function position() {
  const lm=tg?.LocationManager;
  if(tg?.isVersionAtLeast?.('8.0') && lm) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('La richiesta GPS è scaduta. Riprova.')),20000);
      const get=()=>{
        if(!lm.isLocationAvailable) { clearTimeout(timer);browserGPS().then(resolve,reject);return; }
        lm.getLocation(data=>{clearTimeout(timer);data ? resolve(data) : reject(new Error('Consenti a Telegram di accedere alla posizione nelle impostazioni.'));});
      };
      if(lm.isInited) get(); else lm.init(get);
    });
  }
  return browserGPS();
}
$('gps').addEventListener('click',async()=>{
  busy=true;locks();status('Acquisizione della posizione…');
  try { const p=await position();locator=locatorFromGPS(p.latitude,p.longitude);$('locator').textContent=locator;status('Locator acquisito. Puoi pubblicare lo SPOT.'); }
  catch(e) { status(e.message,true); }
  finally { busy=false;locks(); }
});
$('spot-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;locks();
  try {
    const input={callsign:$('callsign').value,band:$('band').value,mode:$('mode').value,frequency:$('frequency').value,locator,id:requestId};
    validateSpot(input);status('Pubblicazione in corso…');
    await api('/spots','POST',input);requestId=crypto.randomUUID();
    try { localStorage.setItem('iq1to-callsign',input.callsign.trim().toUpperCase()); } catch {}
    await refresh();
  } catch(e) { status(e.message || 'Connessione non riuscita. Riprova.',true); }
  finally { busy=false;locks(); }
});
$('qrt').addEventListener('click',async()=>{
  if(busy || !mine)return;busy=true;locks();
  try { await api(`/spots/${mine.id}/qrt`,'POST');await refresh(); }
  catch(e) {status(e.message,true);}finally{busy=false;locks();}
});
$('refresh').addEventListener('click',()=>refresh().catch(e=>status(e.message,true)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden && authenticated && !busy)refresh(true).catch(e=>status(e.message,true));});
setInterval(()=>{if(!document.hidden && authenticated && !busy)refresh(true).catch(e=>status(e.message,true));},60000);
tg?.ready();tg?.expand();
if(initData) refresh().catch(e=>status(e.message,true));
else status('Apri CQ Spot dal pulsante menu di @IQ1TObot su Telegram.');
