import { BANDS, MODES, locatorFromGPS, validateSpot, validateProfile, validateQSL, formatFrequency, formatUtcLogDate, bearingBetween, distanceBetween } from './radio.js';
import { bandControl, frequencyControl } from './controls.js';
import { preciseGPS } from './gps.js';
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
let mine = null, busy = false, loading = false, authenticated = false, profileLoaded = false, activity = '', bearingTarget = '';
let requestId = crypto.randomUUID();
let mineActive=[],qslTarget=null,qslNext=null,qslSequence=0,qslExpanded=false;
const status = (text,error=false) => { $('status').textContent=text; $('status').classList.toggle('error',error); };
const localStatus = (id,text,error=false) => { const el=$(id); if(!el)return; el.textContent=text; el.classList.toggle('error',error); };
for (const mode of MODES) $('mode').add(new Option(mode,mode));
$('band').value = '40'; $('mode').value = 'Fonia';
const frequency=frequencyControl($('frequency-control'),$('frequency'),()=>BANDS.find(b=>b[0]===$('band').value));
function bandHint() {
  const b = BANDS.find(b=>b[0]===$('band').value);
  $('frequency-hint').textContent=`Da ${formatFrequency(b[1])} a ${formatFrequency(b[2])} MHz`;
  frequency.setBand();
}
const bandWheel=bandControl($('band-wheel'),$('band'),bandHint,()=>authenticated && !busy);
function dmrChoice() {
  const dmr=$('mode').value==='DMR',bm=dmr && $('dmr-type').value==='bm';
  $('dmr-choice').hidden=!dmr;$('dmr-type').required=dmr;
  $('tg-choice').hidden=!bm;$('talkgroup').required=bm;
  $('radio-fields').hidden=bm || (dmr && !$('dmr-type').value);
  if(!$('radio-fields').hidden)requestAnimationFrame(()=>bandWheel.reveal());
}
$('mode').addEventListener('change',dmrChoice);$('dmr-type').addEventListener('change',dmrChoice);dmrChoice();
function selectTab(name,focus=false) {
  for(const tab of ['list','create']) {
    const active=tab===name;
    $(`tab-${tab}`).setAttribute('aria-selected',String(active));$(`tab-${tab}`).tabIndex=active?0:-1;
    $(`panel-${tab}`).hidden=!active;
  }
  if(name==='create')requestAnimationFrame(()=>bandWheel.reveal());
  if(focus)$(`tab-${name}`).focus();
}
for(const tab of ['list','create']) {
  $(`tab-${tab}`).addEventListener('click',()=>selectTab(tab));
  $(`tab-${tab}`).addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();selectTab(event.key==='Home'?'list':event.key==='End'?'create':tab==='list'?'create':'list',true);
    }
  });
}
$('show-active').addEventListener('click',()=>selectTab('list',true));
for(const id of ['callsign','locator','profile-callsign','profile-locator','activity-name','bearing-origin','qsl-callsign','qsl-locator']) {
  $(id).addEventListener('input',()=>{const start=$(id).selectionStart,end=$(id).selectionEnd;$(id).value=$(id).value.toUpperCase();$(id).setSelectionRange(start,end);});
}
$('locator').addEventListener('input',()=>{$('gps-quality').textContent='Locator inserito manualmente.';});
$('activities').addEventListener('click',event=>{
  const button=event.target.closest('button[data-activity]');if(!button)return;
  activity=button.dataset.activity;
  for(const b of $('activities').querySelectorAll('button')) b.setAttribute('aria-pressed',String(b===button));
  $('activity-label').hidden=!activity;$('activity-name').required=!!activity;
});
function locks() {
  $('fields').disabled=!authenticated || busy;
  $('refresh').disabled=!authenticated || busy || loading;
  for(const button of document.querySelectorAll('[data-qrt]'))button.disabled=busy || !authenticated;
  $('qsl-fields').disabled=busy || !authenticated;
  $('profile-fields').disabled=!authenticated || busy;
  $('band-wheel').setAttribute('aria-disabled',String(!authenticated || busy));
  $('band-wheel').tabIndex=authenticated && !busy ? 0 : -1;
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
  const bm=spot.mode==='DMR' && spot.dmr_type==='bm';
  const badge=document.createElement('span');badge.className='badge';badge.textContent=bm?'DMR · BrandMeister':`${spot.band} m · ${spot.mode}${spot.mode==='DMR'?' Diretto':''}`;
  top.append(call,badge);
  const freq=document.createElement('div');freq.className='frequency';freq.textContent=bm?`BM TG ${spot.talkgroup}`:`${formatFrequency(spot.frequency_hz)} MHz`;
  const meta=document.createElement('div');meta.className='spot-meta';
  meta.textContent=`${spot.locator} · ${new Date(spot.created_at*1000).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${own ? ' · Il tuo SPOT' : ''}`;
  el.append(top,freq,meta);
  if(spot.activity) {const tag=document.createElement('p');tag.className='hint';tag.textContent=`${spot.activity} · ${spot.activity_name}`;el.append(tag);}
  if(spot.notes){const note=document.createElement('p');note.className='spot-notes';note.textContent=spot.notes;el.append(note);}
  if(!own && spot.frequency_hz>0) {const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='🧭 Direzione antenna';button.addEventListener('click',()=>showBearing(spot.locator,spot.callsign));el.append(button);}
  const logButton=document.createElement('button');logButton.type='button';logButton.className='text-button';logButton.textContent=`📒 QSL Log (${spot.qsl_count || 0})${own?'':' · Conferma QSO'}`;
  logButton.addEventListener('click',()=>openQSL(spot.id));el.append(logButton);
  if(own){const qrt=document.createElement('button');qrt.type='button';qrt.className='danger';qrt.dataset.qrt=spot.id;qrt.textContent='QRT · Termina questo SPOT';qrt.addEventListener('click',()=>endSpot(spot.id));el.append(qrt);}
  return el;
}
async function endSpot(id) {
  if(busy)return;busy=true;locks();
  try {await api(`/spots/${id}/qrt`,'POST');await refresh();}catch(error){status(error.message,true);}finally{busy=false;locks();}
}
function logRows(rows,append=false) {
  if(!append)$('qsl-rows').replaceChildren();
  for(const log of rows){const row=document.createElement('tr');for(const value of [formatUtcLogDate(log.occurred_at),log.callsign,log.locator,Number(log.distance_km).toFixed(1),log.report]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}if(log.can_delete){const cell=document.createElement('td');const button=document.createElement('button');button.type='button';button.className='text-button qsl-delete';button.textContent='Elimina';button.addEventListener('click',()=>deleteQSL(qslTarget.id,log.id));cell.append(button);row.append(cell);}$('qsl-rows').append(row);}
}
async function deleteQSL(spotId,logId){if(busy)return;if(!confirm('Eliminare questa conferma QSL?'))return;busy=true;locks();try{await api(`/spots/${spotId}/logs/${logId}`,'DELETE');await loadQSL(spotId);status('Conferma QSL eliminata. Aggiornamento del messaggio in corso…');}catch(error){$('qsl-status').textContent=error.message;}finally{busy=false;locks();}}
async function loadQSL(id,append=false,initialize=false) {
  const sequence=++qslSequence;
  try {
    const data=await api(`/spots/${id}/logs${append && qslNext?`?before=${qslNext}`:''}`);
    if(sequence!==qslSequence || $('qsl-panel').hidden)return;
    qslTarget=data.spot;qslNext=data.next;
    $('qsl-target').textContent=`${data.spot.callsign} · ${data.spot.locator} · ${data.spot.mode} · ${data.spot.dmr_type==='bm'?`BM TG ${data.spot.talkgroup}`:`${formatFrequency(data.spot.frequency_hz)} MHz`}`;
    $('qsl-total').textContent=`${data.total} QSO confermati`;
    $('qsl-form').hidden=!data.can_log;
    $('qsl-status').textContent=data.can_log?'Hai effettuato il QSO? Confermalo qui.':'Log consultabile. La conferma è riservata agli altri utenti, una volta per SPOT attivo.';
    logRows(data.logs,append);$('qsl-more').hidden=!qslNext;
    if(initialize){
      $('qsl-callsign').value=$('callsign').value || $('profile-callsign').value;
      $('qsl-locator').value=$('locator').value || $('profile-locator').value;
      $('qsl-time').value=new Date().toISOString().slice(0,19);
      $('qsl-time').min=new Date(data.spot.created_at*1000).toISOString().slice(0,19);
      $('qsl-report').value=data.spot.mode==='CW'?'599':'59';$('qsl-report').placeholder=data.spot.mode==='CW'?'Es. 599':'Es. 59';
      $('qsl-report').pattern=data.spot.mode==='CW'?'[1-5][1-9][1-9]':'[1-5][1-9]';
      $('report-label').textContent=`${data.spot.mode==='CW'?'RST':'RS'} del segnale della stazione ${data.spot.callsign}`;
    }
    locks();
  } catch(error){if(sequence===qslSequence)$('qsl-status').textContent=error.message;}
}
function openQSL(id) {
  selectTab('list');qslTarget=null;qslNext=null;qslExpanded=false;
  $('qsl-panel').hidden=false;$('qsl-form').hidden=true;$('qsl-more').hidden=true;$('qsl-rows').replaceChildren();$('qsl-target').textContent='';$('qsl-status').textContent='Caricamento QSL Log…';
  $('qsl-panel').scrollIntoView({behavior:'smooth',block:'start'});loadQSL(id,false,true);
}
$('qsl-close').addEventListener('click',()=>{qslSequence++;qslTarget=null;$('qsl-panel').hidden=true;});
$('qsl-more').addEventListener('click',()=>{if(qslTarget && qslNext){qslExpanded=true;loadQSL(qslTarget.id,true);}});
$('qsl-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !qslTarget)return;busy=true;locks();
  const target=qslTarget;
  try {
    const input={callsign:$('qsl-callsign').value,locator:$('qsl-locator').value,report:$('qsl-report').value,occurred_at:Math.floor(Date.parse($('qsl-time').value+'Z')/1000)};
    validateQSL(input,target);await api(`/spots/${target.id}/logs`,'POST',input);
    if(qslTarget?.id===target.id){qslExpanded=false;await loadQSL(target.id);}await refresh(true);status('QSL registrato. Aggiornamento del messaggio Telegram in corso…');
  } catch(error){$('qsl-status').textContent=error.message;}finally{busy=false;locks();}
});
async function applyGPS(targetId, qualityId, feedbackId) {
  if(busy)return;busy=true;locks();localStatus(feedbackId,'Acquisizione della posizione precisa…');
  try {const p=await position();if(p.accuracy>100)throw new Error(`Posizione troppo imprecisa (±${Math.round(p.accuracy)} m). Riprova all’aperto.`);$(targetId).value=locatorFromGPS(p.latitude,p.longitude);if(qualityId)$(qualityId).textContent=`GPS ±${Math.round(p.accuracy)} m`;localStatus(feedbackId,`Locator aggiornato · precisione ±${Math.round(p.accuracy)} m.`);}
  catch(error){localStatus(feedbackId,error.message,true);}finally{busy=false;locks();}
}
$('qsl-gps').addEventListener('click',()=>applyGPS('qsl-locator',null,'qsl-gps-status'));
function calculateBearing() {
  try {
    const origin=$('bearing-origin').value.trim().toUpperCase(),angle=bearingBetween(origin,bearingTarget);
    const distance=distanceBetween(origin,bearingTarget);
    $('bearing-result').textContent=angle===null ? `Stesso locator · distanza ${distance.toFixed(1)} km` : `${Math.round(angle)%360}° dal nord geografico · ${distance.toFixed(1)} km · da ${origin} a ${bearingTarget}`;
  } catch(error) { $('bearing-result').textContent=error.message; }
}
function showBearing(target,callsign='') {
  selectTab('list');
  bearingTarget=target;$('bearing-panel').hidden=false;
  $('bearing-target').textContent=`Verso ${callsign ? callsign+' · ' : ''}${target}`;
  $('bearing-origin').value=$('locator').value || mine?.locator || $('profile-locator').value;
  calculateBearing();$('bearing-panel').scrollIntoView({behavior:'smooth',block:'center'});
}
$('bearing-gps').addEventListener('click',()=>applyGPS('bearing-origin',null,'bearing-gps-status'));
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
    const data=await api('/spots');authenticated=true;mine=data.mine;mineActive=data.mine_active || [];
    $('profile-panel').hidden=false;
    if(!profileLoaded) {
      if(data.profile) {
        $('profile-callsign').value=data.profile.callsign;$('profile-name').value=data.profile.name;$('profile-locator').value=data.profile.default_locator;
        $('callsign').value=data.profile.callsign;$('locator').value=data.profile.default_locator;
        $('profile-title').textContent=`${data.profile.callsign} · ${data.profile.name}${data.profile.is_admin ? ' · Admin' : ''}`;
        $('profile-panel').open=false;
      } else {$('profile-panel').open=true;$('profile-title').textContent='Registra il tuo nominativo';selectTab('create');}
      if(mine && !mine.ended_at) {$('callsign').value=mine.callsign;$('locator').value=mine.locator;}
      profileLoaded=true;
      const start=tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
      if(/^bearing_[A-R]{2}[0-9]{2}[A-X]{2}$/.test(start)) showBearing(start.slice(8));
      else if(/^qsl_[0-9a-f-]{36}$/i.test(start))openQSL(start.slice(4));
    }
    const active=mineActive.length>0;
    $('composer').hidden=mineActive.length>=3; $('my-spot').hidden=!active;
    $('already-active').hidden=mineActive.length<3;
    $('spot-slots').textContent=`${mineActive.length}/3 SPOT attivi`;
    $('my-details').replaceChildren(...mineActive.map(spot=>card(spot,true)));
    $('spots').replaceChildren(...data.spots.map(s=>card(s,!!s.is_owner)));
    if(!data.spots.length) { const p=document.createElement('p');p.className='empty';p.textContent='Nessuno SPOT attivo. Ci sentiamo in radio?';$('spots').append(p); }
    $('count').textContent=data.spots.length===200 ? '200+' : data.spots.length;
    $('updated').textContent=`Aggiornato alle ${new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · ogni minuto`;
    if(mineActive.some(s=>s.sync_state==='failed') || mine?.sync_state==='failed') status('SPOT salvato, ma la notifica Telegram non è riuscita. Contatta un amministratore.',true);
    else if(mineActive.some(s=>s.sync_state!=='synced') || (mine && mine.sync_state!=='synced')) status('SPOT salvato. Aggiornamento del topic in corso…');
    else if(!quiet) status(active ? 'Il tuo SPOT è attivo nel gruppo.' : 'Annuncia la tua presenza nel topic CQ Spot.');
    else if($('status').textContent.includes('in corso')) status('Elenco aggiornato.');
    if(qslTarget && !qslExpanded)await loadQSL(qslTarget.id);
  } finally { loading=false;locks(); }
}
async function position() {
  let browserFix=null;
  try {browserFix=await preciseGPS();if(browserFix.accuracy<=100)return browserFix;} catch {}
  const lm=tg?.LocationManager;
  if(tg?.isVersionAtLeast?.('8.0') && lm) {
    try {const telegramFix=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('La richiesta GPS è scaduta. Riprova.')),20000);
      const get=()=>{
        if(!lm.isLocationAvailable) {clearTimeout(timer);reject(new Error('GPS non disponibile in Telegram.'));return;}
        lm.getLocation(data=>{clearTimeout(timer);data ? resolve({latitude:data.latitude,longitude:data.longitude,accuracy:data.horizontal_accuracy}) : reject(new Error('Consenti a Telegram di accedere alla posizione nelle impostazioni.'));});
      };
      if(lm.isInited) get(); else lm.init(get);
    });
    if(Number.isFinite(telegramFix.accuracy) && telegramFix.accuracy>0 && (!browserFix || telegramFix.accuracy<browserFix.accuracy))return telegramFix;
    } catch {}
  }
  if(browserFix)return browserFix;
  throw new Error('Posizione precisa non disponibile. Abilita il GPS e la posizione precisa per Telegram, poi riprova all’aperto.');
}
function offlineLocator() {
  try {
    const latitude=Number($('offline-lat').value.replace(',','.')),longitude=Number($('offline-lon').value.replace(',','.'));
    const result=locatorFromGPS(latitude,longitude);$('offline-result').textContent=result;
  } catch(error) {$('offline-result').textContent=error.message;}
}
$('offline-calc').addEventListener('click',offlineLocator);
$('offline-gps').addEventListener('click',async()=>{
  $('offline-result').textContent='Acquisizione della posizione…';
  try {const p=await position();$('offline-lat').value=p.latitude.toFixed(6);$('offline-lon').value=p.longitude.toFixed(6);offlineLocator();}
  catch(error){$('offline-result').textContent=error.message;}
});
$('gps').addEventListener('click',async()=>{
  busy=true;locks();localStatus('gps-quality','Acquisizione della posizione…');
  try {
    const p=await position();
    if(p.accuracy>100)throw new Error(`Posizione troppo imprecisa (±${Math.round(p.accuracy)} m). Locator non cambiato: riprova all’aperto o inseriscilo manualmente.`);
    $('locator').value=locatorFromGPS(p.latitude,p.longitude);
    localStatus('gps-quality',`Locator aggiornato · precisione ±${Math.round(p.accuracy)} m. Controlla il locator se sei vicino al confine della zona.`);
  }
  catch(e) { localStatus('gps-quality',e.message,true); }
  finally { busy=false;locks(); }
});
$('spot-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;locks();
  try {
    const input={callsign:$('callsign').value,band:$('band').value,mode:$('mode').value,frequency:$('frequency').value,locator:$('locator').value.trim(),activity,activity_name:$('activity-name').value,dmr_type:$('dmr-type').value,talkgroup:$('talkgroup').value,notes:$('notes').value,id:requestId};
    validateSpot(input);status('Pubblicazione in corso…');
    await api('/spots','POST',input);requestId=crypto.randomUUID();
    await refresh();selectTab('list');
  } catch(e) { status(e.message || 'Connessione non riuscita. Riprova.',true); }
  finally { busy=false;locks(); }
});
$('refresh').addEventListener('click',()=>refresh().catch(e=>status(e.message,true)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden && authenticated && !busy)refresh(true).catch(e=>status(e.message,true));});
setInterval(()=>{if(!document.hidden && authenticated && !busy)refresh(true).catch(e=>status(e.message,true));},60000);
tg?.ready();tg?.expand();
if(initData) refresh().catch(e=>status(e.message,true));
else status('Apri CQ Spot dal pulsante menu di @IQ1TObot su Telegram.');
