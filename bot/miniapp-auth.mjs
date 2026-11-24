import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyMiniApp(raw,token,{now=Date.now(),maxAge=3600}={}){
 if(typeof raw!=='string'||raw.length>8192||!token)throw new Error('Invalid Telegram authentication.');
 const p=new URLSearchParams(raw),seen=new Set();for(const [key] of p){if(seen.has(key))throw new Error('Duplicate field.');seen.add(key)}
 const hash=p.get('hash');if(!/^[a-f0-9]{64}$/i.test(hash||''))throw new Error('Invalid signature.');p.delete('hash');
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const expected=createHmac('sha256',secret).update(check).digest();
 if(!timingSafeEqual(expected,Buffer.from(hash,'hex')))throw new Error('Invalid signature.');
 const date=Number(p.get('auth_date')),age=Math.floor(now/1000)-date;
 if(!Number.isSafeInteger(date)||date<=0||age< -30||age>maxAge)throw new Error('Expired Telegram authentication.');
 const user=JSON.parse(p.get('user')||'null');if(!Number.isSafeInteger(user?.id)||user.id<=0||user.is_bot)throw new Error('Invalid user.');
 return {id:user.id,firstName:typeof user.first_name==='string'?user.first_name.slice(0,80):'',lastName:typeof user.last_name==='string'?user.last_name.slice(0,80):'',username:/^[a-z0-9_]{5,32}$/i.test(user.username||'')?user.username:''};
}
export function bridgeSignature(token,timestamp,body){return createHmac('sha256',createHmac('sha256',token).update('aurevon-concierge-v1').digest()).update(`${timestamp}\n${body}`).digest('hex')}
export function validBridge(token,timestamp,body,signature,now=Date.now()){
 if(!token||!/^\d{13}$/.test(timestamp||'')||Math.abs(now-Number(timestamp))>60000||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 return timingSafeEqual(Buffer.from(bridgeSignature(token,timestamp,body),'hex'),Buffer.from(signature,'hex'));
}
