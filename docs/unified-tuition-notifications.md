# Unified tuition notifications

All new tuition notices enter `tuition_notice_jobs`. The tuition page and older
cached pages use compatibility adapters (`queue_grouped_tuition` and
`queue_zalo_tuition_deliveries`); family conversations use
`queue_tuition_notification`; scheduled reminders and overdue notices route to
the same internal enqueue function. Existing jobs/history remain intact and can
finish in their old queues. Payment receipts remain a separate notification type.

The server builds scoped, saved debt snapshots and registers the transfer memo.
Callers cannot choose a different amount, bank, QR or message text. Every new job
uses the saved `tuition_notice_template` with `TuitionNotice.build`, including
arrears. The conversation preview is read-only and no longer recalculates/saves
fees as a side effect. On the tuition page, save the common template before queueing
an edited draft. Overdue template editing updates this same saved template.

Each parent gets one grouped text, followed by a statement for each selected child.
The PNG statement includes class schedules, explicit attendance, pending/future
sessions, saved amounts, reductions, payments, itemized outstanding months and a
VietQR for that child's exact saved balance/memo. Unrecorded attendance is never
presented as confirmed presence. Calculated session fees are labelled estimates
when they differ from saved amounts. Long schedules split at 24 rows with class
headers repeated; the QR appears on the last page. Other students' attendance is
never included. Rendering uses SVG/sharp locally, with no student data sent to an
external renderer. The existing VietQR image endpoint supplies the QR asset.

`#hocphi` requests the current Vietnam month; `#hocphi 11/2026` requests a specific
month. Both the web composer and backend intercept commands before publishing raw
text. Queue permission plus family/financial scope is enforced in SQL. A native
Zalo command is accepted only on a live self-authored individual-chat event, uses
the verified UID link, and deduplicates the external message ID. Parent-authored,
group and history events do not trigger a command. Native Zalo has already sent
the literal command before the bot sees it: recall is best effort, so a recipient
may briefly see it. Native failures are reported to the account's own chat, not
to the parent. Unlinked external web conversations reject the command.

Every SDK publication shares the persistent ten-second pacing lane. HTTP and
attachment upload operations have 45-second deadlines. The two-sweep claim includes
missing contacts and rejects instead of leaving them queued forever. Each batch
finishes its first sweep before retrying failed parents, then stops after sweep
two. Manual retry starts a new cycle and preserves confirmed parts. Calendar/quiet
hours affect scheduled notices, not explicit staff commands. Expired automatic
slots/months are cancelled. Legacy messages get a turn after at most five new jobs.

Per-part manifests, leases, verified Zalo IDs and durable local receipts allow
lost cloud acknowledgements to be replayed without publishing again. Receipt
replay still performs the cloud begin/validation step. Already-confirmed images
are not downloaded or rendered again. Balance, bank, parent phone, link and UID
are checked again immediately before publication. A changed financial snapshot
cancels the old notice rather than publishing an outdated QR.

Deploy `SQL unified tuition notifications.sql`, then the updated `zalo-gateway`,
restart the local bot with `start-bot.ps1`, and publish web assets. Existing function
JWT/token settings and credentials are unchanged. The SQL migration recognizes
the metadata wrapper's `sync_mindup_zalo_message_text_v1` and defers self text echoes
until the authoritative send acknowledgement. No SQL connection or arbitrary
remote execution interface is introduced.

Validation uses local PGlite, fake SDK/RPCs, synthetic family records, PNG generation
and QR decoding. Web composer tests verify commands never enter chat and that a
lost queue response reuses its request key. Live rollout verification is read-only;
no synthetic notification is sent to a real parent.

Live rollout on 2026-11-05 applied the SQL and gateway, then restarted the local
worker. Read-only checks confirmed the queue/command functions, phone validation,
and command month parsing. The worker reported protocol version 1, a connected
listener, ten-second pacing, zero pending acknowledgements and no upload/storage
error. The final focused run passed 17 Node tests and three browser tests.
