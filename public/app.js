import { BANDS, MODES, locatorFromGPS, locatorCenter, validateSpot, validateProfile, validateQSL, formatFrequency, formatUtcLogDate, bearingBetween, distanceBetween } from './radio.js';
import { bandControl, frequencyControl } from './controls.js';
import { preciseGPS } from './gps.js';
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
let mine = null, busy = false, loading = false, authenticated = false, profileLoaded = false, activity = '', bearingTarget = '', bearingSpotId = '', bearingAngle = null, deviceHeading = null, compassRotation = null, compassListening = false, selectedTab = 'list', detailView = '', appView = 'home';
let requestId = crypto.randomUUID();
let mineActive=[],qslTarget=null,qslNext=null,qslSequence=0,qslExpanded=false;
const status = (text,error=false) => { $('status').textContent=text; $('status').classList.toggle('error',error); };
const localStatus = (id,text,error=false) => { const el=$(id); if(!el)return; el.textContent=text; el.classList.toggle('error',error); };
let titleTaps=0,titleTapTimer=0,cacheResetting=false;
async function resetAppCache() {
  if(cacheResetting)return;cacheResetting=true;status('Aggiornamento cache in corso…');
  try {
    if('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration=>registration.unregister()));
    if('caches' in window) await Promise.all((await caches.keys()).map(key=>caches.delete(key)));
  } finally { location.reload(); }
}
function titleTap() {
  if(cacheResetting)return;titleTaps++;clearTimeout(titleTapTimer);titleTapTimer=setTimeout(()=>{titleTaps=0;},1400);
  if(titleTaps>=5){titleTaps=0;clearTimeout(titleTapTimer);resetAppCache();}
}
$('cq-title').addEventListener('click',titleTap);
$('cq-title').addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();titleTap();}});
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
function updateBackButton() { if(appView!=='home')tg?.BackButton?.show?.();else tg?.BackButton?.hide?.(); }
function closeTools() {$('tools-folder').hidden=true;}
function openTools() {$('cards-folder').hidden=true;$('tools-folder').hidden=false;}
function closeCards() {$('cards-folder').hidden=true;}
function openCards() {$('tools-folder').hidden=true;$('cards-folder').hidden=false;}
function openHome() {
  appView='home';detailView='';$('home').hidden=false;$('qso-tool').hidden=true;$('iac-tool').hidden=true;closeTools();closeCards();renderDetail('');window.scrollTo({top:0,behavior:'smooth'});updateBackButton();
}
function openQso() {
  appView='qso';$('home').hidden=true;$('qso-tool').hidden=false;$('iac-tool').hidden=true;updateBackButton();requestAnimationFrame(()=>bandWheel.reveal());
}
function selectTab(name,focus=false) {
  selectedTab=name;detailView='';$('main-tabs').hidden=false;$('spots-section').hidden=false;$('bearing-panel').hidden=true;$('qsl-panel').hidden=true;updateBackButton();
  for(const tab of ['list','create']) {
    const active=tab===name;
    $(`tab-${tab}`).setAttribute('aria-selected',String(active));$(`tab-${tab}`).tabIndex=active?0:-1;
    $(`panel-${tab}`).hidden=!active;
  }
  if(name==='create')requestAnimationFrame(()=>bandWheel.reveal());
  if(focus)$(`tab-${name}`).focus();
}
function renderDetail(name) {
  if(detailView==='qsl' && name!=='qsl'){qslSequence++;qslTarget=null;}
  detailView=name;$('main-tabs').hidden=!!name;$('panel-create').hidden=!!name || selectedTab!=='create';$('panel-list').hidden=!name && selectedTab!=='list';
  $('spots-section').hidden=!!name;$('bearing-panel').hidden=name!=='bearing';$('qsl-panel').hidden=name!=='qsl';
  updateBackButton();
  window.scrollTo({top:0,behavior:'smooth'});
}
function openDetail(name,push=true) {openQso();renderDetail(name);if(push && history.state?.cqDetail!==name)history.pushState({cqDetail:name},'');}
function detailBack() {if(detailView){if(history.state?.cqDetail)history.back();else renderDetail('');}else openHome();}
history.replaceState({...history.state,cqDetail:''},'');
window.addEventListener('popstate',event=>renderDetail(event.state?.cqDetail || ''));
tg?.BackButton?.onClick?.(detailBack);
const IAC_RULES=[
  {round:1,frequency:'50',weekday:4,nth:2,rule:'2° Giovedì'},
  {round:2,frequency:'144',weekday:2,nth:1,rule:'1° Martedì'},
  {round:3,frequency:'432',weekday:2,nth:2,rule:'2° Martedì'},
  {round:4,frequency:'1296',weekday:2,nth:3,rule:'3° Martedì'},
  {round:5,frequency:'2300 & Up',weekday:2,nth:4,rule:'4° Martedì'},
  {round:6,frequency:'70',weekday:4,nth:3,rule:'3° Giovedì'}
];
const dateFmt=new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'2-digit',month:'long',year:'numeric'});
function nthWeekday(year,month,weekday,nth){const date=new Date(year,month,1);date.setDate(1+((weekday-date.getDay()+7)%7)+(nth-1)*7);return date;}
function nextIacDate(rule,today=new Date()){
  const base=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  for(let offset=0;offset<24;offset++){const date=nthWeekday(base.getFullYear(),base.getMonth()+offset,rule.weekday,rule.nth);if(date>=base)return date;}
}
function renderIacCard(){
  const today=new Date(),items=IAC_RULES.map(rule=>({...rule,date:nextIacDate(rule,today)})).sort((a,b)=>a.date-b.date || a.round-b.round),next=items[0];
  $('iac-updated').textContent=`Calcolato il ${dateFmt.format(today)} dalla data del dispositivo.`;
  $('iac-next').innerHTML=`<strong>Prossima tornata: ${next.frequency} MHz</strong><span>Tornata ${next.round} · ${next.rule} · ${dateFmt.format(next.date)}</span>`;
  $('iac-rows').replaceChildren(...items.map((item,index)=>{const row=document.createElement('tr');if(index===0)row.className='iac-current';for(const value of [item.round,item.frequency,item.rule,dateFmt.format(item.date)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}return row;}));
}
function openIac(){appView='iac';$('home').hidden=true;$('qso-tool').hidden=true;$('iac-tool').hidden=false;renderIacCard();window.scrollTo({top:0,behavior:'smooth'});updateBackButton();}
$('open-tools').addEventListener('click',openTools);
$('close-tools').addEventListener('click',closeTools);
$('open-cards').addEventListener('click',openCards);
$('close-cards').addEventListener('click',closeCards);
$('open-iac').addEventListener('click',openIac);
$('close-iac').addEventListener('click',openHome);
$('open-qso').addEventListener('click',openQso);
$('home-back').addEventListener('click',openHome);
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
  const el=document.createElement('article');el.className=own?'spot own-spot':'spot';
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
  if(!own && spot.frequency_hz>0) {const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='⌖ Direzione antenna';button.addEventListener('click',()=>showBearing(spot.locator,spot.callsign,spot.id));el.append(button);}
  const logButton=document.createElement('button');logButton.type='button';logButton.className='text-button';logButton.textContent=`QSL Log (${spot.qsl_count || 0})${own?'':' · Conferma QSO'}`;
  logButton.addEventListener('click',()=>openQSL(spot.id));el.append(logButton);
  if(own){const qrt=document.createElement('button');qrt.type='button';qrt.className='danger';qrt.dataset.qrt=spot.id;qrt.textContent='QRT · Termina questo SPOT';qrt.addEventListener('click',()=>endSpot(spot.id));el.append(qrt);const remove=document.createElement('button');remove.type='button';remove.className='danger text-button';remove.textContent='Elimina SPOT e messaggio';remove.addEventListener('click',()=>deleteSpot(spot.id));el.append(remove);}
  return el;
}
async function endSpot(id) {
  if(busy)return;busy=true;locks();
  try {await api(`/spots/${id}/qrt`,'POST');await refresh();}catch(error){status(error.message,true);}finally{busy=false;locks();}
}
async function deleteSpot(id) {
  if(busy || !confirm('Eliminare definitivamente questo SPOT e il messaggio Telegram?'))return;
  busy=true;locks();
  try {await api(`/spots/${id}`,'DELETE');if(qslTarget?.id===id){qslTarget=null;$('qsl-panel').hidden=true;}await refresh();status('SPOT e messaggio Telegram eliminati.');}
  catch(error){status(error.message,true);}finally{busy=false;locks();}
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
  qslTarget=null;qslNext=null;qslExpanded=false;openDetail('qsl');
  $('qsl-form').hidden=true;$('qsl-more').hidden=true;$('qsl-rows').replaceChildren();$('qsl-target').textContent='';$('qsl-status').textContent='Caricamento QSL Log…';
  loadQSL(id,false,true);
}
$('qsl-close').addEventListener('click',detailBack);
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
  try {const p=await position();if(p.accuracy>100)throw new Error(`Posizione troppo imprecisa (±${Math.round(p.accuracy)} m). Riprova all’aperto.`);$(targetId).value=locatorFromGPS(p.latitude,p.longitude);if(qualityId)$(qualityId).textContent=`GPS ±${Math.round(p.accuracy)} m`;localStatus(feedbackId,`Locator aggiornato · precisione ±${Math.round(p.accuracy)} m.`);return p;}
  catch(error){localStatus(feedbackId,error.message,true);}finally{busy=false;locks();}
}
$('qsl-gps').addEventListener('click',()=>applyGPS('qsl-locator',null,'qsl-gps-status'));
function calculateBearing() {
  try {
    const origin=$('bearing-origin').value.trim().toUpperCase(),angle=bearingBetween(origin,bearingTarget);
    const distance=distanceBetween(origin,bearingTarget);
    bearingAngle=angle;updateBearingVisuals(origin);
    $('bearing-result').textContent=angle===null ? `Stesso locator · distanza ${distance.toFixed(1)} km` : `${Math.round(angle)%360}° dal nord geografico · ${distance.toFixed(1)} km · da ${origin} a ${bearingTarget}`;
  } catch(error) { bearingAngle=null;$('bearing-visuals').hidden=true;$('bearing-result').textContent=error.message; }
}
function updateCompass() {
  if(bearingAngle===null){$('compass-bearing').textContent='—';$('compass-dial').classList.add('unavailable');$('compass-status').textContent='I due locator coincidono: non c’è una direzione utile.';return;}
  $('compass-dial').classList.remove('unavailable');
  const heading=deviceHeading ?? 0,desired=-heading;
  if(compassRotation===null)compassRotation=desired;
  else compassRotation+=((desired-(compassRotation%360)+540)%360)-180;
  $('compass-rose').style.transform=`rotate(${compassRotation}deg)`;
  const degrees=Math.round(bearingAngle)%360,rad=bearingAngle*Math.PI/180;
  $('compass-bearing').textContent=`${degrees}°`;$('compass-target-mark').textContent=`${degrees}°`;
  $('compass-target-mark').style.left=`${50+42*Math.sin(rad)}%`;$('compass-target-mark').style.top=`${50-42*Math.cos(rad)}%`;
  if(deviceHeading!==null)$('compass-status').textContent=`Direzione telefono ${Math.round(deviceHeading)}° · porta il marker ${degrees}° sulla punta dell’ago.`;
}
function updateBearingVisuals() {$('bearing-visuals').hidden=false;updateCompass();}
function orientationChanged(event) {
  let heading=null;
  if(Number.isFinite(event.webkitCompassHeading))heading=event.webkitCompassHeading;
  else if(Number.isFinite(event.alpha)){const screenAngle=screen.orientation?.angle || window.orientation || 0;heading=(360-event.alpha+screenAngle+360)%360;}
  if(heading===null)return;
  if(deviceHeading===null)deviceHeading=heading;
  else {const delta=((heading-deviceHeading+540)%360)-180;if(Math.abs(delta)<.6)return;deviceHeading=(deviceHeading+delta*.22+360)%360;}
  updateCompass();
}
async function enableCompass() {
  try {
    const Orientation=window.DeviceOrientationEvent;
    if(!Orientation)throw new Error('Sensore di orientamento non disponibile su questo dispositivo.');
    if(typeof Orientation.requestPermission==='function' && await Orientation.requestPermission()!=='granted')throw new Error('Permesso bussola non concesso.');
    if(!compassListening){window.addEventListener('ondeviceorientationabsolute' in window?'deviceorientationabsolute':'deviceorientation',orientationChanged,true);compassListening=true;}
    $('compass-enable').hidden=true;$('compass-status').textContent='Muovi il telefono a forma di 8 per calibrare la bussola.';
  } catch(error) {$('compass-status').textContent=error.message;}
}
function showBearing(target,callsign='',spotId='') {
  bearingTarget=target;bearingSpotId=spotId;compassRotation=null;$('bearing-qsl').hidden=!spotId;openDetail('bearing');
  $('bearing-target').textContent=`Verso ${callsign ? callsign+' · ' : ''}${target}`;
  $('bearing-origin').value=$('locator').value || mine?.locator || $('profile-locator').value;
  const point=locatorCenter(target),label=encodeURIComponent(`${callsign || target} · ${target}`),coordinates=`${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
  $('bearing-maps').href=/iPad|iPhone|iPod/.test(navigator.userAgent)?`https://maps.apple.com/?ll=${coordinates}&q=${label}`:`https://www.google.com/maps/search/?api=1&query=${coordinates}`;
  calculateBearing();
}
$('bearing-gps').addEventListener('click',async()=>{if(await applyGPS('bearing-origin',null,'bearing-gps-status'))calculateBearing();});
$('bearing-calculate').addEventListener('click',calculateBearing);
$('bearing-origin').addEventListener('input',calculateBearing);
$('compass-enable').addEventListener('click',enableCompass);
$('bearing-back').addEventListener('click',detailBack);
$('bearing-qsl').addEventListener('click',()=>{if(bearingSpotId)openQSL(bearingSpotId);});
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
      if(/^bearing_[0-9a-f-]{36}$/i.test(start)){const spot=data.spots.find(item=>item.id===start.slice(8));if(spot)showBearing(spot.locator,spot.callsign,spot.id);}
      else if(/^bearing_[A-R]{2}[0-9]{2}[A-X]{2}$/.test(start)){const spot=data.spots.find(item=>item.locator===start.slice(8));showBearing(start.slice(8),spot?.callsign || '',spot?.id || '');}
      else if(/^qsl_[0-9a-f-]{36}$/i.test(start))openQSL(start.slice(4));
    }
    const active=mineActive.length>0;
    $('composer').hidden=mineActive.length>=3;
    $('already-active').hidden=mineActive.length<3;
    $('spot-slots').textContent=`${mineActive.length}/3 SPOT attivi`;
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
