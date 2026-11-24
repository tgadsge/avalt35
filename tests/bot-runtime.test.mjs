import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createConversation} from '../bot/flow.mjs';
import {createQueue} from '../bot/queue.mjs';
import {createTelegram,verifyBot,dispatchOne,TelegramFailure} from '../bot/transport.mjs';
import {botConfig} from '../bot/worker.mjs';
const catalog=JSON.parse(readFileSync(new URL('../app/catalog.json',import.meta.url)));
const handle=createConversation({catalog,origin:'https://aurevon-store-production.up.railway.app'});
const update=(id,text)=>({update_id:id,message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text}});
const cb=(id,data)=>({update_id:id,callback_query:{id:'callback'+id,from:{id:123},message:{chat:{id:123,type:'private'}},data}});
function temp(){const dir=mkdtempSync(path.join(tmpdir(),'aurevon-queue-'));return {dir,file:path.join(dir,'bot.sqlite'),clean(){rmSync(dir,{recursive:true,force:true})}}}

test('identity and webhook checks never request updates or clear webhook',async()=>{
 const methods=[];await verifyBot(async method=>{methods.push(method);return method==='getMe'?{is_bot:true,username:'Aurevontop27_bot'}:{url:''}});assert.deepEqual(methods,['getMe','getWebhookInfo']);
 await assert.rejects(verifyBot(async()=>({is_bot:true,username:'AurevonChatBot'})),/identity mismatch/);
 await assert.rejects(verifyBot(async method=>method==='getMe'?{is_bot:true,username:'Aurevontop27_bot'}:{url:'https://existing.example'}),/existing webhook/);
 assert.throws(()=>botConfig({}),/disabled/);
 assert.equal(botConfig({AUREVON_BOT_ENABLED:'true',AUREVON_PUBLIC_ORIGIN:'https://store.example'}).dir,'/data');
});
test('transport suppresses token and upstream errors; ambiguous outcomes are classified',async()=>{
 const token='123456:'+ 'x'.repeat(30);
 const failing=createTelegram(token,{fetchImpl:async()=>{throw new Error('sensitive '+token)}});
 await assert.rejects(failing('sendMessage',{}),e=>e.kind==='uncertain'&&!e.message.includes(token)&&!e.message.includes('sensitive'));
 const limited=createTelegram(token,{fetchImpl:async()=>({ok:false,json:async()=>({ok:false,error_code:429,parameters:{retry_after:2}})})});
 await assert.rejects(limited('sendMessage',{}),e=>e.kind==='rate-limit'&&e.retryAfter===2);
});
test('atomic outbox, durable offset and same-volume worker exclusion',()=>{
 const t=temp();let first=createQueue(t.file,handle),second=createQueue(t.file,handle);
 try{assert.equal(first.acquire(),true);assert.equal(second.acquire(),false);first.ingest(update(10,'/start'));assert.equal(first.ingest(update(10,'/start')),false);assert.equal(first.offset(),11);assert.equal(first.summary()[0].count,1);first.close();first=null;assert.equal(second.acquire(),true);assert.equal(second.offset(),11);assert.equal(second.summary()[0].count,1)}finally{first?.close();second.close();t.clean()}
});
test('only explicit rate limit is retried, with no duplicate after success',async()=>{
 const t=temp();const q=createQueue(t.file,handle);q.acquire();let calls=0;
 try{q.ingest(update(1,'/start'));const send=async()=>{calls++;if(calls===1)throw new TelegramFailure('rate-limit',2)};await dispatchOne(q,send,1000);assert.equal(await dispatchOne(q,send,2000),false);await dispatchOne(q,send,3000);assert.equal(calls,2);assert.equal(q.summary()[0].status,'sent');assert.equal(await dispatchOne(q,send,4000),false)}finally{q.close();t.clean()}
});
test('uncertain sends and crash during sending are never replayed automatically',async()=>{
 const t=temp();let q=createQueue(t.file,handle);q.acquire();
 try{q.ingest(update(1,'/start'));await dispatchOne(q,async()=>{throw new Error('network disconnected')});assert.equal(q.summary()[0].status,'uncertain');assert.equal(await dispatchOne(q,async()=>assert.fail('must not retry')),false);q.ingest(update(2,'/start'));assert.ok(q.claimAction(Date.now()));q.close();q=createQueue(t.file,handle);assert.equal(q.acquire(),true);assert.deepEqual(q.summary().map(r=>[r.status,r.count]),[['uncertain',2]]);assert.equal(q.claimAction(Date.now()),null)}finally{q.close();t.clean()}
});
test('guided selection and independent shortlist support save/remove and cancellation',()=>{
 let r=handle(update(1,'/choose'));assert.equal(r.state.stage,'choose-audience');r=handle(cb(2,'choose-audience:her'),r.state);assert.equal(r.state.stage,'choose-style');r=handle(cb(3,'choose-style:Dress'),r.state);
 const cards=r.actions.filter(a=>a.method==='sendPhoto'&&a.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.text==='Open watch');assert.equal(cards.length,3);
 for(const a of cards){const id=new URL(a.payload.reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('watch');const p=catalog.find(p=>p.id===id);assert.ok(p);assert.equal(a.payload.photo,'https://aurevon-store-production.up.railway.app/'+p.image);assert.equal(a.payload.reply_markup.inline_keyboard[1][0].url,'https://t.me/aurevon_outlet1');}
 r=handle(cb(4,'save:W-0053'),r.state);assert.deepEqual(r.state.shortlist,['W-0053']);r=handle(update(5,'/shortlist'),r.state);assert.match(r.actions[0].payload.text,/separately/);r=handle(cb(6,'remove:W-0053'),r.state);assert.deepEqual(r.state.shortlist,[]);r=handle(update(7,'/cancel'),r.state);assert.equal(r.state.stage,'menu');
});
