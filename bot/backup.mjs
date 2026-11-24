import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,chmod,readFile,writeFile,unlink,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

// Snapshots share the persistent volume. Off-volume backups are a separate layer.
export async function snapshotDatabase(file,{directory=path.join(path.dirname(file),'backups'),kind='store'}={}){
 if(!['store','bot'].includes(kind))throw new Error('Unknown backup kind');
 await stat(file); // Never create an empty source database by mistake.
 await mkdir(directory,{recursive:true,mode:0o700});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const target=path.join(directory,`${kind}-${stamp}-${randomUUID()}.sqlite`);
 let source;
 try{
  source=new DatabaseSync(file,{readOnly:true});
  await backup(source,target);
  await chmod(target,0o600);
  const copy=new DatabaseSync(target,{readOnly:true});
  try{const rows=copy.prepare('PRAGMA integrity_check').all();if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw new Error('Backup integrity check failed');}finally{copy.close()}
  const bytes=await readFile(target);
  await writeFile(target+'.json',JSON.stringify({version:1,kind,createdAt:new Date().toISOString(),file:path.basename(target),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),integrity:'ok'},null,2),{mode:0o600,flag:'wx'});
  return target;
 }catch(error){await unlink(target).catch(()=>{});await unlink(target+'.json').catch(()=>{});throw error}
 finally{source?.close()}
}

async function prune(directory,kind){
 const pattern=new RegExp(`^${kind}-[0-9TZ-]+-[a-f0-9-]{36}\\.sqlite$`);
 const names=(await readdir(directory)).filter(name=>pattern.test(name)).sort().reverse();
 for(const name of names.slice(14)){await unlink(path.join(directory,name));await unlink(path.join(directory,name+'.json')).catch(error=>{if(error.code!=='ENOENT')throw error})}
}

export function startBackups(file,{kind,enabled=process.env.AUREVON_BACKUPS_ENABLED==='true'}={}){
 if(!enabled)return()=>{};
 let running=false,stopped=false;
 const run=async()=>{if(running||stopped)return;running=true;try{await snapshotDatabase(file,{kind});await prune(path.join(path.dirname(file),'backups'),kind);console.log(`AUREVON ${kind} backup verified.`)}catch{console.error(`AUREVON ${kind} backup failed. Check volume capacity and permissions.`)}finally{running=false}};
 void run();const timer=setInterval(run,24*60*60*1000);timer.unref();
 return()=>{stopped=true;clearInterval(timer)};
}
