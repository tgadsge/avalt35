import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {createConversation,commands} from './flow.mjs';
import {createQueue} from './queue.mjs';
import {createTelegram,verifyBot,dispatchOne,TelegramFailure} from './transport.mjs';
import {createDirectConcierge} from './direct-concierge.mjs';
import {startBackups} from './backup.mjs';

export function botConfig(env){
 if(env.AUREVON_BOT_ENABLED!=='true')throw new Error('Bot worker disabled. Set AUREVON_BOT_ENABLED=true only after checking for an existing worker.');
 const dir=env.AUREVON_BOT_DATA_DIR||'/data';if(!path.isAbsolute(dir))throw new Error('Use an absolute bot volume path.');
 const origin=env.AUREVON_PUBLIC_ORIGIN||'';const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw new Error('Set the exact HTTPS Mini App origin.');
 return {dir,origin,token:env.AUREVON_BOT_TOKEN};
}
export async function runWorker(env=process.env){
 const config=botConfig(env),call=createTelegram(config.token);
 const catalog=JSON.parse(readFileSync(new URL('../app/catalog.json',import.meta.url),'utf8'));
 let concierge=null;
 mkdirSync(config.dir,{recursive:true,mode:0o700});const queue=createQueue(path.join(config.dir,'aurevon-bot.sqlite'),createConversation({catalog,origin:config.origin}),{greetingFor:update=>concierge?.greetingFor(update)});
 if(!queue.acquire()){queue.close();throw new Error('Another bot worker holds this volume lease.');}
 const stopBackups=startBackups(path.join(config.dir,'aurevon-bot.sqlite'),{kind:'bot',enabled:env.AUREVON_BACKUPS_ENABLED==='true'});
 const controller=new AbortController();const stop=()=>controller.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{
  const identity=await verifyBot(call);console.log(`Bot identity verified: @${identity.username}. Manager delivery disabled.`);
  if(env.AUREVON_CONCIERGE_ENABLED==='true'){concierge=await createDirectConcierge({call,botId:identity.id,origin:config.origin,token:config.token});console.log('Channel concierge enabled. Greetings follow the first customer message.');}
  if(env.AUREVON_BOT_REGISTER_COMMANDS==='true')await call('setMyCommands',{commands,scope:{type:'all_private_chats'}});
  let backoff=1000;
  while(!controller.signal.aborted){
   queue.renew();
   try{
    // Drain already persisted actions before fetching another update batch.
    for(let i=0;i<25&&!controller.signal.aborted;i++){queue.renew();if(!await dispatchOne(queue,call))break;}
    if(concierge){try{await concierge.sync(queue)}catch(error){const code=typeof error?.code==='string'&&(/^(?:HTTP_[1-5]\d{2}|NETWORK|INVALID_RESPONSE|HTTP_ERROR)$/.test(error.code))?error.code:'LOCAL_QUEUE_OR_RESPONSE';console.warn(`Concierge transfer temporarily unavailable (${code}). Requests remain queued.`)}}
    queue.renew();
    const updates=await call('getUpdates',{offset:queue.offset(),limit:30,timeout:20,allowed_updates:['message','channel_post','callback_query']},controller.signal);
    if(!Array.isArray(updates))throw new Error('Invalid updates response.');
    queue.renew();for(const update of updates){queue.renew();if(concierge)await concierge.approve(update);queue.ingest(update)}
    backoff=1000;
   }catch(error){
    if(controller.signal.aborted)break;
    if(error instanceof TelegramFailure&&['conflict','rejected'].includes(error.kind))throw new Error('Polling stopped: token rejected or another worker is active.');
    console.warn('Telegram temporarily unavailable; retrying without logging request data.');
    await sleep(error?.kind==='rate-limit'?error.retryAfter*1000:backoff,undefined,{signal:controller.signal}).catch(()=>{});backoff=Math.min(30000,backoff*2);
   }
  }
 }finally{stopBackups();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);queue.close();}
}
export async function checkConnection(env=process.env){return verifyBot(createTelegram(env.AUREVON_BOT_TOKEN));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const checking=process.argv.includes('--check')||(process.env.AUREVON_BOT_MODE||'check')==='check';
 const action=checking?checkConnection().then(result=>console.log(JSON.stringify({username:result.username,pendingUpdates:result.pendingUpdates,workerStarted:false,updatesConsumed:false,settingsChanged:false}))):process.env.AUREVON_BOT_MODE==='poll'?runWorker():Promise.reject(new Error('Invalid bot mode.'));
 action.catch(()=>{console.error('Bot stopped. Check private token, identity, existing webhook/worker and volume configuration. No secrets were logged.');process.exitCode=1});
}
