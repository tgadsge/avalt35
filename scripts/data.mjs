import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [command,target]=process.argv.slice(2);
const source=path.join(process.env.AUREVON_DATA_DIR||path.join(root,'private'),'inquiries.sqlite');
if(!target||!['backup','restore-check'].includes(command))throw new Error('Usage: node scripts/data.mjs backup <new-backup.sqlite> OR restore-check <backup.sqlite>');
if(command==='backup'){
  if(!existsSync(source))throw new Error('No inquiry database exists yet.');
  const destination=path.resolve(target);if(existsSync(destination))throw new Error('Backup destination already exists. Choose a new file.');
  mkdirSync(path.dirname(destination),{recursive:true});
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,destination)}finally{db.close()}
  const restored=new DatabaseSync(destination,{readOnly:true});
  try{if(restored.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Backup verification failed.');console.log('Backup created and verified.')}finally{restored.close()}
}else{
  const db=new DatabaseSync(path.resolve(target),{readOnly:true});
  try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Database verification failed.');const count=db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n;console.log(`Backup verified: ${count} inquiries. Restore only with the server stopped; preserve the current database first.`)}finally{db.close()}
}
