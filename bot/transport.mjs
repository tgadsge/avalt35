export class TelegramFailure extends Error {
 constructor(kind,retryAfter=0){super(`Telegram request: ${kind}`);this.kind=kind;this.retryAfter=retryAfter;}
}
export function createTelegram(token,{fetchImpl=fetch}={}){
 if(typeof token!=='string'||!/^\d+:[A-Za-z0-9_-]{25,}$/.test(token))throw new Error('Set the selected bot token in private Railway Variables.');
 const methods=new Set(['getMe','getWebhookInfo','getUpdates','getChat','getChatMember','sendMessage','sendPhoto','sendMediaGroup','editMessageText','answerCallbackQuery','setMyCommands']);
 return async function call(method,payload={},signal){
  if(!methods.has(method))throw new TelegramFailure('unsupported-method');
  let response,body;
  try{response=await fetchImpl(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(35000)]):AbortSignal.timeout(35000)});body=await response.json();}
  catch{throw new TelegramFailure('uncertain');}
  if(body?.ok===true&&response.ok)return body.result;
  if(method==='editMessageText'&&body?.ok===false&&body.error_code===400){
   const detail=typeof body.description==='string'?body.description.toLowerCase():'';
   if(detail.includes('message is not modified'))return true;
   if(detail.includes('message to edit not found')||detail.includes("message can't be edited")||detail.includes('message can not be edited'))throw new TelegramFailure('edit-unavailable');
  }
  if(body?.ok===false&&body.error_code===429)throw new TelegramFailure('rate-limit',Math.min(3600,Math.max(1,Number(body.parameters?.retry_after)||30)));
  if(body?.ok===false&&body.error_code===409)throw new TelegramFailure('conflict');
  if(body?.ok===false&&[400,401,403,404].includes(body.error_code))throw new TelegramFailure('rejected');
  throw new TelegramFailure('uncertain');
 };
}
export async function verifyBot(call){
 const me=await call('getMe');
 if(me?.is_bot!==true||me.username!=='Aurevontop27_bot')throw new Error('Bot identity mismatch. No updates were requested.');
 const webhook=await call('getWebhookInfo');
 if(webhook?.url)throw new Error('An existing webhook is configured. No polling started; do not delete it automatically.');
 return {id:me.id,username:me.username,pendingUpdates:Number(webhook.pending_update_count)||0};
}

export async function dispatchOne(store,call,now=Date.now()){
 const item=store.claimAction(now);if(!item)return false;
 try{await call(item.method,item.payload);store.finishAction(item.id,'sent',now);}
 catch(error){
  // Only an explicit Telegram rejection due to rate limiting is safe to retry.
  if(error instanceof TelegramFailure&&error.kind==='edit-unavailable'&&item.method==='editMessageText')store.fallbackEdit(item.id);
  else if(error instanceof TelegramFailure&&error.kind==='rate-limit')store.retryAction(item.id,now+error.retryAfter*1000);
  else if(error instanceof TelegramFailure&&error.kind==='rejected')store.finishAction(item.id,'failed',now);
  else {store.finishAction(item.id,'uncertain',now);if(error?.kind==='conflict')throw error;}
 }
 return true;
}
