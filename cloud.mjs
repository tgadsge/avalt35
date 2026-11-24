import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore} from './server.mjs';
import {startBackups} from './bot/backup.mjs';

export function runtimeConfig(env=process.env){
  const port=Number(env.PORT||8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.');
  const dataDir=env.AUREVON_DATA_DIR||'/data';
  if(!path.isAbsolute(dataDir))throw new Error('AUREVON_DATA_DIR must be an absolute persistent-volume path.');
  const publicOrigin=env.AUREVON_PUBLIC_ORIGIN||'';
  if(publicOrigin){let u;try{u=new URL(publicOrigin)}catch{throw new Error('Set a valid HTTPS public origin.');}
    if(u.protocol!=='https:'||u.origin!==publicOrigin)throw new Error('Use the exact HTTPS origin, without credentials, path, query or trailing slash.');
  }
  return {port,dataDir,publicOrigin,allowLocalOrigin:false,requireConfiguredOrigin:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const config=runtimeConfig();const app=createStore(config);const stopBackups=startBackups(path.join(config.dataDir,'inquiries.sqlite'),{kind:'store'});
    app.server.once('error',()=>{try{app.db.close()}catch{}console.error('AUREVON could not start. Check the port and persistent-volume permissions.');process.exitCode=1;});
    app.server.listen(config.port,'0.0.0.0',()=>console.log('AUREVON web service is listening. Manager delivery is not configured.'));
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;stopBackups();const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();app.server.close(()=>{app.db.close();clearTimeout(deadline);process.exit(0)});app.server.closeIdleConnections();};
    process.on('SIGTERM',stop);process.on('SIGINT',stop);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
