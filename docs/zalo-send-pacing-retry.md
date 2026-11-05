# Zalo pacing and automatic tuition retries

Deploy `SQL Zalo send pacing and automatic tuition retry.sql` after the existing
automatic tuition, shared notice and quiet-hours migrations. Publish the web files
and restart the laptop bot through `services/zalo-bot/restart-bot.ps1` before starting
the updated `server.js`. The new retry button requires this SQL migration.

Every SDK `sendMessage` call shares a persistent local lane, waiting at least ten
seconds after the previous call finishes (including failures). Text and QR calls
each consume a turn. The SQL dispatcher also enforces a ten-second minimum even
when an older client requests zero spacing. All sends still use the existing bot.

After an automatic round finishes, **Gửi lại phụ huynh bị lỗi** explicitly requeues
only uncertain deliveries in the latest round of the current month. It preserves
confirmed parts, rechecks balance/contact/link state, and records the previous
error and approving admin in `retry_history`. Claim/begin revalidate again before
publication. Existing successful jobs and cancelled jobs are excluded. A verified
local receipt is reused if a prior cloud acknowledgement was lost. An ambiguous
part can be sent again only after the operator confirms the duplicate warning.

Details display the stored error directly. Future Zalo rejection strings and SDK
error codes are retained; older responses that were never stored cannot be
reconstructed. Local tests use synthetic recipients and never send live messages.
