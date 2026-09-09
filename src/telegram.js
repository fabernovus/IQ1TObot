import { formatFrequency, formatUtcLogDate } from '../public/radio.js';
export async function telegram(env, method, payload) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!data.ok) {
      if (method === 'editMessageText' && data.description?.includes('message is not modified')) return true;
      const error = new Error('Telegram non disponibile. Riprova tra poco.');
      error.retryAfter = Math.min(86400, Math.max(30, Number(data.parameters?.retry_after) || 60));
      throw error;
    }
    return data.result;
  } catch (error) {
    // Never propagate network errors containing the bot token URL.
    const safe = new Error('Telegram non disponibile. Riprova tra poco.');
    safe.retryAfter = error.retryAfter || 60;
    throw safe;
  }
}
export function isMember(member) {
  return ['creator','administrator','member'].includes(member.status) || (member.status === 'restricted' && member.is_member === true);
}
export function spotMessage(spot,logs=[]) {
  const utc=seconds=>formatUtcLogDate(seconds);
  const row=(label,value)=>`<tr><th>${label}</th><td>${escapeHTML(value)}</td></tr>`;
  const network=spot.mode==='DMR' && spot.dmr_type==='bm';
  const info=network ? row('Rete','BrandMeister')+row('Talkgroup',spot.talkgroup) : row('Banda',`${spot.band} m`)+row('Frequenza',`${formatFrequency(spot.frequency_hz)} MHz`);
  const report=spot.mode==='CW'?'RST':'RS';
  const logRows=logs.slice(0,100).map(log=>`<tr><td>${utc(log.occurred_at)}</td><td>${escapeHTML(log.callsign)}</td><td>${escapeHTML(log.locator)}</td><td>${Number(log.distance_km).toFixed(1)}</td><td>${escapeHTML(log.report)}</td></tr>`).join('');
  return `<h2>${spot.ended_at ? '⚫ QRT' : '🟢 CQ SPOT'} · <b>${escapeHTML(spot.callsign)}</b></h2>`+
    `<table bordered compact>${info}${row('Modo',spot.mode+(spot.dmr_type==='direct'?' · Diretto':''))}${row('Locator',spot.locator)}${spot.activity?row(spot.activity,spot.activity_name):''}</table>`+
    (spot.notes?`<h3>Note</h3><blockquote>${escapeHTML(spot.notes).replace(/\n/g,'<br>')}</blockquote>`:'')+
    `<h3>QSL Log · ${spot.qsl_count || 0}</h3>`+
    (logs.length?`<table bordered striped compact><tr><th>Data/ora UTC</th><th>Nominativo</th><th>Locator</th><th>km*</th><th>${report}</th></tr>${logRows}</table>`:'<p>Nessun QSO confermato.</p>')+
    (spot.qsl_count>100?'<p>Ultimi 100 QSL. Log completo nella Mini App.</p>':'')+
    `<p><i>* Distanza tra LOC</i></p>`+
    `<footer>${spot.ended_at?'Terminato':'In radio'}: ${utc(spot.ended_at || spot.created_at)} UTC</footer>`;
}
const escapeHTML = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const topicFor = (activity,env) => ['SOTA','POTA'].includes(activity) ? 12 : activity==='IAC' ? 5 : Number(env.TELEGRAM_TOPIC_ID);
export async function syncSpot(env, id) {
  const now = Math.floor(Date.now()/1000);
  const spot = await env.DB.prepare(`UPDATE spots SET sync_state='sending', lease_until=?, sync_attempts=sync_attempts+1
    WHERE id=? AND sync_state='pending' AND sync_after<=? RETURNING *`).bind(now+90,id,now).first();
  if (!spot) return;
  try {
    const logs=await env.DB.prepare('SELECT callsign,locator,report,occurred_at,distance_km FROM qsl_logs WHERE spot_id=? ORDER BY id DESC LIMIT 100').bind(id).all();
    const result = await telegram(env, spot.message_id ? 'editMessageText' : 'sendRichMessage', {
      chat_id: env.TELEGRAM_GROUP_ID,
      ...(spot.message_id ? { message_id: spot.message_id } : { message_thread_id: spot.topic_id ?? topicFor(spot.activity,env) }),
      rich_message:{html:spotMessage(spot,logs.results),skip_entity_detection:true},
      reply_markup:{inline_keyboard:[...(spot.ended_at || !spot.frequency_hz ? [] : [[{text:'🧭 Direzione antenna',url:`https://t.me/IQ1TObot?startapp=bearing_${spot.locator}`}]]),[{text:spot.ended_at?'📒 QSL Log':'📒 QSL Log · Conferma QSO',url:`https://t.me/IQ1TObot?startapp=qsl_${spot.id}`}]]}
    });
    // A QRT may have happened while sendMessage was in flight: preserve its pending edit.
    await env.DB.prepare(`UPDATE spots SET message_id=COALESCE(message_id,?),
      sync_state=CASE WHEN ended_at IS ? AND revision=? THEN 'synced' ELSE 'pending' END,
      sync_attempts=0, sync_after=0, lease_until=0 WHERE id=?`).bind(spot.message_id || result.message_id,spot.ended_at,spot.revision,id).run();
  } catch (error) {
    await env.DB.prepare(`UPDATE spots SET sync_state=?, sync_after=?, lease_until=0 WHERE id=?`)
      .bind(spot.sync_attempts >= 8 ? 'failed' : 'pending',now+Math.max(error.retryAfter || 60,Math.min(3600,30 * 2 ** spot.sync_attempts)),id).run();
  }
}
