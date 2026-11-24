import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
export function createQueue(file,handle,{clock=Date.now,greetingFor=()=>null}={}){
 const db=new DatabaseSync(file),owner=randomUUID();
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS bot_updates(id INTEGER PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS sessions(chat_id TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,update_id INTEGER NOT NULL,sequence INTEGER NOT NULL,method TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',next_attempt INTEGER NOT NULL DEFAULT 0,finished_at INTEGER,UNIQUE(update_id,sequence));
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bot_requests(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS direct_customers(user_id TEXT PRIMARY KEY,chat_id INTEGER NOT NULL,topic_id INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS direct_greetings(chat_id INTEGER NOT NULL,topic_id INTEGER NOT NULL,user_id INTEGER NOT NULL,PRIMARY KEY(chat_id,topic_id,user_id));
 CREATE TABLE IF NOT EXISTS direct_selections(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL UNIQUE,reported INTEGER NOT NULL DEFAULT 0);`);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}};
 const owns=()=>{const row=db.prepare('SELECT owner,expires_at FROM lease WHERE id=1').get();if(!row||row.owner!==owner||row.expires_at<=clock())throw new Error('Worker lease lost.');};
 const api={
  acquire(){return tx(()=>{const row=db.prepare('SELECT owner,expires_at FROM lease WHERE id=1').get();if(row&&row.expires_at>clock())return false;db.prepare('INSERT INTO lease(id,owner,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at').run(owner,clock()+120000);db.prepare("UPDATE outbox SET status='uncertain' WHERE status='sending'").run();return true;});},
  renew(){owns();db.prepare('UPDATE lease SET expires_at=? WHERE id=1 AND owner=?').run(clock()+120000,owner);},
  offset(){return Number(db.prepare("SELECT value FROM meta WHERE key='offset'").get()?.value||0);},
  ingest(update){
   if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)return;
   return tx(()=>{owns();if(update.update_id<api.offset()||db.prepare('SELECT id FROM bot_updates WHERE id=?').get(update.update_id))return false;
    const direct=greetingFor(update);
    if(direct){
     db.prepare('INSERT INTO direct_customers VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,topic_id=excluded.topic_id').run(String(direct.userId),direct.chatId,direct.topicId);
     const first=db.prepare('INSERT OR IGNORE INTO direct_greetings VALUES(?,?,?)').run(direct.chatId,direct.topicId,direct.userId).changes;
     if(first)db.prepare('INSERT INTO outbox(update_id,sequence,method,payload) VALUES(?,?,?,?)').run(update.update_id,0,'sendMessage',JSON.stringify({chat_id:direct.chatId,direct_messages_topic_id:direct.topicId,text:direct.text}));
     db.prepare('INSERT INTO bot_updates(id) VALUES(?)').run(update.update_id);db.prepare("INSERT INTO meta VALUES('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(update.update_id+1));return true;
    }
    const chatId=update.callback_query?.message?.chat?.id??update.message?.chat?.id;
    const row=Number.isSafeInteger(chatId)?db.prepare('SELECT state,updated_at FROM sessions WHERE chat_id=?').get(String(chatId)):null;
    const saved=row?JSON.parse(row.state):{};
    const previous=row&&clock()-row.updated_at<86400000?saved:{shortlist:saved.shortlist||[]};
    const result=handle(update,previous);
    if(!result.ignored){
     db.prepare('INSERT INTO sessions(chat_id,state,updated_at) VALUES(?,?,?) ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(String(result.chatId),JSON.stringify(result.state),clock());
     result.actions.forEach((action,i)=>db.prepare('INSERT INTO outbox(update_id,sequence,method,payload) VALUES(?,?,?,?)').run(update.update_id,i,action.method,JSON.stringify(action.payload)));
     if(result.request)db.prepare('INSERT INTO bot_requests(id,chat_id,payload,status,created_at) VALUES(?,?,?,?,?)').run(result.request.id,String(result.chatId),JSON.stringify(result.request),'pending',clock());
    }
    db.prepare('INSERT INTO bot_updates(id) VALUES(?)').run(update.update_id);
    const next=Math.max(api.offset(),update.update_id+1);db.prepare("INSERT INTO meta(key,value) VALUES('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(next));
    return true;
   });
  },
  claimAction(now){return tx(()=>{owns();const row=db.prepare("SELECT * FROM outbox WHERE status='pending' AND next_attempt<=? ORDER BY id LIMIT 1").get(now);if(!row)return null;db.prepare("UPDATE outbox SET status='sending' WHERE id=?").run(row.id);return {id:row.id,method:row.method,payload:JSON.parse(row.payload)};});},
  finishAction(id,status,now){owns();if(!['sent','failed','uncertain'].includes(status))throw new Error('Invalid delivery status.');db.prepare("UPDATE outbox SET status=?,finished_at=? WHERE id=? AND status='sending'").run(status,now,id);},
  retryAction(id,next){owns();db.prepare("UPDATE outbox SET status='pending',next_attempt=? WHERE id=? AND status='sending'").run(next,id);},
  fallbackEdit(id){owns();const row=db.prepare("SELECT payload FROM outbox WHERE id=? AND status='sending' AND method='editMessageText'").get(id);if(row){const payload=JSON.parse(row.payload);delete payload.message_id;db.prepare("UPDATE outbox SET method='sendMessage',payload=?,status='pending',next_attempt=0 WHERE id=?").run(JSON.stringify(payload),id);}},
  directDestination(userId){return db.prepare('SELECT chat_id AS chatId,topic_id AS topicId FROM direct_customers WHERE user_id=?').get(String(userId));},
  enqueueDirectSelection(requestId,destination,text){return tx(()=>{owns();const inserted=db.prepare('INSERT OR IGNORE INTO direct_selections(request_id) VALUES(?)').run(requestId);if(!inserted.changes)return false;const id=Number(inserted.lastInsertRowid);const parts=[];let part='';for(const line of text.split('\n')){if(part.length+line.length+1>3500){parts.push(part);part=''}part+=(part?'\n':'')+line}if(part)parts.push(part);parts.forEach((text,i)=>db.prepare('INSERT INTO outbox(update_id,sequence,method,payload) VALUES(?,?,?,?)').run(-id,i,'sendMessage',JSON.stringify({chat_id:destination.chatId,direct_messages_topic_id:destination.topicId,text})));return true;});},
  directReports(){return db.prepare("SELECT d.request_id AS requestId,CASE WHEN SUM(o.status='uncertain')>0 THEN 'uncertain' WHEN SUM(o.status='failed')>0 THEN 'failed' ELSE 'sent' END AS status FROM direct_selections d JOIN outbox o ON o.update_id=-d.id WHERE d.reported=0 GROUP BY d.id HAVING SUM(o.status IN ('pending','sending'))=0").all();},
  ackDirectReport(id){owns();db.prepare('UPDATE direct_selections SET reported=1 WHERE request_id=?').run(id);},
  summary(){return db.prepare('SELECT status,COUNT(*) AS count FROM outbox GROUP BY status').all();},
  requestCount(){return db.prepare('SELECT COUNT(*) AS n FROM bot_requests').get().n;},
  close(){db.prepare('DELETE FROM lease WHERE id=1 AND owner=?').run(owner);db.close();},
 };return api;
}
