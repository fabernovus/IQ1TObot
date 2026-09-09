const encoder = new TextEncoder();
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(value));
}
export async function verifyInitData(raw, token, now = Math.floor(Date.now()/1000)) {
  if (!raw || raw.length > 8192 || !token) throw new Error('Apri la Mini App dal bot Telegram.');
  const params = new URLSearchParams(raw);
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error('Autenticazione non valida.');
  const hash = params.get('hash');
  if (!/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('Autenticazione non valida.');
  params.delete('hash');
  const data = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', token);
  const expected = new Uint8Array(await hmac(secret, data));
  let difference = 0;
  expected.forEach((byte, i) => { difference |= byte ^ parseInt(hash.slice(i*2,i*2+2),16); });
  const date = Number(params.get('auth_date'));
  if (difference || !Number.isInteger(date) || date > now + 30 || now - date > 3600) throw new Error('Sessione scaduta o non valida. Chiudi e riapri la Mini App.');
  let user;
  try { user = JSON.parse(params.get('user')); } catch { throw new Error('Utente non valido.'); }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.is_bot) throw new Error('Utente non valido.');
  return user;
}
