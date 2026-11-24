import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../server.mjs';
import {verifyMiniApp,bridgeSignature,validBridge} from '../bot/miniapp-auth.mjs';
import {createDirectConcierge,customerMessage} from '../bot/direct-concierge.mjs';
import {createQueue} from '../bot/queue.mjs';
import {dispatchOne} from '../bot/transport.mjs';
const token='123456:'+ 'x'.repeat(32),origin='https://store.example';
function signed(user={id:123,first_name:'Anna',username:'anna_test'},date=Math.floor(Date.now()/1000)){
 const p=new URLSearchParams({auth_date:String(date),user:JSON.stringify(user),query_id:'example'});
 const data=[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(data).digest('hex'));return p.toString();
}
test('Telegram identity rejects forgery, expiry, future dates and duplicate fields',()=>{
 assert.equal(verifyMiniApp(signed(),token).id,123);
 assert.throws(()=>verifyMiniApp(signed().replace('Anna','Other'),token));
 assert.throws(()=>verifyMiniApp(signed(undefined,Math.floor(Date.now()/1000)-3601),token));
 assert.throws(()=>verifyMiniApp(signed(undefined,Math.floor(Date.now()/1000)+120),token));
 assert.throws(()=>verifyMiniApp(signed()+'&auth_date=1',token));
 assert.throws(()=>verifyMiniApp(signed(),token+'bad'));
 const stamp=String(Date.now()),body='{}';assert.ok(validBridge(token,stamp,body,bridgeSignature(token,stamp,body)));assert.equal(validBridge(token,stamp,'changed',bridgeSignature(token,stamp,body)),false);
});
test('bridge diagnostics expose status codes without upstream bodies or secrets',async()=>{
 const call=async method=>method==='getChatMember'?{status:'administrator',can_manage_direct_messages:true}:{id:-100,type:'channel',username:'aurevon_outlet'};
 for(const status of [401,404,503]){const c=await createDirectConcierge({token,origin,botId:999,call,fetchImpl:async()=>({ok:false,status,json:async()=>({error:token})})});await assert.rejects(c.sync({}),e=>e.code==='HTTP_'+status&&!e.message.includes(token));}
 const c=await createDirectConcierge({token,origin,botId:999,call,fetchImpl:async()=>{throw Error(token)}});await assert.rejects(c.sync({}),e=>e.code==='NETWORK'&&!e.message.includes(token));
});
test('verified selection waits for a customer DM, greets by name once, routes privately and reports delivery',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'aurevon-concierge-'));const store=createStore({dataDir:dir,publicOrigin:origin,botToken:token});
 await new Promise(r=>store.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${store.server.address().port}`;
 const post=async(route,body,headers={})=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});return {status:response.status,data:await response.json()}};
 let q;
 try{
  assert.equal((await post('/api/telegram/auth',{initData:signed()})).data.user.firstName,'Anna');
  assert.equal((await post('/api/telegram/auth',{initData:signed().replace('Anna','Forged')})).status,401);
  assert.equal((await post('/api/telegram/auth',{initData:signed()},{Origin:'https://evil.example'})).status,403);
  const input={initData:signed(),requestKey:randomUUID(),items:[{id:'W-0149',quantity:2}],wishlist:['W-0053']};
  const saved=await post('/api/concierge/selection',input);assert.equal(saved.status,201);assert.equal(saved.data.status,'pending');
  assert.equal((await post('/api/concierge/selection',input)).data.id,saved.data.id);
  assert.equal((await post('/api/concierge/status',{initData:signed({id:456,first_name:'Other'}),id:saved.data.id})).status,404);
  assert.equal((await post('/api/concierge/bridge',{operation:'pending'})).status,401);
  const concierge=await createDirectConcierge({token,origin,botId:999,call:async(method,payload)=>method==='getChatMember'?{status:'administrator',can_manage_direct_messages:true}:payload.chat_id==='@aurevon_outlet'?{id:-100,type:'channel',username:'aurevon_outlet'}:{id:-200,is_direct_messages:true,parent_chat:{id:-100}},fetchImpl:(url,options)=>fetch(url.replace(origin,base),options)});
  const file=path.join(dir,'bot.sqlite');q=createQueue(file,()=>({ignored:true}),{greetingFor:concierge.greetingFor});q.acquire();
  await concierge.sync(q);assert.equal(q.claimAction(Date.now()),null); // Never send to an unknown topic.
  const dm=id=>({update_id:id,message:{chat:{id:-200,type:'supergroup',is_direct_messages:true},direct_messages_topic:{topic_id:777,user:{id:123}},from:{id:123,first_name:'Anna'},text:'Hello'}});
  await concierge.approve(dm(1));q.ingest(dm(1));q.ingest(dm(2));assert.equal(q.summary()[0].count,1);
  const sent=[];const send=async(method,payload)=>{sent.push(payload);return true};await dispatchOne(q,send);
  assert.match(sent[0].text,/Welcome to AUREVON Concierge, Anna/);assert.equal(sent[0].chat_id,-200);assert.equal(sent[0].direct_messages_topic_id,777);
  await concierge.sync(q);await concierge.sync(q); // Repeated bridge reads must not duplicate delivery.
  await dispatchOne(q,send);assert.equal(sent.length,2);assert.match(sent[1].text,/W-0149 × 2/);assert.match(sent[1].text,/Wishlist[\s\S]*W-0053/);
  await concierge.sync(q);assert.equal((await post('/api/concierge/status',{initData:signed(),id:saved.data.id})).data.status,'sent');
  q.close();q=createQueue(file,()=>({ignored:true}),{greetingFor:concierge.greetingFor});q.acquire();q.ingest(dm(3));assert.equal(q.claimAction(Date.now()),null);
  const admin=dm(4);admin.message.from.id=456;assert.equal(customerMessage(admin),null);
 }finally{q?.close();await new Promise(r=>store.server.close(r));store.db.close();rmSync(dir,{recursive:true,force:true})}
});
