import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConversation} from '../bot/flow.mjs';
const catalog=JSON.parse(readFileSync(new URL('../app/catalog.json',import.meta.url)));
const handle=createConversation({catalog,origin:'https://aurevon-store-production.up.railway.app'});
const message=text=>({update_id:1,message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text}});
const direct='https://t.me/aurevon_outlet1';
test('welcome and consult provide direct concierge URL without submitting a request',()=>{
 for(const command of ['/start','/consult']){
  const r=handle(message(command));assert.ok(r.actions.some(a=>a.payload.reply_markup?.inline_keyboard.flat().some(b=>b.url===direct)));assert.ok(!r.request);
 }
 const r=handle(message('/start watch_W-0149'));assert.ok(r.actions[0].payload.reply_markup.inline_keyboard.flat().some(b=>b.url===direct));
});
