// Frequency ranges are an Italian allowlist based on MIMIT PNRF (Piano Nazionale di Ripartizione delle Frequenze) plus IARU Region 1 band-plan guidance for sub-bands/modes.
// They do not certify an operator's licence class, permitted power, local authorisations, experiments or channel availability.
export const BANDS = [
  ['2200',135700,137800], ['630',472000,479000], ['160',1830000,1850000],
  ['80',3500000,3800000], ['60',5351500,5366500], ['40',7000000,7200000],
  ['30',10100000,10150000], ['20',14000000,14350000], ['17',18068000,18168000],
  ['15',21000000,21450000], ['12',24890000,24990000], ['10',28000000,29700000],
  ['6',50000000,52000000], ['2',144000000,146000000], ['0.70',430000000,438000000],
  ['0.23',1240000000,1298000000], ['0.13',2300000000,2450000000]
];
export const MODES = ['CW','Fonia','SSB','FM','AM','FT8','FT4','RTTY','PSK31','JS8','D-Star','DMR','C4FM','SSTV'];
// Standard SPOTs do not model satellite uplink authorisations (note 117).
// Gaps use [from, to); BANDS stores the outer edges, not a continuous allocation.
export const EXCLUDED_RANGES = [
  {band:'0.70',from:434000000,to:435000000,label:'434–435 MHz: nessuna attribuzione radioamatoriale'},
  {band:'0.23',from:1245000000,to:1270000000,label:'1245–1270 MHz esclusa dagli SPOT ordinari; 1267–1270 solo satellite Terra→spazio (nota 117)'}
];
export function isFrequencyAllowed(bandId, hz) {
  const band=BANDS.find(item=>item[0]===bandId);
  return !!band && Number.isSafeInteger(hz) && hz>=band[1] && hz<=band[2] &&
    !EXCLUDED_RANGES.some(range => range.band === bandId && hz >= range.from && hz < range.to);
}
const DIGITAL=['FT8','FT4','RTTY','PSK31','JS8'];
const DV=['D-Star','DMR','C4FM'];
const CW_DIG=['CW',...DIGITAL];
const SSB=['Fonia','SSB','AM'];
const FMDV=['FM','Fonia',...DV];
export const BAND_PLAN_SOURCE = 'MIMIT PNRF: https://www.mimit.gov.it/it/digitale/gestione-spettro-radio/piano-nazionale-ripartizione-frequenze';
export const BAND_PLAN = [
  {band:'2200',name:'2200 m · LF',range:'135,7–137,8 kHz',notes:'PNRF Italia: servizio di radioamatore in statuto secondario; massimo 1 W e.i.r.p. (nota 8), con protezione della radionavigazione.',segments:[{from:135700,to:137800,modes:CW_DIG,label:'CW e modi digitali stretti'}]},
  {band:'630',name:'630 m · MF',range:'472–479 kHz',notes:'PNRF Italia: statuto secondario; massimo 1 W e.i.r.p. (nota 16); proteggere la radionavigazione aeronautica e i 490 kHz (nota 15).',segments:[{from:472000,to:479000,modes:CW_DIG,label:'CW e modi digitali stretti'}]},
  {band:'160',name:'160 m',range:'1,830–1,850 MHz',notes:'PNRF ordinario Italia: 1830–1850 kHz. La porzione 1810–1830 kHz è da trattare solo se coperta da sperimentazioni/autorizzazioni MIMIT vigenti.',segments:[{from:1830000,to:1840000,modes:CW_DIG,label:'CW e modi digitali stretti'},{from:1840000,to:1850000,modes:SSB,label:'Fonia SSB/AM secondo band plan'}]},
  {band:'80',name:'80 m',range:'3,500–3,800 MHz',notes:'PNRF Italia: 3500–3800 kHz a statuto secondario; proteggere i servizi primari.',segments:[{from:3500000,to:3570000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:3570000,to:3600000,modes:DIGITAL,label:'Modi digitali stretti · rispettare i limiti di larghezza e le frequenze di attività'},{from:3600000,to:3800000,modes:SSB,label:'Fonia, prevalentemente LSB'}]},
  {band:'60',name:'60 m',range:'5,3515–5,3665 MHz',notes:'PNRF Italia, nota 32B: 5351,5–5366,5 kHz, statuto secondario, massimo 15 W e.i.r.p. IARU: 200 Hz fino a 5354; 2700 Hz fino a 5366; 20 Hz negli ultimi 500 Hz. USB per fonia.',segments:[{from:5351500,to:5354000,modes:['CW','PSK31'],label:'CW e modi stretti · massimo 200 Hz'},{from:5354000,to:5366000,modes:['Fonia','SSB',...DIGITAL],label:'Tutti i modi · massimo 2700 Hz, USB per fonia'},{from:5366000,to:5366500,modes:[],label:'Segnali deboli · massimo 20 Hz, non fonia'}]},
  {band:'40',name:'40 m',range:'7,000–7,200 MHz',notes:'PNRF Italia: banda radioamatoriale 7000–7200 kHz.',segments:[{from:7000000,to:7040000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:7040000,to:7050000,modes:DIGITAL,label:'Modi digitali stretti · massimo 500 Hz'},{from:7050000,to:7200000,modes:SSB,label:'Fonia, prevalentemente LSB'}]},
  {band:'30',name:'30 m',range:'10,100–10,150 MHz',notes:'PNRF Italia: banda radioamatoriale 10100–10150 kHz; band plan IARU: uso CW/digitale stretto, niente fonia.',segments:[{from:10100000,to:10130000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:10130000,to:10150000,modes:DIGITAL,label:'Modi digitali stretti · massimo 500 Hz; niente fonia'}]},
  {band:'20',name:'20 m',range:'14,000–14,350 MHz',notes:'PNRF Italia: banda radioamatoriale 14000–14350 kHz.',segments:[{from:14000000,to:14070000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:14070000,to:14099000,modes:DIGITAL,label:'Modi digitali stretti · massimo 500 Hz'},{from:14099000,to:14101000,modes:[],label:'Beacon esclusivi · non QSO'},{from:14101000,to:14112000,modes:DIGITAL,label:'Modi digitali · massimo 2700 Hz'},{from:14112000,to:14350000,modes:[...SSB,'SSTV'],label:'Fonia, prevalentemente USB, e immagini'}]},
  {band:'17',name:'17 m',range:'18,068–18,168 MHz',notes:'PNRF Italia: banda radioamatoriale 18068–18168 kHz.',segments:[{from:18068000,to:18095000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:18095000,to:18109000,modes:DIGITAL,label:'Modi digitali stretti · massimo 500 Hz'},{from:18109000,to:18111000,modes:[],label:'Beacon esclusivi · non QSO'},{from:18111000,to:18120000,modes:DIGITAL,label:'Modi digitali · massimo 2700 Hz'},{from:18120000,to:18168000,modes:['Fonia','SSB'],label:'Fonia USB'}]},
  {band:'15',name:'15 m',range:'21,000–21,450 MHz',notes:'PNRF Italia: banda radioamatoriale 21000–21450 kHz.',segments:[{from:21000000,to:21070000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:21070000,to:21149000,modes:DIGITAL,label:'Modi digitali stretti · massimo 500 Hz'},{from:21149000,to:21151000,modes:[],label:'Beacon esclusivi · non QSO'},{from:21151000,to:21450000,modes:[...SSB,'SSTV'],label:'Fonia USB e immagini'}]},
  {band:'12',name:'12 m',range:'24,890–24,990 MHz',notes:'PNRF Italia: banda radioamatoriale 24890–24990 kHz.',segments:[{from:24890000,to:24915000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:24915000,to:24929000,modes:DIGITAL,label:'Modi digitali stretti · massimo 500 Hz'},{from:24929000,to:24931000,modes:[],label:'Beacon esclusivi · non QSO'},{from:24931000,to:24940000,modes:DIGITAL,label:'Modi digitali · massimo 2700 Hz'},{from:24940000,to:24990000,modes:['Fonia','SSB'],label:'Fonia USB'}]},
  {band:'10',name:'10 m',range:'28,000–29,700 MHz',notes:'PNRF Italia: banda radioamatoriale 28,000–29,700 MHz.',segments:[{from:28000000,to:28070000,modes:['CW'],label:'CW · massimo 200 Hz'},{from:28070000,to:28190000,modes:DIGITAL,label:'Modi digitali · rispettare sottobande e larghezze'},{from:28190000,to:28225000,modes:[],label:'Beacon · non QSO'},{from:28225000,to:28300000,modes:[],label:'Beacon e usi dedicati · consultare band plan completo'},{from:28300000,to:29000000,modes:[...SSB,'SSTV'],label:'Fonia USB/AM e immagini'},{from:29100000,to:29200000,modes:['FM','Fonia'],label:'FM simplex · canali 10 kHz, massimo 6 kHz di emissione'},{from:29600000,to:29600000,modes:['FM','Fonia'],label:'Chiamata FM'},{from:29520000,to:29590000,modes:['FM','Fonia'],label:'Ingressi ripetitori FM · massimo 6 kHz'},{from:29620000,to:29690000,modes:[],label:'Uscite ripetitori FM · non frequenze TX degli utenti'}]},
  {band:'6',name:'6 m',range:'50–52 MHz',notes:'PNRF Italia: 50,000–52,000 MHz con Note 7A, 56, 57; non interferire né chiedere protezione verso i wind profiler.',segments:[{from:50000000,to:50100000,modes:['CW'],label:'CW e beacon'},{from:50100000,to:50300000,modes:['Fonia','SSB','CW'],label:'SSB/CW weak signal'},{from:50300000,to:50500000,modes:DIGITAL,label:'MGM/digitale'},{from:51410000,to:51590000,modes:FMDV,label:'FM/DV simplex; 51,510 chiamata FM'}]},
  {band:'4',name:'4 m',range:'70 MHz',notes:'PNRF Italia: non attribuita stabilmente al servizio di radioamatore. Usabile solo con specifica sperimentazione/autorizzazione MIMIT vigente, quindi non abilitata per SPOT ordinari.',segments:[]},
  {band:'2',name:'2 m',range:'144–146 MHz',notes:'PNRF Italia nota 69: 144,0–145,8 MHz radioamatore; 145,8–146,0 MHz radioamatore via satellite.',segments:[{from:144025000,to:144400000,modes:['CW','Fonia','SSB',...DIGITAL],label:'CW/SSB/MGM weak signal; 144,300 centro attività SSB'},{from:144800000,to:144800000,modes:[],label:'APRS · packet radio, non FT8/FT4/RTTY/PSK31/JS8'},{from:145200000,to:145575000,modes:FMDV,label:'Canali FM/DV simplex; 145,500 chiamata FM · verificare canalizzazione'},{from:145800000,to:146000000,modes:[],label:'Solo radioamatore via satellite · non simplex terrestre (nota 69)'}]},
  {band:'0.70',name:'70 cm',range:'430–434 / 435–438 MHz',notes:'PNRF Italia: porzioni radioamatoriali 430–434 MHz e 435–438 MHz con co-attribuzioni/condizioni; 434–435 MHz non è indicata come porzione radioamatoriale nella Tabella B corrente. 438–440 MHz non indicata per radioamatori.',segments:[{from:432000000,to:432400000,modes:['CW','Fonia','SSB',...DIGITAL],label:'All mode weak signal; 432,200 centro attività SSB'},{from:433000000,to:434000000,modes:FMDV,label:'FM/DV simplex e ripetitori; 433,500 chiamata'},{from:435000000,to:438000000,modes:[],label:'Uso satellitare nel band plan IARU · non suggerito per QSO terrestri'}]},
  {band:'0.23',name:'23 cm',range:'1240–1245 / 1270–1298 MHz',notes:'PNRF Italia: radioamatore secondario a 1240–1245 e 1270–1298 MHz. Nessuna attribuzione terrestre a 1245–1270 e 1298–1300 MHz. La nota 117 ammette 1267–1270 solo via satellite Terra→spazio, secondario (art. 25.11 RR), non gestito dagli SPOT ordinari. Proteggere i servizi primari.',segments:[{from:1296000000,to:1296400000,modes:['CW','Fonia','SSB',...DIGITAL],label:'All mode weak signal; 1296,200 centro attività SSB'},{from:1297000000,to:1297475000,modes:[],label:'Uscite ripetitori FM/DV · non frequenze TX degli utenti'},{from:1297500000,to:1297975000,modes:FMDV,label:'Canali FM/DV simplex · passo 25 kHz; 1297,725 chiamata DV'}]},
  {band:'0.13',name:'13 cm',range:'2300–2450 MHz',notes:'PNRF Italia: uso radioamatoriale soggetto a co-attribuzioni e Note MIMIT; verificare porzione e condizioni prima di trasmettere.',segments:[{from:2320000000,to:2320400000,modes:['CW','Fonia','SSB',...DIGITAL],label:'All mode weak signal; 2320,200 centro attività SSB'},{from:2322000000,to:2324000000,modes:[],label:'Usi a larga banda · consultare piano dettagliato, nessun suggerimento DMR generico'}]}
];
export function bandPlanMatches(band, mode) {
  const plan = BAND_PLAN.find(item => item.band === band);
  if (!plan) return [];
  return plan.segments.filter(segment => !mode || segment.modes.includes(mode));
}
export function locatorFromGPS(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('Posizione GPS non valida.');
  const x = Math.min(longitude + 180, 360 - 1e-9);
  const y = Math.min(latitude + 90, 180 - 1e-9);
  return String.fromCharCode(65 + Math.floor(x / 20), 65 + Math.floor(y / 10)) +
    Math.floor((x % 20) / 2) + String(Math.floor(y % 10)) +
    String.fromCharCode(65 + Math.floor((x % 2) * 12), 65 + Math.floor((y % 1) * 24));
}
export function validateSpot(input) {
  if (!input || typeof input !== 'object') throw new Error('SPOT non valido.');
  const callsign = String(input.callsign ?? '').trim().toUpperCase();
  if (!/^(?=.{3,20}$)(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(callsign)) throw new Error('Inserisci un nominativo radioamatoriale valido.');
  const band = BANDS.find(b => b[0] === input.band);
  const dmr_type = input.mode==='DMR' ? String(input.dmr_type ?? '') : '';
  if(input.mode==='DMR' && !['direct','bm'].includes(dmr_type)) throw new Error('Scegli DMR Diretto oppure BM TG.');
  const isBM=dmr_type==='bm';
  const tg=String(input.talkgroup ?? '').trim();
  if(isBM && (!/^[1-9]\d{0,7}$/.test(tg) || Number(tg)>16777215)) throw new Error('Inserisci un talkgroup BrandMeister da 1 a 16777215.');
  const value = String(input.frequency ?? '').trim().replace(',', '.');
  if (!isBM && !/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('Frequenza in MHz, con massimo 6 decimali.');
  const frequency_hz = isBM ? 0 : Math.round(Number(value) * 1e6);
  if (!isBM && (!band || frequency_hz < band[1] || frequency_hz > band[2])) throw new Error('La frequenza non rientra nella banda selezionata.');
  if (!isBM && !isFrequencyAllowed(band[0], frequency_hz)) throw new Error('Questa porzione non è disponibile per SPOT ordinari secondo il PNRF italiano.');
  if (!MODES.includes(input.mode)) throw new Error('Modo non valido.');
  const locator = String(input.locator ?? '').toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(locator)) throw new Error('Inserisci un locator valido a sei caratteri oppure usa il GPS.');
  const activity = String(input.activity ?? '').toUpperCase();
  const activity_name = String(input.activity_name ?? '').trim().toUpperCase();
  if (!['','SOTA','POTA','IAC','CONTEST'].includes(activity)) throw new Error('Attività non valida.');
  if (activity && (!activity_name || activity_name.length > 80 || /[\x00-\x1f]/.test(activity_name))) throw new Error('Inserisci il nome o riferimento dell’attività (massimo 80 caratteri).');
  const notes=String(input.notes ?? '').trim();
  if(notes.length>500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(notes))throw new Error('Le note possono contenere al massimo 500 caratteri.');
  return { callsign, band: isBM ? '' : band[0], frequency_hz, mode: input.mode, locator, activity, activity_name: activity ? activity_name : '',dmr_type,talkgroup:isBM?Number(tg):null,notes };
}
export function distanceBetween(from,to) {
  const a=locatorCenter(from),b=locatorCenter(to),r=Math.PI/180;
  const h=Math.sin((b.latitude-a.latitude)*r/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;
  return Math.round(6371.0088*2*Math.asin(Math.sqrt(Math.min(1,h)))*10)/10;
}
export function formatUtcLogDate(seconds, referenceSeconds=Math.floor(Date.now()/1000)) {
  const date=new Date(seconds*1000), reference=new Date(referenceSeconds*1000);
  const time=new Intl.DateTimeFormat('it-IT',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}).format(date);
  const sameDay=date.getUTCFullYear()===reference.getUTCFullYear() && date.getUTCMonth()===reference.getUTCMonth() && date.getUTCDate()===reference.getUTCDate();
  if(sameDay)return time;
  const datePart=new Intl.DateTimeFormat('it-IT',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:date.getUTCFullYear()===reference.getUTCFullYear()?undefined:'numeric'}).format(date);
  return `${datePart} ${time}`;
}
export function validateQSL(input,spot,now=Math.floor(Date.now()/1000)) {
  if(!input || typeof input!=='object')throw new Error('Dati QSL non validi.');
  const profile=validateProfile({callsign:input.callsign,name:'QSL',default_locator:input.locator});
  const report=String(input.report ?? '').trim() || (spot.mode==='CW' ? '599' : '59');
  if(!(spot.mode==='CW' ? /^[1-5][1-9][1-9]$/ : /^[1-5][1-9]$/).test(report))throw new Error(spot.mode==='CW' ? 'Inserisci RST: R 1–5, S 1–9, T 1–9 (es. 599).' : 'Inserisci RS: R 1–5, S 1–9 (es. 59).');
  const occurred_at=input.occurred_at;
  if(!Number.isSafeInteger(occurred_at) || occurred_at<spot.created_at || occurred_at>now+60)throw new Error('L’orario UTC deve essere compreso tra l’inizio dello SPOT e adesso.');
  return {callsign:profile.callsign,locator:profile.default_locator,report,occurred_at,distance_km:distanceBetween(profile.default_locator,spot.locator)};
}
export function validateProfile(input) {
  const callsign = String(input?.callsign ?? '').trim().toUpperCase();
  const default_locator = String(input?.default_locator ?? '').trim().toUpperCase();
  validateSpot({callsign,locator:default_locator,band:'40',frequency:'7.1',mode:'CW'});
  const name = String(input?.name ?? '').trim();
  if (!name || name.length > 60 || /[\x00-\x1f]/.test(name)) throw new Error('Inserisci il nome (massimo 60 caratteri).');
  return {callsign,name,default_locator};
}
export function locatorCenter(locator) {
  const l = String(locator).toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(l)) throw new Error('Inserisci un locator valido a sei caratteri.');
  return {latitude:(l.charCodeAt(1)-65)*10+Number(l[3])+(l.charCodeAt(5)-65+.5)/24-90,
    longitude:(l.charCodeAt(0)-65)*20+Number(l[2])*2+(l.charCodeAt(4)-65+.5)/12-180};
}
export function bearingBetween(from,to) {
  const a=locatorCenter(from),b=locatorCenter(to),rad=Math.PI/180;
  if (a.latitude===b.latitude && a.longitude===b.longitude) return null;
  const p=a.latitude*rad,q=b.latitude*rad,d=(b.longitude-a.longitude)*rad;
  return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))/rad+360)%360;
}
export const formatFrequency = hz => (hz / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
