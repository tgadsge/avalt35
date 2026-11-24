import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createConversation} from '../bot/flow.mjs';
import {createQueue} from '../bot/queue.mjs';
import {createTelegram,dispatchOne} from '../bot/transport.mjs';
const catalog=JSON.parse(readFileSync(new URL('../app/catalog.json',import.meta.url)));
const origin='https://aurevon-store-production.up.railway.app';
const handle=createConversation({catalog,origin});
const message=(id,text)=>({update_id:id,message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text}});
const callback=(id,data)=>({update_id:id,callback_query:{id:'cb'+id,from:{id:123},message:{message_id:10,text:'Existing panel',chat:{id:123,type:'private'}},data}});

test('three This or that rounds show actual photos and produce resumable recommendations',()=>{
 let result=handle(message(1,'/thisorthat'));
 for(let round=0;round<3;round++){
  const media=result.actions.find(a=>a.method==='sendMediaGroup');assert.equal(media.payload.media.length,2);
  for(const image of media.payload.media)assert.ok(catalog.some(p=>image.media===origin+'/'+p.image));
  const chosen=result.state.duel.pair[0];result=handle(callback(2+round,`duel:pick:${round}:${chosen}`),result.state);
 }
 assert.equal(result.state.lastRecommendations.length,3);assert.equal(new Set(result.state.lastRecommendations).size,3);
 const returned=handle(message(10,'/start'),result.state);assert.equal(returned.state.lastRecommendations.length,3);
 assert.ok(returned.actions[0].payload.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='resume-edit'));
 const resumed=handle(callback(11,'resume-edit'),returned.state);assert.ok(resumed.actions.some(a=>a.payload.text?.includes('last suggested')));
});
test('watch edit comparison/share contains public product context only',()=>{
 let result=handle(callback(1,'save:W-0053'));result=handle(callback(2,'save:W-0025'),result.state);
 const compare=handle(callback(3,'compare-edit'),result.state);assert.ok(compare.actions.some(a=>a.payload.text?.includes('Collection tag:')));
 const edit=handle(message(4,'/edit'),result.state);const share=edit.actions[0].payload.reply_markup.inline_keyboard.flat().find(b=>b.url);
 assert.equal(new URL(share.url).hostname,'t.me');const text=new URL(share.url).searchParams.get('text');assert.ok(text.includes('?watch=W-0053'));assert.ok(!text.includes('chat_id'));assert.ok(!text.includes('123'));
});
test('legacy question buttons and old drafts route to concierge without creating undelivered requests',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'aurevon-concierge-'));let last;const q=createQueue(path.join(dir,'bot.sqlite'),(u,s)=>(last=handle(u,s)));q.acquire();
 try{q.ingest(callback(1,'question:W-0053'));assert.equal(last.state.stage,'menu');assert.ok(last.actions.some(a=>a.payload.text?.includes('W-0053')&&a.payload.reply_markup.inline_keyboard.flat().some(b=>b.url==='https://t.me/aurevon_outlet1')));assert.equal(q.requestCount(),0);q.ingest(callback(2,'request:confirm:old'));assert.equal(q.requestCount(),0);const migrated=handle(message(3,'Is this available?'),{stage:'request-question',draft:{productIds:['W-0053']}});assert.equal(migrated.state.stage,'menu');assert.equal(migrated.request,undefined);assert.ok(migrated.actions.some(a=>a.payload.text?.includes('not been forwarded')));
 }finally{q.close();rmSync(dir,{recursive:true,force:true})}
});
test('editing an unavailable old message falls back once to a fresh message',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'aurevon-edit-'));const q=createQueue(path.join(dir,'bot.sqlite'),handle);q.acquire();
 try{q.ingest(callback(1,'help'));const methods=[];const call=createTelegram('123456:'+ 'x'.repeat(30),{fetchImpl:async(url)=>{const method=url.split('/').at(-1);methods.push(method);return {ok:method!=='editMessageText',json:async()=>method==='editMessageText'?{ok:false,error_code:400,description:'Bad Request: message to edit not found'}:{ok:true,result:true}}}});
 await dispatchOne(q,call);await dispatchOne(q,call);await dispatchOne(q,call);assert.deepEqual(methods,['answerCallbackQuery','editMessageText','sendMessage']);assert.equal(await dispatchOne(q,call),false);
 }finally{q.close();rmSync(dir,{recursive:true,force:true})}
});
