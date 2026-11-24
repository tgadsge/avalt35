import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {createWebConcierge} from './bot/web-concierge.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const text=(s,max)=>typeof s==='string'&&s.trim().length<=max?s.trim():null;
const secretEqual=(a,b)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export function createStore({dataDir=process.env.AUREVON_DATA_DIR||path.join(root,'private'),publicOrigin=process.env.AUREVON_PUBLIC_ORIGIN||'',adminToken=process.env.AUREVON_ADMIN_TOKEN||'',botUsername=process.env.AUREVON_BOT_USERNAME||'',previewKey=process.env.AUREVON_PREVIEW_KEY||'',botToken=process.env.AUREVON_BOT_TOKEN||'',allowLocalOrigin=true,requireConfiguredOrigin=false}={}){
  if(previewKey&&!/^[A-Za-z0-9_-]{32,128}$/.test(previewKey))throw new Error('Preview access key must be a new random URL-safe value of at least 32 characters.');
  mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'inquiries.sqlite'));
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
  const catalog=JSON.parse(readFileSync(path.join(root,'app/catalog.json'),'utf8'));
  const products=new Map(catalog.map(p=>[p.id,p]));
  const conciergeRoute=createWebConcierge({db,products,token:botToken,publicOrigin,allowLocalOrigin});
  const limits=new Map();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; media-src 'self' https://dynamicmedia.audemarspiguet.com; style-src 'self'; script-src 'self' https://telegram.org; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'self'");
    let url;
    try{url=new URL(req.url,'http://localhost')}catch{return json(res,400,{error:'Invalid URL.'})}
    const route=url.pathname;
    try{
      if(previewKey&&route!=='/api/health'){
        const provided=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('aurevon_preview='))?.slice('aurevon_preview='.length)||'';
        if(req.method==='GET'&&route==='/'&&secretEqual(url.searchParams.get('preview')||'',previewKey)){
          const secure=req.headers['x-forwarded-proto']==='https'||publicOrigin.startsWith('https://');
          res.writeHead(303,{'Location':'/','Cache-Control':'no-store','Set-Cookie':`aurevon_preview=${previewKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure?'; Secure':''}`});res.end();return;
        }
        if(!secretEqual(provided,previewKey)){
          if(route.startsWith('/api/'))return json(res,401,{error:'Open the full private preview link to continue.'});
          res.writeHead(401,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>AUREVON private preview</title><h1>AUREVON</h1><p>This preview is private. Please open the full preview link provided by the owner.</p>');return;
        }
      }
      if(await conciergeRoute(req,res,url))return;
      if(req.method==='GET'&&route==='/api/config')return json(res,200,{mode:'preview',botUsername:/^[A-Za-z0-9_]{5,32}$/.test(botUsername)?botUsername:'',managerDelivery:false,telegramAuth:!!botToken});
      if(req.method==='GET'&&route==='/api/health')return json(res,200,{ok:true});
      if(route==='/api/admin/inquiries'){
        const supplied=req.headers.authorization||'';const expected=`Bearer ${adminToken}`;
        if(!adminToken||adminToken.length<24||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return json(res,401,{error:'Unauthorized.'});
        if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
        const rows=db.prepare('SELECT id,created_at,payload FROM inquiries ORDER BY created_at DESC LIMIT 500').all();
        return json(res,200,{inquiries:rows.map(r=>({id:r.id,createdAt:r.created_at,...JSON.parse(r.payload)}))});
      }
      if(route==='/api/inquiries'){
        if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
        if(requireConfiguredOrigin&&!publicOrigin)return json(res,503,{error:'The store address is not configured yet.'});
        const origin=req.headers.origin;
        const expectedOrigin=publicOrigin||`http://${req.headers.host}`;
        const localOrigin=allowLocalOrigin&&/^(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||'')?`http://${req.headers.host}`:'';
        if(!origin||(origin!==expectedOrigin&&origin!==localOrigin)||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'This request must come from the store.'});
        if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'Expected JSON.'});
        if(Number(req.headers['content-length']||0)>16384)return json(res,413,{error:'Request too large.'});
        const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>16384)return json(res,413,{error:'Request too large.'});chunks.push(chunk)}
        let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return json(res,400,{error:'Invalid request.'})}
        if(!body||typeof body!=='object'||Array.isArray(body))return json(res,400,{error:'Invalid request.'});
        const name=text(body.name,80),contact=text(body.contact,160),note=text(body.note??'',1000),country=text(body.country??'',80),requestKey=text(body.requestKey,80);
        if(!name||!contact||note===null||country===null||!requestKey||!/^[a-f0-9-]{36}$/i.test(requestKey)||body.consent!==true)return json(res,400,{error:'Enter your name and contact details and agree to be contacted.'});
        if(!/^(?:@[A-Za-z0-9_]{5,32}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(contact))return json(res,400,{error:'Enter a valid email address or Telegram @username.'});
        if(!Array.isArray(body.items)||body.items.length<1||body.items.length>30)return json(res,400,{error:'Choose between 1 and 30 watches.'});
        const seen=new Set();const items=[];
        for(const item of body.items){
          if(!item||!products.has(item.id)||seen.has(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>10)return json(res,400,{error:'Your selection is invalid. Refresh the collection and try again.'});
          seen.add(item.id);const p=products.get(item.id);items.push({id:p.id,brand:p.brand,name:p.name,quantity:item.quantity});
        }
        const payload=JSON.stringify({name,contact,country,note,items,consent:true,status:'preview_saved',managerDelivery:false});
        const existing=db.prepare('SELECT id,payload FROM inquiries WHERE request_key=?').get(requestKey);
        if(existing){if(existing.payload!==payload)return json(res,409,{error:'This request has changed. Please try again.'});return json(res,200,{id:existing.id,status:'preview_saved',managerDelivery:false})}
        const address=req.socket.remoteAddress||'unknown';const now=Date.now();
        if(limits.size>1000)for(const [ip,v] of limits)if(now-v.start>600000)limits.delete(ip);
        const current=limits.get(address);const counter=!current||now-current.start>600000?{start:now,count:0}:current;
        if(counter.count>=20){res.setHeader('Retry-After','600');return json(res,429,{error:'Too many requests. Please try again later.'})}
        counter.count++;limits.set(address,counter);
        const id=`AV-${randomUUID().toUpperCase()}`;
        db.prepare('INSERT INTO inquiries (id,request_key,payload,created_at) VALUES (?,?,?,?)').run(id,requestKey,payload,new Date().toISOString());
        return json(res,201,{id,status:'preview_saved',managerDelivery:false});
      }
      if(route.startsWith('/api/'))return json(res,404,{error:'Not found.'});
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed.'});
      const relative=route==='/'?'index.html':route.slice(1);
      if(!/^(?:index\.html|style\.css|app\.js|splash\.js|catalog\.json|favicon\.svg|images\/(?:W-\d{4}\.(?:webp|png|jpg)|editorial-detail-(?:480|960|1440)\.webp))$/.test(relative))return json(res,404,{error:'Not found.'});
      if(relative.startsWith('images/W-')&&products.get(path.basename(relative,path.extname(relative)))?.image.split('?')[0]!==relative)return json(res,404,{error:'Not found.'});
      const file=path.join(root,'app',relative);if(!existsSync(file))return json(res,404,{error:'Not found.'});
      const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':relative.startsWith('images/')?'no-store':'no-cache'});
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch{if(!res.headersSent)json(res,500,{error:'Your inquiry could not be saved. Please try again.'});else res.end()}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return {server,db,close:()=>{server.close();db.close()}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const host=process.env.AUREVON_HOST||'127.0.0.1';const port=Number(process.env.AUREVON_PORT||process.argv[2]||4192);
  if(host!=='127.0.0.1'&&host!=='localhost')throw new Error('Private preview must bind to localhost. Public release is not configured.');
  const app=createStore();app.server.once('error',error=>{app.db.close();console.error(error.code==='EADDRINUSE'?`Port ${port} is busy. Try: node server.mjs ${port+1}`:'The preview could not start. Check the selected port and private data folder.');process.exitCode=1});app.server.listen(port,host,()=>console.log(`AUREVON private preview: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.close();process.exit(0)});
}
