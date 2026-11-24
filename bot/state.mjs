import {DatabaseSync} from 'node:sqlite';
// Local processing only. A future transport must record delivery separately.
export function createConversationStore(file,handle){
 const db=new DatabaseSync(file);
 db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS processed_updates (id INTEGER PRIMARY KEY, processed_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS bot_sessions (chat_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);');
 return {
  process(update,now=Date.now()){
   if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)return {ignored:true,actions:[]};
   db.exec('BEGIN IMMEDIATE');
   try{
    if(db.prepare('SELECT id FROM processed_updates WHERE id=?').get(update.update_id)){db.exec('ROLLBACK');return {duplicate:true,actions:[]};}
    const id=update.callback_query?.message?.chat?.id??update.message?.chat?.id;
    const row=Number.isSafeInteger(id)?db.prepare('SELECT state,updated_at FROM bot_sessions WHERE chat_id=?').get(String(id)):null;
    const previous=row&&now-row.updated_at<86400000?JSON.parse(row.state):{};
    const result=handle(update,previous);
    if(result.ignored){db.exec('ROLLBACK');return result;}
    db.prepare('INSERT INTO processed_updates(id,processed_at) VALUES(?,?)').run(update.update_id,now);
    db.prepare('INSERT INTO bot_sessions(chat_id,state,updated_at) VALUES(?,?,?) ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(String(result.chatId),JSON.stringify(result.state),now);
    db.prepare('DELETE FROM bot_sessions WHERE updated_at<?').run(now-86400000);
    db.prepare('DELETE FROM processed_updates WHERE processed_at<?').run(now-7*86400000);
    db.exec('COMMIT');return result;
   }catch(error){db.exec('ROLLBACK');throw error;}
  },close(){db.close();}
 };
}
