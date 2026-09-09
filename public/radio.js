// Frequency ranges are an application allowlist based on IARU Region 1.
// They do not certify an operator's national privileges or permitted modes/power.
export const BANDS = [
  ['2200',135700,137800], ['630',472000,479000], ['160',1810000,2000000],
  ['80',3500000,3800000], ['60',5351500,5366500], ['40',7000000,7200000],
  ['30',10100000,10150000], ['20',14000000,14350000], ['17',18068000,18168000],
  ['15',21000000,21450000], ['12',24890000,24990000], ['10',28000000,29700000],
  ['6',50000000,52000000], ['4',70000000,70500000], ['2',144000000,146000000],
  ['0.70',430000000,440000000], ['0.23',1240000000,1300000000],
  ['0.13',2300000000,2450000000]
];
export const MODES = ['CW','Fonia','SSB','FM','AM','FT8','FT4','RTTY','PSK31','JS8','D-Star','DMR','C4FM','SSTV'];
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
export function validateQSL(input,spot,now=Math.floor(Date.now()/1000)) {
  if(!input || typeof input!=='object')throw new Error('Dati QSL non validi.');
  const profile=validateProfile({callsign:input.callsign,name:'QSL',default_locator:input.locator});
  const report=String(input.report ?? '').trim();
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
