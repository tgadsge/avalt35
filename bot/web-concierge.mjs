import {randomUUID} from 'node:crypto';
import {verifyMiniApp,validBridge} from './miniapp-auth.mjs';
export function createWebConcierge({db,products,token,publicOrigin,allowLocalOrigin=false}){
 db.exec(`CREATE TABLE IF NOT EXISTS concierge_selections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_key TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,request_key));`);
 const limits=new Map();
 return async function route(req,res,url){
  const internal=url.pathname==='/api/concierge/bridge';
  if(!internal&&!['/api/telegram/auth','/api/concierge/selection','/api/concierge/status'].includes(url.pathname))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true};
  if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
  if(!token)return send(503,{error:'Telegram concierge is not configured yet.'});
  if(!internal){const expected=publicOrigin||(allowLocalOrigin?`http://${req.headers.host}`:'');if(!expected||req.headers.origin!==expected||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Open the store to continue.'})}
  if(!(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'Expected JSON.'});
  const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>16384)return send(413,{error:'Request too large.'});chunks.push(part)}
  const raw=Buffer.concat(chunks).toString('utf8');let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Invalid request.'})}
  if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Invalid request.'});
  if(internal){
   if(!validBridge(token,req.headers['x-aurevon-timestamp'],raw,req.headers['x-aurevon-signature']))return send(401,{error:'Unauthorized.'});
   if(body.operation==='pending')return send(200,{requests:db.prepare("SELECT id,user_id,payload,status FROM concierge_selections WHERE status IN ('pending','queued') ORDER BY created_at LIMIT 200").all().map(r=>({id:r.id,userId:Number(r.user_id),...JSON.parse(r.payload),status:r.status}))});
   if(body.operation==='report'&&typeof body.id==='string'&&['queued','sent','failed','uncertain'].includes(body.status)){
    // A delayed enqueue acknowledgment must not overwrite a terminal outcome.
    db.prepare("UPDATE concierge_selections SET status=? WHERE id=? AND status IN ('pending','queued')").run(body.status,body.id);return send(200,{ok:true});
   }
   return send(400,{error:'Invalid operation.'});
  }
  let user;try{user=verifyMiniApp(body.initData,token)}catch{return send(401,{error:'Reopen the app from Telegram to verify your identity.'})}
  if(url.pathname==='/api/telegram/auth')return send(200,{user});
  if(url.pathname==='/api/concierge/status'){const row=db.prepare('SELECT status FROM concierge_selections WHERE id=? AND user_id=?').get(String(body.id||''),String(user.id));return row?send(200,{status:row.status}):send(404,{error:'Not found.'})}
  if(!/^[a-f0-9-]{36}$/i.test(body.requestKey||''))return send(400,{error:'Invalid request key.'});
  const normalize=(list,cart)=>{if(!Array.isArray(list)||list.length>30)throw Error();const seen=new Set();return list.map(item=>{const id=cart?item?.id:item;const p=products.get(id);const quantity=cart?item.quantity:1;if(!p||seen.has(id)||!Number.isInteger(quantity)||quantity<1||quantity>10)throw Error();seen.add(id);return {id:p.id,brand:p.brand,name:p.name,quantity}})};
  let items,wishlist;try{items=normalize(body.items,true);wishlist=normalize(body.wishlist,false)}catch{return send(400,{error:'Invalid watch selection. Choose up to 30 watches per list.'})}
  if(!items.length&&!wishlist.length)return send(400,{error:'Add a watch to Cart or Wishlist first.'});
  const payload=JSON.stringify({user,items,wishlist});
  const existing=db.prepare('SELECT id,status,payload FROM concierge_selections WHERE user_id=? AND request_key=?').get(String(user.id),body.requestKey);
  if(existing)return existing.payload===payload?send(200,{id:existing.id,status:existing.status}):send(409,{error:'Selection changed. Please try again.'});
  const now=Date.now();for(const [id,v] of limits)if(now-v.start>600000)limits.delete(id);const limit=limits.get(user.id)||{start:now,count:0};if(limit.count>=10)return send(429,{error:'Please wait before sending another selection.'});limit.count++;limits.set(user.id,limit);
  const pending=db.prepare("SELECT COUNT(*) AS n FROM concierge_selections WHERE status IN ('pending','queued')").get().n;if(pending>=200)return send(503,{error:'The concierge queue is busy. Please message us directly.'});
  const id='AV-C-'+randomUUID();db.prepare('INSERT INTO concierge_selections VALUES(?,?,?,?,?,?)').run(id,String(user.id),body.requestKey,payload,'pending',now);
  return send(201,{id,status:'pending'});
 };
}
