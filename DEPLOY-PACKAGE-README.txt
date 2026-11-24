AUREVON - DEPLOYMENT PACKAGE

Source: current LOCAL outputs/AUREVON-railway. This does not certify parity with the current remote GitHub deployment.
Extract this archive before upload. Repository root must contain package.json, Dockerfile, cloud.mjs, app/ and bot/.
Railway store: railway.json / Dockerfile. Railway bot: railway.bot.json / Dockerfile.bot, separate service. Do not start a second bot worker.
Configure current hostname, Telegram token and existing service parameters through private Variables. This archive contains no production runtime data or secrets.
Attach separate persistent /data volumes and restore separately exported databases if migrating existing data. Do not overwrite a running database.
New host requires Node24.13+ under25, persistent storage and HTTPS, or a compatible Docker host. PHP-only hosting requires the separate PHP transfer package and compatibility verification.
All assets in app/ are included. External media URLs still require their provider.
Do not automatically replace current repository files without reviewing remote changes. Run checks and validate the full customer journey after deployment.
