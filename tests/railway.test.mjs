import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../server.mjs';
import {runtimeConfig} from '../cloud.mjs';

test('cloud runtime validates port, HTTPS origin and persistent path',()=>{
 assert.equal(runtimeConfig({}).port,8080);
 assert.equal(runtimeConfig({PORT:'4567',AUREVON_PUBLIC_ORIGIN:'https://shop.example'}).port,4567);
 for(const env of [{PORT:'bad'},{PORT:'0'},{PORT:'65536'},{AUREVON_DATA_DIR:'relative'},{AUREVON_PUBLIC_ORIGIN:'http://shop.example'},{AUREVON_PUBLIC_ORIGIN:'https://shop.example/'},{AUREVON_PUBLIC_ORIGIN:'https://user:pass@shop.example'}])assert.throws(()=>runtimeConfig(env));
});

test('cloud inquiries persist, reject foreign/local origins and protect private files',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'aurevon-cloud-'));
 const app=createStore({dataDir,publicOrigin:'https://shop.example',allowLocalOrigin:false,requireConfiguredOrigin:true});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const body={name:'Deployment Test',contact:'deployment@example.invalid',consent:true,requestKey:randomUUID(),items:[{id:'W-0053',quantity:1}]};
 const post=(origin,payload=body)=>fetch(base+'/api/inquiries',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 try{
  assert.equal((await fetch(base+'/api/health')).status,200);
  const catalog=await(await fetch(base+'/catalog.json')).json();assert.equal(catalog.length,846);
  assert.equal((await post(base)).status,403);assert.equal((await post('https://other.example')).status,403);
  const response=await post('https://shop.example');assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.managerDelivery,false);
  const retry=await post('https://shop.example');assert.equal(retry.status,200);assert.equal((await retry.json()).id,saved.id);
  assert.equal((await post('https://shop.example',{...body,note:'different'})).status,409);
  for(const route of ['/private/inquiries.sqlite','/.env','/cloud.mjs','/Dockerfile','/api/admin/inquiries'])assert.ok([401,404].includes((await fetch(base+route)).status));
  for(const route of ['/splash.js','/images/editorial-detail-480.webp','/'+catalog.at(-1).image])assert.equal((await fetch(base+route)).status,200);
  assert.equal((await fetch(base+'/api/config').then(r=>r.json())).managerDelivery,false);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n,1);
  await new Promise(r=>app.server.close(r));app.db.close();
  const reopened=createStore({dataDir});assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n,1);reopened.db.close();
 }finally{if(app.server.listening)await new Promise(r=>app.server.close(r));try{app.db.close()}catch{}rmSync(dataDir,{recursive:true,force:true})}
});

test('missing public origin leaves catalog healthy but blocks inquiry writes',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'aurevon-unconfigured-'));const app=createStore({dataDir,allowLocalOrigin:false,requireConfiguredOrigin:true});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 try{assert.equal((await fetch(base+'/api/health')).status,200);assert.equal((await fetch(base+'/api/inquiries',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'})).status,503);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n,0)}finally{await new Promise(r=>app.server.close(r));app.db.close();rmSync(dataDir,{recursive:true,force:true})}
});
