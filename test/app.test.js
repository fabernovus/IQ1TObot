import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { verifyInitData } from '../src/auth.js';
import { BANDS, locatorFromGPS, locatorCenter, validateSpot, validateProfile, validateQSL, distanceBetween, formatUtcLogDate, bearingBetween } from '../public/radio.js';
import { stepFrequency } from '../public/controls.js';
import { preciseGPS } from '../public/gps.js';
import { isMember, syncSpot, spotMessage, topicFor } from '../src/telegram.js';
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
  db.exec(readFileSync(new URL('../migrations/0002_profiles_activities.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_dmr_qsl.sql',import.meta.url),'utf8'));
  db.exec('PRAGMA foreign_keys=ON');
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
test('frequency digit increments carry, borrow and respect every band edge',()=>{
  const band=BANDS.find(b=>b[0]==='40');
  assert.equal(stepFrequency(7099999,0,1,band),7100000);
  assert.equal(stepFrequency(7100000,0,-1,band),7099999);
  assert.equal(stepFrequency(7100000,3,1,band),7101000);
  for(const b of BANDS) {
    assert.equal(stepFrequency(b[1],0,-1,b),b[1]);
    assert.equal(stepFrequency(b[2],0,1,b),b[2]);
  }
});
test('locator conversion preserves cell centres across hemispheres and boundaries',()=>{
  for(const locator of ['JN35UC','JN35UB','AA00AA','RR99XX','JJ00AA','QF56OD','IO91WM','FN31PR']) {
    const p=locatorCenter(locator);assert.equal(locatorFromGPS(p.latitude,p.longitude),locator);
  }
  assert.equal(locatorFromGPS(0,-0.000001),'IJ90XA');
  assert.equal(locatorFromGPS(-0.000001,0),'JI09AX');
});
test('GPS requests uncached high accuracy, ignores stale fixes and stops on precise fix',async()=>{
  let callback,options,cleared;
  const geo={watchPosition(success,_error,opts){callback=success;options=opts;return 7;},clearWatch(id){cleared=id;}};
  const result=preciseGPS(geo,1000);
  assert.equal(options.enableHighAccuracy,true);assert.equal(options.maximumAge,0);
  callback({timestamp:Date.now()-60000,coords:{latitude:0,longitude:0,accuracy:1}});
  callback({timestamp:Date.now(),coords:{latitude:45,longitude:7,accuracy:800}});
  callback({timestamp:Date.now(),coords:{latitude:45.1,longitude:7.7,accuracy:12}});
  assert.deepEqual(await result,{latitude:45.1,longitude:7.7,accuracy:12});assert.equal(cleared,7);
});
test('GPS deadline keeps best fix and permission denial cleans up',async()=>{
  let callback,errorCallback,cleared=0;
  const geo={watchPosition(success,error){callback=success;errorCallback=error;return 1;},clearWatch(){cleared++;}};
  const result=preciseGPS(geo,10);
  callback({timestamp:Date.now(),coords:{latitude:45,longitude:7,accuracy:60}});
  callback({timestamp:Date.now(),coords:{latitude:46,longitude:8,accuracy:900}});
  assert.equal((await result).accuracy,60);assert.equal(cleared,1);
  const denied=preciseGPS(geo,1000);errorCallback({code:1});await assert.rejects(denied,/Consenti/);assert.equal(cleared,2);
});
test('activity routing, uppercase, escaped HTML and bearings',()=>{
  const env={TELEGRAM_TOPIC_ID:'8'};
  for(const activity of ['SOTA','POTA']) assert.equal(topicFor(activity,env),12);
  assert.equal(topicFor('IAC',env),5);
  for(const activity of ['','CONTEST'])assert.equal(topicFor(activity,env),8);
  const spot=validateSpot({...input,activity:'sota',activity_name:'i/pm-001 & <test>'});
  assert.equal(spot.activity_name,'I/PM-001 & <TEST>');assert.equal(spot.callsign,'IU1ABC/P');
  assert.throws(()=>validateSpot({...input,activity:'CONTEST'}));
  const html=spotMessage({...spot,created_at:1});assert.ok(html.includes('<b>'));assert.ok(html.includes('&amp; &lt;TEST&gt;'));assert.ok(!html.includes('<TEST>'));
  assert.equal(validateProfile({callsign:'iu1abc',name:'Antonio',default_locator:'jn35uc'}).default_locator,'JN35UC');
  assert.equal(bearingBetween('JN35UC','JN35UC'),null);
  assert.equal(Math.round(bearingBetween('JN35UC','JN36UC')),0);
  assert.equal(Math.round(bearingBetween('JN36UC','JN35UC')),180);
  assert.ok(bearingBetween('JN35UC','JN45UC')>89 && bearingBetween('JN35UC','JN45UC')<90);
});
test('profile registration is bound to signed Telegram ID and preserves admin role',async t=>{
  const DB=database();t.after(()=>DB.close());
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,result:{status:'member'}}));
  const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'8'};
  const request=(id,payload)=>worker.fetch(new Request('https://spot.example/api/profile',{method:'PUT',headers:{'X-Telegram-Init-Data':signed(id),'Content-Type':'application/json'},body:JSON.stringify(payload)}),env,{});
  const seeded=await DB.prepare('SELECT * FROM profiles WHERE telegram_id=22699108').first();
  assert.equal(seeded.callsign,'IU1WWY');assert.equal(seeded.default_locator,'JN35UC');assert.equal(seeded.is_admin,1);
  const profile={callsign:'iu1abc',name:'Test',default_locator:'jn35uc',is_admin:1,telegram_id:22699108};
  assert.equal((await request(123,profile)).status,200);
  const registered=await DB.prepare('SELECT * FROM profiles WHERE telegram_id=123').first();assert.equal(registered.is_admin,0);assert.equal(registered.callsign,'IU1ABC');
  assert.equal((await request(456,profile)).status,409);
  assert.equal((await request(22699108,{callsign:'IU1WWY',name:'Antonio',default_locator:'JN35UC',is_admin:0})).status,200);
  assert.equal((await DB.prepare('SELECT is_admin FROM profiles WHERE telegram_id=22699108').first()).is_admin,1);
});
test('configuration accepts numeric group IDs and diagnoses missing D1/schema',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,result:{status:'member'}}));
  const env={TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:-1001234567890,TELEGRAM_TOPIC_ID:8};
  const request=()=>worker.fetch(new Request('https://spot.example/api/spots',{headers:{'X-Telegram-Init-Data':signed()}}),env,{});
  let response=await request();assert.equal(response.status,503);assert.match((await response.json()).error,/binding D1 chiamato DB/);
  env.DB={prepare(){return {bind(){return this;}};},async batch(){throw new Error('D1_ERROR: no such table: spots: SQLITE_ERROR');}};
  response=await request();assert.equal(response.status,503);assert.match((await response.json()).error,/Database non inizializzato/);
  env.DB.batch=async()=>{throw new Error('D1_ERROR: no such column: sync_state');};
  response=await request();assert.equal(response.status,503);assert.match((await response.json()).error,/Database da aggiornare/);
});
test('new activity spots persist their topic and send HTML with antenna link',async t=>{
  const DB=database();t.after(()=>DB.close());const sent=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const payload=JSON.parse(options.body);
    if(url.endsWith('/getChatMember'))return Response.json({ok:true,result:{status:'member'}});
    sent.push(payload);return Response.json({ok:true,result:{message_id:sent.length}});
  });
  const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'8'};
  for(const [i,activity] of ['SOTA','POTA','IAC','CONTEST',''].entries()) {
    const pending=[],id=crypto.randomUUID();
    const result=await worker.fetch(new Request('https://spot.example/api/spots',{method:'POST',headers:{'X-Telegram-Init-Data':signed(100+i),'Content-Type':'application/json'},body:JSON.stringify({...input,id,activity,activity_name:'test'})}),env,{waitUntil(p){pending.push(p);}});
    assert.equal(result.status,201);await Promise.all(pending);
    const spot=await DB.prepare('SELECT * FROM spots WHERE id=?').bind(id).first();
    assert.equal(spot.topic_id,topicFor(activity,env));assert.equal(sent[i].message_thread_id,spot.topic_id);assert.ok(sent[i].rich_message.html.includes('<table'));
    assert.ok(sent[i].reply_markup.inline_keyboard[0][0].url.endsWith('startapp=bearing_JN35TA'));
  }
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
  assert.equal(calls.find(c=>c.method==='sendRichMessage').body.message_thread_id,123);
  assert.equal((await request('/spots','POST',input)).status,200);await flush();
  assert.equal(calls.filter(c=>c.method==='sendRichMessage').length,1);
  const list=await (await request('/spots')).json();assert.equal(list.spots.length,1);assert.equal(list.mine.callsign,'IU1ABC/P');assert.equal(list.mine.sync_state,'synced');
  assert.equal((await request(`/spots/${input.id}/qrt`,'POST',undefined,456)).status,404);
  assert.equal((await request(`/spots/${input.id}/qrt`,'POST')).status,200);await flush();
  assert.ok(calls.find(c=>c.method==='editMessageText').body.rich_message.html.includes('QRT'));
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
  await syncSpot(env,'race');assert.ok(edit.url.endsWith('/editMessageText'));assert.ok(edit.body.rich_message.html.includes('QRT'));
  row=await DB.prepare("SELECT * FROM spots WHERE id='race'").first();assert.equal(row.sync_state,'synced');
});
test('DMR requires transport, BM omits RF data, direct requires valid frequency; notes bounded',()=>{
  assert.throws(()=>validateSpot({...input,mode:'DMR'}),/Scegli/);
  assert.throws(()=>validateSpot({...input,mode:'DMR',dmr_type:'direct',frequency:''}),/Frequenza/);
  const bm=validateSpot({...input,mode:'DMR',dmr_type:'bm',frequency:undefined,band:undefined,talkgroup:'222',notes:'Antenna & <test>\nSeconda riga'});
  assert.equal(bm.frequency_hz,0);assert.equal(bm.band,'');assert.equal(bm.talkgroup,222);
  for(const talkgroup of ['0','-1','1.5','16777216','text'])assert.throws(()=>validateSpot({...input,mode:'DMR',dmr_type:'bm',talkgroup}));
  assert.throws(()=>validateSpot({...input,notes:'a'.repeat(501)}));
  const html=spotMessage({...bm,created_at:1});assert.ok(html.includes('BrandMeister'));assert.ok(!html.includes('0 MHz'));assert.ok(html.includes('&lt;test&gt;<br>Seconda riga'));
});
test('three concurrent active spots allowed, fourth rejected, QRT frees one slot',async t=>{
  const DB=database();t.after(()=>DB.close());
  t.mock.method(globalThis,'fetch',async(url)=>Response.json({ok:true,result:url.endsWith('/getChatMember')?{status:'member'}:{message_id:42}}));
  const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'8'},pending=[];
  const request=(path,method='GET',payload)=>worker.fetch(new Request('https://spot.example/api'+path,{method,headers:{'X-Telegram-Init-Data':signed(),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined}),env,{waitUntil(p){pending.push(p);}});
  const ids=Array.from({length:4},()=>crypto.randomUUID());
  const responses=await Promise.all(ids.map(id=>request('/spots','POST',{...input,id})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,201,201,409]);await Promise.all(pending);
  const data=await (await request('/spots')).json();assert.equal(data.mine_active.length,3);assert.equal(data.spots.filter(s=>s.is_owner).length,3);
  assert.equal((await request('/spots','POST',{...input,id:data.mine_active[0].id})).status,200);
  assert.equal((await request(`/spots/${data.mine_active[0].id}/qrt`,'POST')).status,200);
  assert.equal((await request('/spots','POST',{...input,id:crypto.randomUUID()})).status,201);await Promise.all(pending);
  await assert.rejects(DB.prepare(`INSERT INTO spots(id,user_id,callsign,band,frequency_hz,mode,locator,created_at) VALUES('fourth',123,'IU1ABC','40',7100000,'CW','JN35UC',1)`).run(),/max_active_spots/);
});
test('QSL stores server distance, UTC and report, blocks own/duplicate/ended logs and updates rich message',async t=>{
  const DB=database();t.after(()=>DB.close());const calls=[],pending=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({method:url.split('/').pop(),body:JSON.parse(options.body)});return Response.json({ok:true,result:url.endsWith('/getChatMember')?{status:'member'}:{message_id:42}});});
  const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'8'};
  const request=(path,method='GET',payload,user=123)=>worker.fetch(new Request('https://spot.example/api'+path,{method,headers:{'X-Telegram-Init-Data':signed(user),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined}),env,{waitUntil(p){pending.push(p);}});
  assert.equal((await request('/spots','POST',{...input,mode:'CW',notes:'QRP <5W>'})).status,201);await Promise.all(pending);
  const time=Math.floor(Date.now()/1000),qsl={callsign:'iu1xyz',locator:'JN45UC',report:'599',occurred_at:time,distance_km:999999};
  assert.equal((await request(`/spots/${input.id}/logs`,'POST',qsl)).status,403);
  assert.equal((await request(`/spots/${input.id}/logs`,'POST',{...qsl,report:'59'},456)).status,400);
  assert.equal((await request(`/spots/${input.id}/logs`,'POST',{...qsl,occurred_at:time+3600},456)).status,400);
  assert.equal((await request(`/spots/${input.id}/logs`,'POST',qsl,456)).status,201);await Promise.all(pending);
  assert.equal((await request(`/spots/${input.id}/logs`,'POST',qsl,456)).status,409);
  const data=await (await request(`/spots/${input.id}/logs`,'GET',undefined,456)).json();
  assert.equal(data.total,1);assert.equal(data.can_log,false);assert.equal(data.logs[0].callsign,'IU1XYZ');assert.equal(data.logs[0].occurred_at,time);
  assert.equal(data.logs[0].distance_km,distanceBetween('JN45UC',input.locator));
  const edit=calls.filter(c=>c.method==='editMessageText').at(-1).body;
  assert.ok(edit.rich_message.html.includes('<th>RST</th>'));assert.ok(edit.rich_message.html.includes('IU1XYZ'));assert.ok(edit.rich_message.html.includes('QRP &lt;5W&gt;'));assert.ok(!('text' in edit));
  assert.equal((await request(`/spots/${input.id}/qrt`,'POST')).status,200);await Promise.all(pending);
  assert.equal((await request(`/spots/${input.id}/logs`,'POST',qsl,789)).status,409);
  await DB.prepare('DELETE FROM spots WHERE id=?').bind(input.id).run();assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM qsl_logs').first()).n,0);
});
test('QSL validation supports RS and geographical distance; rich logs have bounded size',()=>{
  const spot={...validateSpot(input),created_at:100,mode:'Fonia',qsl_count:101};
  const log=validateQSL({callsign:'iu1xyz',locator:'JN35TA',report:'59',occurred_at:101},spot,102);assert.equal(log.distance_km,0);
  assert.throws(()=>validateQSL({...log,report:'599'},spot,102));
  assert.ok(distanceBetween('JJ00AA','JJ01AA')>110 && distanceBetween('JJ00AA','JJ01AA')<112);
  const html=spotMessage(spot,Array.from({length:101},()=>({...log,callsign:'A1AAAAAAAAAAAAAAAAAA'})));
  assert.ok(html.includes('Ultimi 100 QSL'));assert.ok(html.length<32768);assert.equal((html.match(/A1AAAAAAAAAAAAAAAAAA/g)||[]).length,100);
});
test('QSL dates are compact and omit seconds',()=>{
  const reference=Date.UTC(2026,8,9,12,34,56)/1000;
  assert.equal(formatUtcLogDate(reference,reference),'12:34');
  assert.equal(formatUtcLogDate(reference-86400,reference),'08/09 12:34');
  assert.equal(formatUtcLogDate(Date.UTC(2025,8,9,12,34,56)/1000,reference),'09/09/2025 12:34');
});
test('QSL during an in-flight Telegram edit keeps a pending revision',async t=>{
  const DB=database();t.after(()=>DB.close());
  const env={DB,TELEGRAM_BOT_TOKEN:token,TELEGRAM_GROUP_ID:'@IQ1TO',TELEGRAM_TOPIC_ID:'8'};
  await DB.prepare(`INSERT INTO spots(id,user_id,callsign,band,frequency_hz,mode,locator,created_at,message_id) VALUES('race-log',123,'IU1ABC','40',7100000,'CW','JN35UC',1,42)`).run();
  let count=0;
  t.mock.method(globalThis,'fetch',async()=>{
    if(count++===0)await DB.prepare(`INSERT INTO qsl_logs(spot_id,user_id,callsign,locator,report,occurred_at,recorded_at,distance_km) VALUES('race-log',456,'IU1XYZ','JN35UC','599',2,2,0)`).run();
    return Response.json({ok:true,result:true});
  });
  await syncSpot(env,'race-log');assert.equal((await DB.prepare("SELECT sync_state FROM spots WHERE id='race-log'").first()).sync_state,'pending');
  await syncSpot(env,'race-log');assert.equal((await DB.prepare("SELECT sync_state FROM spots WHERE id='race-log'").first()).sync_state,'synced');
});
