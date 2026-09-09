import { verifyInitData } from './auth.js';
import { validateSpot, validateProfile } from '../public/radio.js';
import { isMember, syncSpot, telegram, topicFor } from './telegram.js';
const json = (value, status=200) => Response.json(value, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
const fail = (status,message) => Object.assign(new Error(message),{status});
const now = () => Math.floor(Date.now()/1000);
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail(415,'Invia dati JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw fail(400,'Dati mancanti.');
  let length = 0; const chunks = [];
  while (true) {
    const {value,done} = await reader.read(); if (done) break;
    length += value.length;
    if (length > 4096) { await reader.cancel(); throw fail(413,'Richiesta troppo grande.'); }
    chunks.push(value);
  }
  try { return JSON.parse(await new Blob(chunks).text()); } catch { throw fail(400,'JSON non valido.'); }
}
async function handle(request,env,ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  const missing = [];
  if (typeof env.TELEGRAM_BOT_TOKEN !== 'string' || !env.TELEGRAM_BOT_TOKEN.trim()) missing.push('TELEGRAM_BOT_TOKEN');
  if (!String(env.TELEGRAM_GROUP_ID ?? '').trim()) missing.push('TELEGRAM_GROUP_ID');
  if (!/^[1-9]\d*$/.test(env.TELEGRAM_TOPIC_ID || '')) missing.push('TELEGRAM_TOPIC_ID (intero maggiore di zero)');
  if (missing.length) throw fail(503,`Configurazione Worker incompleta: ${missing.join(', ')}. Contatta un amministratore.`);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw fail(403,'Origine non consentita.');
  let user;
  try { user = await verifyInitData(request.headers.get('X-Telegram-Init-Data'),env.TELEGRAM_BOT_TOKEN); }
  catch (error) { throw fail(401,error.message); }
  let member;
  try { member = await telegram(env,'getChatMember',{ chat_id:env.TELEGRAM_GROUP_ID,user_id:user.id }); }
  catch { throw fail(503,'Non riesco a verificare l’appartenenza al gruppo. Riprova tra poco.'); }
  if (!isMember(member)) throw fail(403,'Questa Mini App è riservata ai membri del gruppo IQ1TO.');
  if (!env.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') {
    throw fail(503,'Database non collegato: configura il binding D1 chiamato DB nel Worker.');
  }
  if (request.method === 'GET' && url.pathname === '/api/spots') {
    const [active,mine,profile] = await env.DB.batch([
      env.DB.prepare(`SELECT id,callsign,band,frequency_hz,mode,locator,created_at,activity,activity_name FROM spots WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 200`),
      env.DB.prepare(`SELECT id,callsign,band,frequency_hz,mode,locator,created_at,ended_at,sync_state,activity,activity_name FROM spots WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).bind(user.id),
      env.DB.prepare('SELECT callsign,name,default_locator,is_admin FROM profiles WHERE telegram_id=?').bind(user.id)
    ]);
    return json({ spots:active.results, mine:mine.results[0] || null, profile:profile.results[0] || null });
  }
  if (request.method === 'PUT' && url.pathname === '/api/profile') {
    let profile;
    const input=await body(request);
    try { profile=validateProfile(input); } catch(error) { throw fail(400,error.message); }
    try {
      await env.DB.prepare(`INSERT INTO profiles(telegram_id,callsign,name,default_locator) VALUES(?,?,?,?)
        ON CONFLICT(telegram_id) DO UPDATE SET callsign=excluded.callsign,name=excluded.name,default_locator=excluded.default_locator`)
        .bind(user.id,profile.callsign,profile.name,profile.default_locator).run();
    } catch(error) {
      if (/UNIQUE constraint failed:\s*profiles.callsign/i.test(error.message)) throw fail(409,'Questo nominativo è già associato a un altro account Telegram.');
      throw error;
    }
    return json({ok:true});
  }
  if (request.method === 'POST' && url.pathname === '/api/spots') {
    const input = await body(request);
    let spot;
    try { spot = validateSpot(input); } catch (error) { throw fail(400,error.message); }
    if (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) throw fail(400,'ID richiesta non valido.');
    const previous = await env.DB.prepare('SELECT id FROM spots WHERE id=? AND user_id=?').bind(input.id,user.id).first();
    if (previous) return json({id:previous.id},200);
    const time = now();
    // Atomic cooldown plus unique partial index protects simultaneous requests.
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO spots(id,user_id,callsign,band,frequency_hz,mode,locator,created_at,activity,activity_name,topic_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM spots WHERE user_id=? AND created_at>?)`)
      .bind(input.id,user.id,spot.callsign,spot.band,spot.frequency_hz,spot.mode,spot.locator,time,spot.activity,spot.activity_name,topicFor(spot.activity,env),user.id,time-60).run();
    if (!result.meta.changes) throw fail(409,'Hai già uno SPOT attivo oppure ne hai pubblicato uno nell’ultimo minuto.');
    ctx.waitUntil(syncSpot(env,input.id));
    return json({id:input.id},201);
  }
  const match = url.pathname.match(/^\/api\/spots\/([0-9a-f-]{36})\/qrt$/i);
  if (request.method === 'POST' && match) {
    const owned = await env.DB.prepare('SELECT id FROM spots WHERE id=? AND user_id=?').bind(match[1],user.id).first();
    if (!owned) throw fail(404,'SPOT non trovato.');
    await env.DB.prepare(`UPDATE spots SET ended_at=?, sync_state=CASE WHEN sync_state='sending' THEN 'sending' ELSE 'pending' END,
      sync_after=0, sync_attempts=0 WHERE id=? AND user_id=? AND ended_at IS NULL`).bind(now(),match[1],user.id).run();
    ctx.waitUntil(syncSpot(env,match[1]));
    return json({ok:true});
  }
  throw fail(404,'Risorsa non trovata.');
}
export default {
  async fetch(request,env,ctx) {
    try { return await handle(request,env,ctx); }
    catch (error) {
      if (error.status) return json({error:error.message},error.status);
      // Classify known failures without exposing raw SQL, credentials or request data.
      const detail = [error.message,error.cause?.message].filter(Boolean).join(' ');
      if (/no such table:\s*(spots|profiles)\b/i.test(detail)) {
        return json({error:'Database non inizializzato: applica le migrazioni D1 sul database remoto.'},503);
      }
      if (/no such column\b|has no column named\b/i.test(detail)) {
        return json({error:'Database da aggiornare: applica le migrazioni D1 sul database remoto.'},503);
      }
      const reference = crypto.randomUUID();
      console.error(JSON.stringify({event:'request_failed',reference,category:/D1_ERROR/.test(detail) ? 'database' : 'internal'}));
      return json({error:`Errore temporaneo. Riprova tra poco. Riferimento: ${reference}`},500);
    }
  },
  async scheduled(_event,env) {
    if (!env.TELEGRAM_BOT_TOKEN || !/^[1-9]\d*$/.test(env.TELEGRAM_TOPIC_ID || '')) return;
    const time = now();
    await env.DB.prepare(`UPDATE spots SET sync_state=CASE WHEN sync_attempts>=8 THEN 'failed' ELSE 'pending' END WHERE sync_state='sending' AND lease_until<?`).bind(time).run();
    const pending = await env.DB.prepare(`SELECT id FROM spots WHERE sync_state='pending' AND sync_after<=? LIMIT 10`).bind(time).all();
    await Promise.all(pending.results.map(s => syncSpot(env,s.id)));
    await env.DB.prepare(`DELETE FROM spots WHERE id IN (SELECT id FROM spots WHERE ended_at<? AND sync_state IN ('synced','failed') LIMIT 500)`).bind(time-30*86400).run();
  }
};
