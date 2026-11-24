# AUREVON Telegram worker

Prepared for **@Aurevon_outlet_bot**. Existing Mini App menu button is preserved. Earlier AurevonChatBot configuration/token must not be reused.

Implemented: /start, /catalog, /choose, /consult, /shortlist, /edit, /thisorthat, /help, /cancel. Help me choose asks audience and style in two steps, then returns up to three real selections. This or that shows two real catalog photos for each of three rounds with a skip option, then matches style/brand tags. My watch edit stores five selections, compares up to three using names/brands/collection tags, shares public product links and resumes the last recommendation. It is independent from app Wishlist. Ask a concierge captures a private question draft, shows review, then creates a pending request only after confirmation. No contact collection, manager forwarding, order status or notifications are enabled.

## Separate Railway service (do not change the working web service)

1. Add the new bot/ directory, tests and Dockerfile.bot/railway.bot.json to the SAME private repository. Do not upload app/images again; the owner is uploading photos separately.
2. Add a NEW Railway service from that repository, name it AUREVON-BOT. Keep AUREVON-STORE unchanged. Set this new service's config-file path to `/railway.bot.json`; verify it uses `Dockerfile.bot` and starts `node bot/worker.mjs`. If using manual settings, set the Dockerfile path/command explicitly and remove the web `/api/health` healthcheck for this worker. Do not add a public domain or web port to the bot service.
3. Add a SEPARATE persistent Volume to AUREVON-BOT, mounted at `/data`. Never attach the web store's volume to two services. Use one replica only. Avoid overlapping bot deployments. The SQLite lease prevents concurrent workers on the SAME volume only; it cannot detect workers on another host. Telegram 409 stops polling, but is not a substitute for checking existing workers.
4. Add the Variables below to AUREVON-BOT only. Put the token directly into Railway Variables; NEVER send it in chat, GitHub, screenshots or build arguments. Obtain the token of **Aurevon_outlet_bot**, not another bot.

| Variable | Value |
|---|---|
| AUREVON_BOT_TOKEN | secret token of @Aurevon_outlet_bot |
| AUREVON_PUBLIC_ORIGIN | https://aurevon-store-production.up.railway.app |
| AUREVON_BOT_DATA_DIR | /data |
| AUREVON_BOT_MODE | check |
| AUREVON_BOT_ENABLED | false |
| AUREVON_BOT_REGISTER_COMMANDS | false |

5. Deploy in **check** mode FIRST. It calls only getMe and getWebhookInfo, verifies the exact username and stops if a webhook exists. It prints no token or webhook URL, does not consume updates or change settings. Success output includes username Aurevon_outlet_bot, workerStarted false, updatesConsumed false. The completed check process does not remain Online as a polling worker. Alternatively run `node bot/worker.mjs --check` in a private service console. Investigate an existing webhook; never automatically remove it.
6. Confirm no polling process is already serving this bot elsewhere. Only after the check, set `AUREVON_BOT_MODE=poll`, `AUREVON_BOT_ENABLED=true`. Optionally set `AUREVON_BOT_REGISTER_COMMANDS=true` to register the nine implemented commands. Deploy. The worker rechecks identity/webhook before getUpdates. It does not call deleteWebhook or change the Mini App menu button.
7. Open @Aurevon_outlet_bot: /start → Help me choose → audience → style → Ask about this watch → Availability & price → Open watch. Test /shortlist save/remove and /cancel. No real client details are needed.

## Persistence, retry and limitations

State, polling offset, atomic update deduplication and reply outbox: `/data/aurevon-bot.sqlite`, outside web files. It stores chat IDs, selection IDs, question drafts/confirmed questions and bot reply payloads. It does not collect phone contacts or keep unrelated free-text messages. Treat the volume as private; back it up separately. Shortlists persist across restarts; wizard context expires after one day. Confirmed requests stay pending in bot_requests, never marked delivered without manager integration. Edits update an existing text panel when possible; if Telegram explicitly says it cannot be edited, a fresh panel is sent once.

An update, state change and outbox insertion commit in one transaction before the next polling offset is acknowledged. A same-volume lease permits one worker. SIGTERM stops polling; interrupted sending becomes uncertain on startup.

Only explicit Telegram 429 is retried after retry_after. Rejected sends fail; a timeout, connection loss, malformed response or crash after starting a send produces **uncertain**, NOT automatically resent. This avoids automatic duplicates but can lose an answer. Exactly-once delivery is not claimed; the user can issue a new command. Outbox is for the bot's own answers to the user, not manager delivery.

No token is present locally. Actual getMe/webhook status and Telegram messaging have NOT been checked live. Tests use fake responses. Docker/Railway deployment of this revision is unverified. The website and menu button work independently.

## Photos

Audit after manual uploads, 2 November 2026: all 849 expected image files return 200 and match original hashes (846 product photos plus three editorial sizes). Previously 82 were available; all 767 missing files are fixed. See PHOTO-AUDIT.json. Source has one photo per record; no additional camera angles.
