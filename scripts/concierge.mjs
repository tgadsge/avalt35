import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const welcome = {
  text: 'Welcome to AUREVON Concierge.\nAsk about a watch or share your selection. Availability, pricing, delivery and payment are confirmed personally.\n\nManager messaging is not connected yet. Please do not send personal or payment details.',
  reply_markup: {keyboard: [[{text:'Ask about a watch'},{text:'View selection'}]],resize_keyboard:true},
};

export function loadConfiguration(configPath) {
  if (!configPath) throw new Error('Set AUREVON_CONCIERGE_CONFIG to the private configuration file path.');
  let config;
  try {config=JSON.parse(readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));}
  catch {throw new Error('The private configuration could not be read.');}
  if(typeof config.token!=='string'||!/^\d+:[A-Za-z0-9_-]{25,}$/.test(config.token))throw new Error('The private bot token is missing or invalid.');
  const username=config.expected_username??config.expectedUsername;
  if(username!=='AurevonChatBot')throw new Error('The expected bot identity must be AurevonChatBot.');
  const stateDir=config.state_dir??config.stateDir;
  if(typeof stateDir!=='string'||!path.isAbsolute(stateDir))throw new Error('A separate absolute private state directory is required.');
  const adminChatIds=config.admin_chat_ids??config.adminChatIds??[];
  if(!Array.isArray(adminChatIds)||adminChatIds.some(id=>typeof id!=='string'||!/^\d{1,20}$/.test(id)))throw new Error('Manager recipients must be explicitly confirmed private chat IDs.');
  return {token:config.token,expectedUsername:username,stateDir,adminChatIds};
}

async function readBotApi(token,method) {
  // Never expose the authenticated URL, response errors or transport exceptions.
  try {
    const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',signal:AbortSignal.timeout(20000)});
    const body=await response.json();
    if(!response.ok||body.ok!==true)throw new Error();
    return body.result;
  } catch {throw new Error(`Telegram ${method} verification failed. Credentials and authenticated URLs have been withheld.`);}
}

export async function checkIdentity(config) {
  const me=await readBotApi(config.token,'getMe');
  if(me.is_bot!==true||me.username!==config.expectedUsername)throw new Error('Bot identity mismatch. No worker was started and no settings were changed.');
  const webhook=await readBotApi(config.token,'getWebhookInfo');
  return {username:me.username,botId:me.id,webhookConfigured:Boolean(webhook.url),pendingUpdates:webhook.pending_update_count??0,managerRecipientConfigured:config.adminChatIds.length>0,workerStarted:false,updatesConsumed:false,settingsChanged:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv[2]!=='--check')throw new Error('Only read-only --check is available. Polling and manager delivery are not enabled.');
    console.log(JSON.stringify(await checkIdentity(loadConfiguration(process.env.AUREVON_CONCIERGE_CONFIG)),null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
