# Laptop Zalo Worker And Message Storage

## Responsibilities

Supabase retains authentication, class/family permissions, tuition, templates,
durable dispatch requests and delivery outcomes. Pending requests necessarily
include the data/content required to execute them, not executable JavaScript or
shell commands. Existing business rules still revalidate tuition, parent links,
campaign expiration and pauses at claim/begin time. All Zalo publication happens
in the existing laptop worker. No second sender or cloud Zalo login is introduced.

`services/zalo-bot/session/zalo-local.sqlite` stores normalized incoming/outgoing
events, local send receipts, and archived message bodies. It uses SQLite WAL with
FULL synchronization. Its instance ID is pinned in Supabase: accidentally starting
another empty database cannot replace the machine holding archived history.
Node 22.18+ is required. Keep the database together with its WAL/SHM files on the
same local disk, outside Google Drive synchronization. No scheduled backup,
Google Drive integration or Sheets export is installed.

## Retention And Read Access

Apply `SQL local Zalo storage.sql`, deploy `zalo-gateway`, publish the web files,
then restart the bot with the existing safe launcher. Initially compaction is OFF.
The worker transfers old official-center message bodies and Zalo mirror bodies
in batches of 100, reads the committed SQLite rows back and verifies their MD5
checksums before acknowledging them. Checksums detect transfer/storage mistakes;
authorization relies on the gateway credential and existing family/class scope.

After verifying the local archive and the end-to-end read path, an operator can
enable compaction with:

```sql
UPDATE public.zalo_local_storage
SET compact_enabled=true,next_scan_at=now() WHERE id=1;
```

Only bodies older than 48 hours are replaced with local references, and the last
message body in each conversation remains online for sidebar previews. IDs,
timestamps, senders, media references, recall/reaction metadata, conversation
membership and delivery records remain online. This is content offloading, not
deletion of message rows or financial data. Pending/sent command ledgers are not
deleted or automatically regenerated. Disabling compaction stops future
offloading; it does not restore bodies already moved to the laptop.

The website requests old bodies through a typed, expiring Supabase read task.
The laptop responds without exposing a local database port or a public tunnel.
The requester and current family/class scope are checked both when requesting
and when collecting the result. Results expire after 90 seconds and are purged
on worker cycles. Current recall/edits override stale local responses. Recent
messages do not wait for the laptop; old history reports an explicit offline
error if the worker cannot answer. The worker is independent of the Zalo socket
for archive reads, so old text remains available while Zalo is reconnecting.

## Send Safety And Recovery

A local receipt is committed BEFORE attempting each queued text/QR publication.
A confirmed publication stores its verified Zalo message ID before cloud ACK.
Replaying a confirmed task returns the saved ID without sending again. A process
interruption, lost/ambiguous response or changed payload after an attempted send
requires verification; it never triggers an automatic resend. Definite failures
can be attempted again only when the cloud queue explicitly reclaims that task.
Existing durable cloud-ACK replay is preserved.

Idle dispatch polling backs off to 15 seconds; manual contact polling to 30
seconds. The archive worker polls every 15 seconds, transferring batches faster
when needed and backing off after errors. Empty archive scans run at most once
every ten minutes. There is no arbitrary remote command execution endpoint.

The bot status endpoint includes archive row counts and the last archive-worker
error. If the disk is unavailable/corrupt, do not replace it with an empty file or
reset its cloud identity. With backups intentionally disabled, a lost local disk
can mean permanently lost old message bodies. Supabase still retains command
outcomes, identities and recent bodies, not a recoverable full-history copy.

## Tests

```text
node --test --test-concurrency=1 tests/local-zalo-storage.node.cjs tests/local-message-history.node.cjs
```

Tests use isolated SQLite/PGlite databases, fake SDK sends and fake RPCs. No
production messages or trial tuition notices are sent during verification.
