import {bridgeSignature} from './miniapp-auth.mjs';
export const greeting=name=>`Welcome to AUREVON Concierge${name?', '+name:''}.\n\nTell us which watch caught your eye — send its name, selection ID or a screenshot.\n\nWe’ll help you confirm availability, pricing and delivery, and guide you through the next steps.`;
export function customerMessage(update){const m=update?.message||update?.channel_post;const u=m?.from,topic=m?.direct_messages_topic;
 if(!Number.isSafeInteger(update?.update_id)||!m?.chat?.is_direct_messages||!Number.isSafeInteger(m.chat.id)||!Number.isSafeInteger(topic?.topic_id)||!Number.isSafeInteger(u?.id)||u.id<=0||u.is_bot||m.sender_chat||topic.user?.id!==u.id||!(m.text||m.photo||m.video||m.document||m.voice||m.sticker||m.audio||m.video_note||m.animation||m.contact||m.location))return null;
 return {chatId:m.chat.id,topicId:topic.topic_id,userId:u.id,name:typeof u.first_name==='string'?u.first_name.replace(/[\r\n\t]/g,' ').slice(0,80):''};
}
export async function createDirectConcierge({call,botId,origin,token,fetchImpl=fetch}){
 const channel=await call('getChat',{chat_id:'@aurevon_outlet'});
 if(channel.type!=='channel'||channel.username?.toLowerCase()!=='aurevon_outlet'||!Number.isSafeInteger(channel.id))throw Error('Unexpected concierge channel.');
 const rights=await call('getChatMember',{chat_id:channel.id,user_id:botId});if(rights.status!=='administrator'||rights.can_manage_direct_messages!==true)throw Error('Grant the bot permission to manage channel direct messages.');
 const chats=new Map();
 const bridge=async body=>{const raw=JSON.stringify(body),stamp=String(Date.now());let res;try{res=await fetchImpl(origin+'/api/concierge/bridge',{method:'POST',headers:{'Content-Type':'application/json','X-Aurevon-Timestamp':stamp,'X-Aurevon-Signature':bridgeSignature(token,stamp,raw)},body:raw,signal:AbortSignal.timeout(10000)})}catch{throw Object.assign(Error('Concierge network request failed.'),{code:'NETWORK'})}if(!res.ok)throw Object.assign(Error('Concierge bridge rejected request.'),{code:Number.isInteger(res.status)?'HTTP_'+res.status:'HTTP_ERROR'});try{return await res.json()}catch{throw Object.assign(Error('Invalid concierge response.'),{code:'INVALID_RESPONSE'})}};
 return {
  async approve(update){const m=customerMessage(update);if(!m)return;const cached=chats.get(m.chatId);if(cached&&Date.now()-cached<300000)return;const chat=await call('getChat',{chat_id:m.chatId});if(chat.is_direct_messages!==true||chat.parent_chat?.id!==channel.id)return;chats.set(m.chatId,Date.now());},
  greetingFor(update){const m=customerMessage(update);return m&&Date.now()-(chats.get(m.chatId)||0)<300000?{...m,text:greeting(m.name)}:null},
  async sync(queue){
   const {requests}=await bridge({operation:'pending'});if(!Array.isArray(requests))throw Error('Invalid concierge response.');
   for(const r of requests){queue.renew();const destination=queue.directDestination(r.userId);if(!destination)continue;
    const lines=list=>list.map(p=>`${p.brand} — ${p.name}\n${p.id}${p.quantity>1?' × '+p.quantity:''}\n${origin}/?watch=${encodeURIComponent(p.id)}`);
    const text=`AUREVON selection · ${r.id}\n\nCart\n${lines(r.items).join('\n\n')||'Empty'}\n\nWishlist\n${lines(r.wishlist).join('\n\n')||'Empty'}`;
    queue.enqueueDirectSelection(r.id,destination,text);await bridge({operation:'report',id:r.id,status:'queued'});
   }
   for(const row of queue.directReports()){queue.renew();await bridge({operation:'report',id:row.requestId,status:row.status});queue.ackDirectReport(row.requestId)}
  },
 };
}
