import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createConversation,commands} from '../bot/flow.mjs';
import {createConversationStore} from '../bot/state.mjs';
const catalog=JSON.parse(readFileSync(new URL('../app/catalog.json',import.meta.url)));
const handle=createConversation({catalog,origin:'https://aurevon-store-production.up.railway.app'});
const update=(id,text)=>({update_id:id,message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text}});
test('English welcome, exact watch deep link, topics and return to catalog',()=>{
 assert.equal(commands.length,9);
 const start=handle(update(1,'/start'));assert.match(start.actions[0].payload.text,/Welcome to AUREVON/);
 const selected=handle(update(2,'/start watch_W-0053'));assert.equal(selected.state.productId,'W-0053');assert.equal(selected.actions[0].method,'sendPhoto');assert.match(selected.actions[0].payload.caption,/Premier/);
 assert.ok(selected.actions[0].payload.reply_markup.inline_keyboard.flat().some(b=>b.web_app?.url.endsWith('?watch=W-0053')));
 const callback={update_id:3,callback_query:{id:'test',from:{id:123},message:{chat:{id:123,type:'private'}},data:'topic:availability:W-0053'}};
 const topic=handle(callback,selected.state);assert.equal(topic.actions[0].method,'answerCallbackQuery');assert.match(topic.actions[1].payload.text,/concierge/);assert.doesNotMatch(topic.actions[1].payload.text,/not connected/);
 assert.equal(handle(update(4,'/cancel'),selected.state).state.stage,'menu');
});
test('validation, other bots/groups and invalid product context',()=>{
 assert.throws(()=>createConversation({catalog,origin:'http://bad.example'}));
 assert.throws(()=>createConversation({catalog,origin:'https://ok.example',username:'AurevonChatBot'}));
 assert.equal(handle(update(1,'/start@another_bot')).ignored,true);
 const group=update(2,'/start');group.message.chat.type='group';assert.equal(handle(group).ignored,true);
 assert.match(handle(update(3,'/start watch_W-9999')).actions[0].payload.text,/not in the catalog/);
 assert.equal(handle({update_id:'1'}).ignored,true);
 assert.equal(handle(update(4,'/consult')).state.stage,'menu');
 assert.equal(handle(update(5,'W-0053'),{stage:'choose'}).state.productId,'W-0053');
});
test('deduplication persists through restart; session stores no free-text contact',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'aurevon-bot-'));let store=createConversationStore(path.join(dir,'bot.sqlite'),handle);
 try{assert.ok(store.process(update(1,'/start')).actions.length);assert.equal(store.process(update(1,'/start')).duplicate,true);store.close();store=createConversationStore(path.join(dir,'bot.sqlite'),handle);assert.equal(store.process(update(1,'/start')).duplicate,true);assert.equal(store.process(update(2,'/consult')).state.stage,'menu');assert.equal(store.process(update(3,'W-0053')).state.productId,'W-0053');}finally{store.close();rmSync(dir,{recursive:true,force:true})}
});
