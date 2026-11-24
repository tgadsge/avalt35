// Conversation logic. No token or network calls.
export const commands=[
 {command:'start',description:'Welcome to AUREVON'},
 {command:'catalog',description:'Explore the watch collection'},
 {command:'consult',description:'Ask about a watch'},
 {command:'choose',description:'Help me choose a watch'},
 {command:'shortlist',description:'My saved watches in this bot'},
 {command:'edit',description:'My watch edit'},
 {command:'thisorthat',description:'Choose between watch styles'},
 {command:'help',description:'How AUREVON works'},
 {command:'cancel',description:'Return to the main menu'},
];

export function createConversation({catalog,origin,username='Aurevontop28_bot'}){
 const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw new Error('An exact HTTPS store origin is required.');
 if(username!=='Aurevontop28_bot')throw new Error('Unexpected bot identity.');
 const products=new Map(catalog.map(p=>[p.id,p]));
 const conciergeUrl='https://t.me/aurevon_outlet1';
 const menu={inline_keyboard:[[{text:'Open AUREVON',web_app:{url:origin+'/#home'}}],[{text:'Help me choose',callback_data:'choose'},{text:'This or that',callback_data:'duel:start'}],[{text:'My watch edit',callback_data:'shortlist'}],[{text:'Ask a concierge',url:conciergeUrl},{text:'Help',callback_data:'help'}]]};
 const stateFor=(id)=>({stage:'watch',productId:id});
 function selection(id){const p=products.get(id);return {text:`${p.brand} — ${p.name}\nSelection ID: ${p.id}\n\nWhat would you like to know?`,reply_markup:{inline_keyboard:[[{text:'Chat with concierge',url:conciergeUrl}],[{text:'Availability & price',callback_data:`topic:availability:${id}`}],[{text:'Delivery & payment',callback_data:`topic:delivery:${id}`}],[{text:'Ask a question',callback_data:`question:${id}`}],[{text:'View this watch',web_app:{url:origin+'/?watch='+id}}],[{text:'Save to My watch edit',callback_data:`save:${id}`}],[{text:'Back to catalog',web_app:{url:origin+'/#catalog'}}],[{text:'Choose another watch',callback_data:'consult'}]]}}}
 return function handle(update,previous={}){
  if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)return {ignored:true,state:previous,actions:[]};
  const callback=update.callback_query;
  const message=callback?.message||update.message;
  const sender=callback?.from||message?.from;
  if(!message||message.chat?.type!=='private'||!Number.isSafeInteger(message.chat.id)||!sender||sender.is_bot||sender.id!==message.chat.id)return {ignored:true,state:previous,actions:[]};
  let state={...previous};let request=null;const actions=[];
  if(callback&&typeof callback.id==='string')actions.push({method:'answerCallbackQuery',payload:{callback_query_id:callback.id}});
  let edited=false;
  const reply=(body)=>{if(body.reply_markup===menu&&previous.lastRecommendations?.length)body={...body,reply_markup:{inline_keyboard:[...menu.inline_keyboard,[{text:'Continue my last edit',callback_data:'resume-edit'}]]}};const canEdit=callback&&typeof message.text==='string'&&Number.isSafeInteger(message.message_id)&&!edited;edited=true;actions.push({method:canEdit?'editMessageText':'sendMessage',payload:{chat_id:message.chat.id,...(canEdit?{message_id:message.message_id}:{}),...body}});};
  const photoReply=(p,body)=>{const {text,...rest}=body;actions.push({method:'sendPhoto',payload:{chat_id:message.chat.id,photo:origin+'/'+p.image,caption:text,...rest}});};
  const text=typeof message.text==='string'?message.text.trim():'';
  const command=/^\/(start|catalog|consult|choose|shortlist|edit|thisorthat|help|cancel)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/.exec(text);
  if(command?.[2]&&command[2].toLowerCase()!==username.toLowerCase())return {ignored:true,state:previous,actions:[]};
  const action=callback?callback.data:command?.[1];
  const rawId=command?.[3]?.trim();
  const suppliedId=rawId?.startsWith('watch_')?rawId.slice(6):rawId;
  const shortlist=Array.isArray(previous.shortlist)?previous.shortlist.filter(id=>products.has(id)).slice(0,5):[];
  const showSuggestions=picks=>{for(const p of picks)photoReply(p,{text:`${p.brand} — ${p.name}\n${p.id} · ${p.style}`,reply_markup:{inline_keyboard:[[{text:'Open watch',web_app:{url:origin+'/?watch='+p.id}}],[{text:'Ask about this watch',url:conciergeUrl}],[{text:'Save to My watch edit',callback_data:'save:'+p.id}]]}});};
  const duelPair=round=>{
   const styles=[['Dress','Dive'],['Sport','Aviation'],['Dress','Sport']][round]||['Dress','Dive'];
   return styles.map((style,i)=>catalog.filter(p=>p.style===style)[round+i]||catalog[i]);
  };
  const showDuel=()=>{
   const pair=duelPair(state.duel.round);state.duel.pair=pair.map(p=>p.id);
   actions.push({method:'sendMediaGroup',payload:{chat_id:message.chat.id,media:pair.map(p=>({type:'photo',media:origin+'/'+p.image,caption:`${p.brand} — ${p.name}\n${p.id} · ${p.style}`}))}});
   edited=true;
   reply({text:`This or that · Round ${state.duel.round+1} of 3\nWhich would you pick?`,reply_markup:{inline_keyboard:[pair.map((p,i)=>({text:`${i+1}. ${p.name}`.slice(0,50),callback_data:`duel:pick:${state.duel.round}:${p.id}`})),[{text:'Neither / Skip',callback_data:'duel:skip:'+state.duel.round}],[{text:'Cancel',callback_data:'cancel'}]]}});
  };
  if(action==='resume-edit'){
   const picks=(previous.lastRecommendations||[]).map(id=>products.get(id)).filter(Boolean).slice(0,3);if(picks.length){reply({text:'Your last suggested watch edit.'});showSuggestions(picks);}else reply({text:'Start a selection to create your first watch edit.',reply_markup:menu});
  }else if(action==='duel:start'||action==='thisorthat'){
   state={...state,stage:'duel',duel:{round:0,picks:[]}};showDuel();
  }else if(typeof action==='string'&&/^duel:(?:skip:[0-2]|pick:[0-2]:W-\d{4})$/.test(action)){
   if(state.stage!=='duel'||!state.duel||state.duel.round>2)reply({text:'That round has ended. Start a new selection.',reply_markup:menu});
   else {const parts=action.split(':'),skip=parts[1]==='skip',round=Number(parts[2]),id=parts[3];if(round===state.duel.round&&(skip||state.duel.pair.includes(id))){
    if(!skip)state.duel.picks.push(id);state.duel.round++;
    if(state.duel.round<3)showDuel();else{
     const votes=state.duel.picks.map(id=>products.get(id));
     const ranked=catalog.map((p,index)=>({p,index,score:votes.reduce((n,v)=>n+Number(p.style===v.style)*2+Number(p.brand===v.brand),0)})).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).map(x=>x.p);
     state={stage:'menu',lastRecommendations:ranked.map(p=>p.id)};reply({text:votes.length?'Three ideas based on the style and brand tags you picked. This is a catalog match, not a personality assessment.':'You skipped the choices. Here are three starting points from the catalog.'});showSuggestions(ranked);
    }
   }else reply({text:'That selection does not belong to the current round.',reply_markup:menu});}
  }else if(action==='compare-edit'){
   const selected=shortlist.slice(0,3).map(id=>products.get(id));
   reply({text:selected.length<2?'Save at least two watches to compare.':`Your watch edit · comparison\n\n${selected.map(p=>`${p.name}\nBrand: ${p.brand}\nCollection tag: ${p.style}\nSelection: ${p.id}`).join('\n\n')}\n\nCase size, movement, price and availability require confirmation.`,reply_markup:menu});
  }else if(action==='question-edit'||(typeof action==='string'&&/^question:W-\d{4}$/.test(action))||typeof action==='string'&&action.startsWith('request:confirm:')||!action&&!callback&&['request-question','request-review'].includes(state.stage)){
   const ids=action==='question-edit'?shortlist:typeof action==='string'&&action.startsWith('question:')?[action.slice(9)]:(state.draft?.productIds||[]).filter(id=>products.has(id));
   state={stage:'menu'};
   reply({text:`Continue with AUREVON Concierge.\n\n${ids.length?ids.map(id=>{const p=products.get(id);return p?`${p.brand} — ${p.name} · ${p.id}`:''}).filter(Boolean).join('\n')+'\n\n':''}Copy the watch name or selection ID above and send your question in the concierge chat. Opening the chat does not send a message automatically. Your question has not been forwarded by this bot.`,reply_markup:{inline_keyboard:[[{text:'Open concierge chat',url:conciergeUrl}],[{text:'Back to menu',callback_data:'start'}]]}});  }else if(action==='choose'){
   state={stage:'choose-audience'};reply({text:'Who are you choosing for? These are editorial selections, not exclusive manufacturer categories.',reply_markup:{inline_keyboard:[[{text:'For him',callback_data:'choose-audience:him'},{text:'For her',callback_data:'choose-audience:her'}],[{text:'No preference',callback_data:'choose-audience:any'}],[{text:'Cancel',callback_data:'cancel'}]]}});
  }else if(typeof action==='string'&&/^choose-audience:(him|her|any)$/.test(action)){
   state={stage:'choose-style',audience:action.split(':')[1]};reply({text:'Which style feels right?',reply_markup:{inline_keyboard:[['Dress','Dive'],['Sport','Aviation']].map(row=>row.map(style=>({text:style,callback_data:'choose-style:'+style}))).concat([[{text:'Not sure',callback_data:'choose-style:any'}],[{text:'Cancel',callback_data:'cancel'}]])}});
  }else if(typeof action==='string'&&/^choose-style:(Dress|Dive|Sport|Aviation|any)$/.test(action)){
   const style=action.split(':')[1];
   const edits={him:['W-0125','W-0397','W-0053','W-0025'],her:['W-0182','W-0337','W-0409','W-0445']};
   let pool=edits[previous.audience]?edits[previous.audience].map(id=>products.get(id)).filter(Boolean):catalog;
   let picks=pool.filter(p=>style==='any'||p.style===style).slice(0,3);
   if(!picks.length){reply({text:'There is no exact match in that editorial selection. Here are watches from your chosen style instead.'});picks=catalog.filter(p=>style==='any'||p.style===style).slice(0,3);}
   state={stage:'menu'};
   if(picks.length){reply({text:'A few starting points from the catalog. These suggestions use collection tags; specifications, price and availability need confirmation.'});for(const p of picks)photoReply(p,{text:`${p.brand} — ${p.name}\n${p.id} · ${p.style}`,reply_markup:{inline_keyboard:[[{text:'Open watch',web_app:{url:origin+'/?watch='+p.id}}],[{text:'Ask about this watch',url:conciergeUrl}],[{text:'Save to bot shortlist',callback_data:'save:'+p.id}]]}});}
   else reply({text:'No matching selections are listed. Explore the catalog to choose another style.',reply_markup:menu});
  }else if(action==='shortlist'||action==='edit'){
   const shareText=shortlist.map(id=>`${products.get(id).brand} ${products.get(id).name}\n${origin}/?watch=${id}`).join('\n\n');
   reply({text:shortlist.length?'My watch edit. This is saved separately from the app Wishlist.':'My watch edit is empty. It is separate from the app Wishlist.',reply_markup:shortlist.length?{inline_keyboard:[[{text:'Compare up to 3',callback_data:'compare-edit'}],[{text:'Share public watch links',url:'https://t.me/share/url?url='+encodeURIComponent(origin+'/#catalog')+'&text='+encodeURIComponent(shareText)}],[{text:'Ask about this edit',url:conciergeUrl}],[{text:'Open store',web_app:{url:origin}}]]}:menu});
   for(const id of shortlist){const p=products.get(id);photoReply(p,{text:`${p.brand} — ${p.name}\n${p.id}`,reply_markup:{inline_keyboard:[[{text:'Open watch',web_app:{url:origin+'/?watch='+id}},{text:'Ask about it',url:conciergeUrl}],[{text:'Remove',callback_data:'remove:'+id}]]}});}
  }else if(typeof action==='string'&&/^(save|remove|watch):W-\d{4}$/.test(action)){
   const [verb,id]=action.split(':');
   if(!products.has(id))reply({text:'This selection is not in the catalog.',reply_markup:menu});
   else if(verb==='watch'){state=stateFor(id);photoReply(products.get(id),selection(id));}
   else if(verb==='save'){if(!shortlist.includes(id)&&shortlist.length<5){shortlist.push(id);reply({text:'Saved to your bot shortlist. It is separate from the app Wishlist.',reply_markup:menu});}else reply({text:shortlist.includes(id)?'This watch is already saved.':'Your shortlist holds five watches. Remove one before adding another.',reply_markup:menu});}
   else {const index=shortlist.indexOf(id);if(index>=0)shortlist.splice(index,1);reply({text:'Removed from the bot shortlist.',reply_markup:menu});}
  }else if(action==='start'&&suppliedId){
   if(products.has(suppliedId)){state=stateFor(suppliedId);photoReply(products.get(suppliedId),selection(suppliedId));}
   else {state={stage:'choose'};reply({text:'That watch link is not in the catalog. Open the catalog or send a selection ID such as W-0053.',reply_markup:menu});}
  }else if(action==='start'||action==='cancel'){
   state={stage:'menu'};reply({text:'Welcome to AUREVON.\n\nExplore the collection, find your style or revisit your saved watches.\n\nFor personal assistance, tap Ask a concierge.',reply_markup:menu});
  }else if(action==='catalog'){
   state={stage:'menu'};reply({text:'Explore the collection and open any watch to see its selection ID.',reply_markup:menu});
  }else if(action==='help'){
   reply({text:'Explore watches in the app and save them to Wishlist or Cart. To pass both lists to the concierge, tap Send selection to concierge in the app, then send your first message in the concierge chat so we can connect your selection. The app shows the delivery status.\n\nMy watch edit in this bot is a separate list. Copy its watch names or selection IDs when asking the concierge about it.\n\nAvailability, price, delivery and payment are confirmed personally. This bot does not take payments. Use /cancel to return to the menu.',reply_markup:menu});
  }else if(action==='consult'){
   state={stage:'menu'};reply({text:'Chat with the AUREVON concierge in our channel direct messages. Please include the watch name or selection ID. This opens the chat; nothing is sent automatically.',reply_markup:{inline_keyboard:[[{text:'Open concierge chat',url:conciergeUrl}],[{text:'Back',callback_data:'start'}]]}});
  }else if(action==='legacy-consult'){
   if(suppliedId&&products.has(suppliedId)){state=stateFor(suppliedId);photoReply(products.get(suppliedId),selection(suppliedId));}
   else if(previous.productId&&products.has(previous.productId)){state=stateFor(previous.productId);photoReply(products.get(previous.productId),selection(previous.productId));}
   else {state={stage:'choose'};reply({text:'Send the selection ID from the watch page, for example W-0053. You can return to the catalog below.',reply_markup:menu});}
  }else if(typeof action==='string'&&/^topic:(availability|delivery):W-\d{4}$/.test(action)){
   const [,topic,id]=action.split(':');
   if(products.has(id)){state=stateFor(id);reply({text:topic==='availability'?'The concierge confirms availability and the exact price. Send the selection ID shown above in the concierge chat, or use Send selection to concierge in the app to share Cart and Wishlist.':'Delivery options, destination and payment are confirmed personally by the concierge. Open the concierge chat and include the selection ID shown above. No online payment is taken here.',reply_markup:selection(id).reply_markup});}
   else reply({text:'This selection is no longer available in the catalog.',reply_markup:menu});
  }else if(!callback&&/^W-\d{4}$/i.test(text)&&products.has(text.toUpperCase())){
   state=stateFor(text.toUpperCase());photoReply(products.get(state.productId),selection(state.productId));
  }else{
   reply({text:state.stage==='choose'?'I could not find that selection ID. Use the ID shown on the watch page, for example W-0053.':'Use the buttons below to explore watches or choose a selection for your inquiry. Tap Ask a concierge to open the store direct messages.',reply_markup:menu});
  }
  state.shortlist=shortlist;
  if(!state.lastRecommendations&&Array.isArray(previous.lastRecommendations))state.lastRecommendations=previous.lastRecommendations.filter(id=>products.has(id)).slice(0,3);
  return {ignored:false,chatId:message.chat.id,state,actions,...(request?{request}:{})};
 };
}
