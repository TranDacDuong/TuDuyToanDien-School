# Zalo pacing and automatic tuition retries

Deploy `SQL Zalo send pacing and automatic tuition retry.sql` after the existing
automatic tuition, shared notice and quiet-hours migrations. Publish the web files
and restart the laptop bot through `services/zalo-bot/restart-bot.ps1` before starting
the updated `server.js`. The new retry button requires this SQL migration.

Every SDK `sendMessage` call shares a persistent local lane, waiting at least ten
seconds after the previous call finishes (including failures). Text and QR calls
each consume a turn. The SQL dispatcher also enforces a ten-second minimum even
when an older client requests zero spacing. All sends still use the existing bot.

The automatic queue assesses every parent in creation order, including missing
contacts and pending friend requests. An unreachable parent gets a concrete error
and the scan moves on. After the entire first sweep finishes, only unsuccessful
parents enter a second sweep. After that they remain terminal, with no third
automatic attempt. Existing uncertain jobs count as an already-used first attempt.
The persistent counters survive restarts, redeployments and scheduler refreshes.
Quiet-hours deferrals resume the same attempt. Global/operator pauses still stop
the scan, while a recipient send rejection no longer pauses the whole center.

After both sweeps finish, **Gửi lại phụ huynh bị lỗi** explicitly starts a new
two-sweep cycle for unsuccessful parents in the latest current-month round.
Confirmed parts and local receipts are preserved. Claim/begin revalidate saved
balances, contacts, links and QR configuration before publication. Changed balances
are cancelled, not sent with an old amount. Successful and cancelled jobs are
excluded. `retry_history` records previous errors and the admin starting a new
cycle. Missing contacts are assessed twice too, never left queued indefinitely.
The explicit retry warning explains that an unconfirmed message may already have
arrived. Details distinguish the pending second sweep from exhausted 2/2 attempts.

Details display the stored error directly. Future Zalo rejection strings and SDK
error codes are retained; older responses that were never stored cannot be
reconstructed. Local tests use synthetic recipients and never send live messages.
