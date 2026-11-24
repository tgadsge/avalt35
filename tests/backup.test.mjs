import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {snapshotDatabase} from '../bot/backup.mjs';
test('snapshot preserves committed data in a live WAL database and restores independently',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'aurevon-backup-'));let db,restored;
 try{const file=path.join(dir,'source.sqlite');db=new DatabaseSync(file);db.exec("PRAGMA journal_mode=WAL;CREATE TABLE selections(id TEXT);INSERT INTO selections VALUES('W-0149')");
 const target=await snapshotDatabase(file,{kind:'store'});const manifest=JSON.parse(await readFile(target+'.json','utf8'));
 assert.equal(manifest.sha256,createHash('sha256').update(await readFile(target)).digest('hex'));
 db.exec("DELETE FROM selections");restored=new DatabaseSync(target,{readOnly:true});assert.equal(restored.prepare('SELECT id FROM selections').get().id,'W-0149');assert.equal(manifest.integrity,'ok');
 }finally{restored?.close();db?.close();await rm(dir,{recursive:true,force:true})}
});
test('missing source is rejected without creating an empty database',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'aurevon-backup-'));
 try{await assert.rejects(snapshotDatabase(path.join(dir,'missing.sqlite')),{code:'ENOENT'})}finally{await rm(dir,{recursive:true,force:true})}
});
