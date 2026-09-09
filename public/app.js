import { BANDS, MODES, locatorFromGPS, validateSpot, validateProfile, formatFrequency, bearingBetween } from './radio.js';
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
let mine = null, busy = false, loading = false, authenticated = false, profileLoaded = false, activity = '', bearingTarget = '';
let requestId = crypto.randomUUID();
const status = (text,error=false) => { $('status').textContent=text; $('status').classList.toggle('error',error); };
for (const [band] of BANDS) $('band').add(new Option(`${band.replace('.',',')} m`,band));
for (const mode of MODES) $('mode').add(new Option(mode,mode));
$('band').value = '40'; $('mode').value = 'Fonia';
function bandHint() {
  const b = BANDS.find(b=>b[0]===$('band').value);
  $('frequency-hint').textContent=`Da ${formatFrequency(b[1])} a ${formatFrequency(b[2])} MHz`;
  $('frequency-whole').replaceChildren();
  for(let i=Math.floor(b[1]/1e6);i<=Math.floor(b[2]/1e6);i++) $('frequency-whole').add(new Option(String(i),String(i)));
  const current=Math.round(Number($('frequency').value.replace(',','.'))*1e6);
  setFrequency(Number.isFinite(current) && current>=b[1] && current<=b[2] ? current : b[1]);
}
function decimals(hz) {
  const band=BANDS.find(b=>b[0]===$('band').value),whole=Number($('frequency-whole').value)*1e6;
  const low=Math.max(0,band[1]-whole),high=Math.min(999999,band[2]-whole);
  const values=new Set([low,high]);
  for(let n=Math.ceil(low/1000)*1000;n<=high;n+=1000) values.add(n);
  const fraction=Math.max(low,Math.min(high,hz-whole));values.add(fraction);
  $('frequency-decimal').replaceChildren();
  for(const n of [...values].sort((a,b)=>a-b)) $('frequency-decimal').add(new Option(String(n).padStart(6,'0'),String(n)));
  $('frequency-decimal').value=String(fraction);
}
function setFrequency(hz) {
  $('frequency-whole').value=String(Math.floor(hz/1e6));decimals(hz);
  $('frequency').value=formatFrequency(hz);
}
$('frequency-whole').addEventListener('change',()=>{
  const hz=Number($('frequency-whole').value)*1e6+Number($('frequency-decimal').value);
  decimals(hz);$('frequency').value=formatFrequency(Number($('frequency-whole').value)*1e6+Number($('frequency-decimal').value));
});
$('frequency-decimal').addEventListener('change',()=>{$('frequency').value=formatFrequency(Number($('frequency-whole').value)*1e6+Number($('frequency-decimal').value));});
$('frequency').addEventListener('change',()=>{
  const hz=Math.round(Number($('frequency').value.replace(',','.'))*1e6),b=BANDS.find(b=>b[0]===$('band').value);
  if(Number.isFinite(hz) && hz>=b[1] && hz<=b[2]) setFrequency(hz);
});
$('band').addEventListener('change',bandHint); bandHint();
for(const id of ['callsign','locator','profile-callsign','profile-locator','activity-name','bearing-origin']) {
  $(id).addEventListener('input',()=>{const start=$(id).selectionStart,end=$(id).selectionEnd;$(id).value=$(id).value.toUpperCase();$(id).setSelectionRange(start,end);});
}
$('activities').addEventListener('click',event=>{
  const button=event.target.closest('button[data-activity]');if(!button)return;
  activity=button.dataset.activity;
  for(const b of $('activities').querySelectorAll('button')) b.setAttribute('aria-pressed',String(b===button));
  $('activity-label').hidden=!activity;$('activity-name').required=!!activity;
});
function locks() {
  $('fields').disabled=!authenticated || busy;
  $('refresh').disabled=!authenticated || busy || loading;
  $('qrt').disabled=busy;
  $('profile-fields').disabled=!authenticated || busy;
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
  el.append(top,freq,meta);
  if(spot.activity) {const tag=document.createElement('p');tag.className='hint';tag.textContent=`${spot.activity} · ${spot.activity_name}`;el.append(tag);}
  if(!own) {const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='🧭 Direzione antenna';button.addEventListener('click',()=>showBearing(spot.locator,spot.callsign));el.append(button);}
  return el;
}
function calculateBearing() {
  try {
    const origin=$('bearing-origin').value.trim().toUpperCase(),angle=bearingBetween(origin,bearingTarget);
    $('bearing-result').textContent=angle===null ? 'Stesso locator: direzione non determinabile.' : `${Math.round(angle)%360}° dal nord geografico · da ${origin} a ${bearingTarget}`;
  } catch(error) { $('bearing-result').textContent=error.message; }
}
function showBearing(target,callsign='') {
  bearingTarget=target;$('bearing-panel').hidden=false;
  $('bearing-target').textContent=`Verso ${callsign ? callsign+' · ' : ''}${target}`;
  $('bearing-origin').value=$('locator').value || mine?.locator || $('profile-locator').value;
  calculateBearing();$('bearing-panel').scrollIntoView({behavior:'smooth',block:'center'});
}
$('bearing-calculate').addEventListener('click',calculateBearing);
$('profile-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;locks();
  try {
    const profile=validateProfile({callsign:$('profile-callsign').value,name:$('profile-name').value,default_locator:$('profile-locator').value});
    await api('/profile','PUT',profile);
    $('callsign').value=profile.callsign;$('locator').value=profile.default_locator;
    profileLoaded=false;await refresh();$('profile-panel').open=false;status('Profilo salvato. Nominativo e locator sono pronti per il prossimo SPOT.');
  } catch(error) {status(error.message,true);} finally {busy=false;locks();}
});
async function refresh(quiet=false) {
  if(loading) return;
  loading=true; locks();
  try {
    const data=await api('/spots');authenticated=true;mine=data.mine;
    $('profile-panel').hidden=false;
    if(!profileLoaded) {
      if(data.profile) {
        $('profile-callsign').value=data.profile.callsign;$('profile-name').value=data.profile.name;$('profile-locator').value=data.profile.default_locator;
        $('callsign').value=data.profile.callsign;$('locator').value=data.profile.default_locator;
        $('profile-title').textContent=`${data.profile.callsign} · ${data.profile.name}${data.profile.is_admin ? ' · Admin' : ''}`;
        $('profile-panel').open=false;
      } else {$('profile-panel').open=true;$('profile-title').textContent='Registra il tuo nominativo';}
      if(mine && !mine.ended_at) {$('callsign').value=mine.callsign;$('locator').value=mine.locator;}
      profileLoaded=true;
      const start=tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
      if(/^bearing_[A-R]{2}[0-9]{2}[A-X]{2}$/.test(start)) showBearing(start.slice(8));
    }
    const active=mine && !mine.ended_at;
    $('composer').hidden=!!active; $('my-spot').hidden=!active;
    $('my-details').replaceChildren(...(active ? [card(mine,true)] : []));
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
  try { const p=await position();$('locator').value=locatorFromGPS(p.latitude,p.longitude);status('Locator acquisito. Puoi pubblicare lo SPOT.'); }
  catch(e) { status(e.message,true); }
  finally { busy=false;locks(); }
});
$('spot-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;locks();
  try {
    const input={callsign:$('callsign').value,band:$('band').value,mode:$('mode').value,frequency:$('frequency').value,locator:$('locator').value.trim(),activity,activity_name:$('activity-name').value,id:requestId};
    validateSpot(input);status('Pubblicazione in corso…');
    await api('/spots','POST',input);requestId=crypto.randomUUID();
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
