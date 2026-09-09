import { formatFrequency } from '../public/radio.js';
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
export function spotMessage(spot) {
  const time = new Date((spot.ended_at || spot.created_at)*1000).toLocaleString('it-IT', { timeZone:'Europe/Rome', day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' });
  return `<b>${spot.ended_at ? '⚫ QRT' : '🟢 CQ SPOT'} · ${escapeHTML(spot.callsign)}</b>\n\n📻 <code>${formatFrequency(spot.frequency_hz)} MHz</code> · <b>${escapeHTML(spot.mode)}</b>\nBanda <b>${escapeHTML(spot.band)} m</b> · Locator <code>${escapeHTML(spot.locator)}</code>${spot.activity ? `\n🏷 <b>${escapeHTML(spot.activity)}</b> · ${escapeHTML(spot.activity_name)}` : ''}\n\n<i>${spot.ended_at ? 'Terminato' : 'In radio'}: ${time} (Roma)</i>`;
}
const escapeHTML = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const topicFor = (activity,env) => ['SOTA','POTA'].includes(activity) ? 12 : activity==='IAC' ? 5 : Number(env.TELEGRAM_TOPIC_ID);
export async function syncSpot(env, id) {
  const now = Math.floor(Date.now()/1000);
  const spot = await env.DB.prepare(`UPDATE spots SET sync_state='sending', lease_until=?, sync_attempts=sync_attempts+1
    WHERE id=? AND sync_state='pending' AND sync_after<=? RETURNING *`).bind(now+90,id,now).first();
  if (!spot) return;
  try {
    const result = await telegram(env, spot.message_id ? 'editMessageText' : 'sendMessage', {
      chat_id: env.TELEGRAM_GROUP_ID,
      ...(spot.message_id ? { message_id: spot.message_id } : { message_thread_id: spot.topic_id ?? topicFor(spot.activity,env) }),
      text: spotMessage(spot), parse_mode:'HTML',
      reply_markup:{inline_keyboard:spot.ended_at ? [] : [[{text:'🧭 Direzione antenna',url:`https://t.me/IQ1TObot?startapp=bearing_${spot.locator}`}]]}
    });
    // A QRT may have happened while sendMessage was in flight: preserve its pending edit.
    await env.DB.prepare(`UPDATE spots SET message_id=COALESCE(message_id,?),
      sync_state=CASE WHEN ended_at IS ? THEN 'synced' ELSE 'pending' END,
      sync_attempts=0, sync_after=0, lease_until=0 WHERE id=?`).bind(spot.message_id || result.message_id,spot.ended_at,id).run();
  } catch (error) {
    await env.DB.prepare(`UPDATE spots SET sync_state=?, sync_after=?, lease_until=0 WHERE id=?`)
      .bind(spot.sync_attempts >= 8 ? 'failed' : 'pending',now+Math.max(error.retryAfter || 60,Math.min(3600,30 * 2 ** spot.sync_attempts)),id).run();
  }
}
