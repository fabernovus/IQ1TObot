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
  const value = String(input.frequency ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('Frequenza in MHz, con massimo 6 decimali.');
  const frequency_hz = Math.round(Number(value) * 1e6);
  if (!band || frequency_hz < band[1] || frequency_hz > band[2]) throw new Error('La frequenza non rientra nella banda selezionata.');
  if (!MODES.includes(input.mode)) throw new Error('Modo non valido.');
  const locator = String(input.locator ?? '').toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(locator)) throw new Error('Acquisisci prima la posizione GPS.');
  return { callsign, band: band[0], frequency_hz, mode: input.mode, locator };
}
export const formatFrequency = hz => (hz / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
