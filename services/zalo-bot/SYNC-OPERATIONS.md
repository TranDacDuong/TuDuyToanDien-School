# Zalo message sync

## Deployment order

1. Apply `SQL harden Zalo message sync.sql` in the project database.
2. Deploy `supabase/functions/zalo-gateway/index.ts` with its existing gateway token authentication.
3. Restart the laptop bot. Do not delete its `session/` directory.
4. Deploy `messages.html` with the link-candidates dialog.

The migration is transactional and does not guess parent links or delete existing
history. `tests/zalo-sync-database.sql` can replace the migration's final COMMIT
for a rollback-only database behavior and teacher RLS test. It requires an
existing verified parent with an actively assigned teacher and an admin.

## Delivery and recovery

- Web messages and outbox jobs are created atomically. The returned Zalo message
  id is acknowledged against the original web message, preserving author and
  student scope. Early self echoes wait for this acknowledgement.
- Unconfirmed deliveries are never automatically sent again. Pending successful
  acknowledgements are saved to disk and replayed after restart.
- Transient upload failures retry with backoff. Invalid messages are isolated in
  `session/rejected-incoming.json`, not allowed to block subsequent messages.
  These private files must not be committed or exposed as web assets.
- Startup/reconnection requests text history. Every page has a response timeout
  and bounded retries. Progress is saved in `session/history-sync.json`.
- `GET http://127.0.0.1:3456/api/status` reports listener health, upload errors,
  rejected messages, pending acknowledgements, and history counts.
- `completed` means pagination ended and uploads drained. `partial` means the
  page cap was reached or messages were rejected. `failed` includes a reason and
  allows a fresh import via `POST /api/sync-zalo-history`.

## Boundaries

Only private text messages are supported; attachments, stickers, groups,
recalls, and edited-message replication are not a full Zalo mirror. Available
history depends on what Zalo returns and is capped at 200 pages per run.

Only enabled verified parent links enter the web inbox. Existing friend/contact
lookups are offered in the admin link dialog for explicit identity confirmation;
neither a matching nickname nor friend status automatically verifies identity.
Confirmed link changes trigger another history import within the next minute.
Historical unlinked messages are deliberately not persisted as readable content.

Teachers see correctly scoped outgoing messages for students they manage and
shared incoming replies from linked parents of those students. Outgoing messages
typed directly in Zalo without a student scope are admin-only, preventing sibling
class information from leaking to another teacher. Historic imports generate no
new-message notifications; new live parent messages notify eligible staff once.

The bot must remain running and the laptop must not sleep for live delivery.
