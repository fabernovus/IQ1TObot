import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { verifyInitData } from '../src/auth.js';
import { BANDS, locatorFromGPS, validateSpot } from '../public/radio.js';
import { isMember, syncSpot } from '../src/telegram.js';
import worker from '../src/worker.js';
const token='test-token-not-a-real-credential';
function signed(id=123,date=Math.floor(Date.now()/1000)) {
  const params=new URLSearchParams({auth_date:String(date),query_id:'test',user:JSON.stringify({id,first_name:'Test'})});
  const data=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const key=createHmac('sha256','WebAppData').update(token).digest();
  params.set('hash',createHmac('sha256',key).update(data).digest('hex'));return params.toString();
}
const input={id:'c8006325-6077-4d30-854b-e33b89fe744f',callsign:'iu1abc/p',band:'40',frequency:'7,100',mode:'Fonia',locator:'JN35TA'};
function database() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_spots.sql',import.meta.url),'utf8'));
  return { prepare(sql) {
    const stmt=db.prepare(sql);let args=[];
    const wrapper={bind(...values){args=values;return wrapper;},async first(){return stmt.get(...args) || null;},async all(){return {results:stmt.all(...args)};},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}};}};return wrapper;
  },async batch(statements){return Promise.all(statements.map(s=>s.all()));},close(){db.close();} };
}
test('Telegram signature, expiration, tampering and duplicate fields',async()=>{
  assert.equal((await verifyInitData(signed(),token)).id,123);
  await assert.rejects(verifyInitData(signed().replace('query_id=test','query_id=evil'),token));
  await assert.rejects(verifyInitData(signed(123,1),token));
  await assert.rejects(verifyInitData(signed()+'&auth_date=1',token));
  await assert.rejects(verifyInitData(signed(123,Math.floor(Date.now()/1000)+100),token));
});
test('GPS locator and all supported band boundaries',()=>{
  assert.equal(locatorFromGPS(0,0),'JJ00AA');
  assert.equal(locatorFromGPS(45.0703,7.6869),'JN35UB');
  assert.equal(locatorFromGPS(-90,-180),'AA00AA');
  assert.equal(locatorFromGPS(90,180),'RR99XX');
  assert.throws(()=>locatorFromGPS(NaN,10));
  for(const [band,min,max] of BANDS) {
    assert.equal(validateSpot({...input,band,frequency:String(min/1e6)}).frequency_hz,min);
    assert.equal(validateSpot({...input,band,frequency:String(max/1e6)}).frequency_hz,max);
    assert.throws(()=>validateSpot({...input,band,frequency:String((min-1)/1e6)}));
  }
  assert.throws(()=>validateSpot({...input,frequency:'27.125'}));
  assert.throws(()=>validateSpot({...input,mode:'<script>'}));
  assert.throws(()=>validateSpot({...input,locator:'ZZ00ZZ'}));
  assert.throws(()=>validateSpot({...input,callsign:'<b>IU1ABC</b>'}));
});
test('group membership statuses',()=>{
  for(const status of ['creator','administrator','member'])assert.ok(isMember({status}));
  for(const status of ['left','kicked','restricted'])assert.equal(isMember({status}),false);
  assert.ok(isMember({status:'restricted',is_member:true}));
});
test('authenticated create/list, idempotency, ownership, QRT and Telegram sync',async t=>{
  const DB=database();t.after(()=>DB.close());
  const calls=[];let memberStatus='member';
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const method=url.split('/').pop();calls.push({method,body:JSON.parse(options.body)});
    return Response.json({ok:true,result:method==='getChatMember' ? {status:memberStatus} : {message_id:42}});
  });
  const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'123'};
  let pending=[];const ctx={waitUntil(p){pending.push(p);}};
  const flush=async()=>{await Promise.all(pending);pending=[];};
  const request=(path,method='GET',payload,user=123)=>worker.fetch(new Request('https://spot.example/api'+path,{method,headers:{'X-Telegram-Init-Data':signed(user),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined}),env,ctx);
  const created=await request('/spots','POST',input);assert.equal(created.status,201);await flush();
  assert.equal(calls.find(c=>c.method==='sendMessage').body.message_thread_id,123);
  assert.equal((await request('/spots','POST',input)).status,200);await flush();
  assert.equal(calls.filter(c=>c.method==='sendMessage').length,1);
  assert.equal((await request('/spots','POST',{...input,id:crypto.randomUUID()})).status,409);
  const list=await (await request('/spots')).json();assert.equal(list.spots.length,1);assert.equal(list.mine.callsign,'IU1ABC/P');assert.equal(list.mine.sync_state,'synced');
  assert.equal((await request(`/spots/${input.id}/qrt`,'POST',undefined,456)).status,404);
  assert.equal((await request(`/spots/${input.id}/qrt`,'POST')).status,200);await flush();
  assert.ok(calls.find(c=>c.method==='editMessageText').body.text.includes('QRT'));
  assert.equal((await (await request('/spots')).json()).spots.length,0);
  memberStatus='left';assert.equal((await request('/spots')).status,403);
  const unauth=await worker.fetch(new Request('https://spot.example/api/spots'),env,ctx);assert.equal(unauth.status,401);
  const cross=await worker.fetch(new Request('https://spot.example/api/spots',{headers:{Origin:'https://evil.example'}}),env,ctx);assert.equal(cross.status,403);
});
test('failed delivery persists, retries; QRT during send schedules an edit',async t=>{
  const DB=database();t.after(()=>DB.close());const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'123'};
  await DB.prepare(`INSERT INTO spots(id,user_id,callsign,band,frequency_hz,mode,locator,created_at) VALUES('race',123,'IU1ABC','40',7100000,'CW','JN35UB',1)`).run();
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('network failure');});
  await syncSpot(env,'race');assert.equal((await DB.prepare("SELECT * FROM spots WHERE id='race'").first()).sync_state,'pending');
  await DB.prepare("UPDATE spots SET sync_after=0 WHERE id='race'").run();
  globalThis.fetch=async()=>{
    await DB.prepare("UPDATE spots SET ended_at=2 WHERE id='race'").run();
    return Response.json({ok:true,result:{message_id:99}});
  };
  await syncSpot(env,'race');let row=await DB.prepare("SELECT * FROM spots WHERE id='race'").first();assert.equal(row.message_id,99);assert.equal(row.sync_state,'pending');
  let edit;
  globalThis.fetch=async(url,options)=>{edit={url,body:JSON.parse(options.body)};return Response.json({ok:true,result:true});};
  await syncSpot(env,'race');assert.ok(edit.url.endsWith('/editMessageText'));assert.ok(edit.body.text.includes('QRT'));
  row=await DB.prepare("SELECT * FROM spots WHERE id='race'").first();assert.equal(row.sync_state,'synced');
});
