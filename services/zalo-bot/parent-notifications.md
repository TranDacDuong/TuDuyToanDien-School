# Parent Notifications

## Deployment

Apply these migrations in order, after the existing unified Zalo dispatcher:

1. `SQL parent notification policy.sql`
2. `SQL automatic evaluation Zalo bridge.sql`
3. `SQL parent automatic tuition reminders.sql`
4. `SQL fortnight parent evaluation fallback.sql`

Deploy `supabase/functions/zalo-gateway/index.ts`, install bot dependencies with
`npm ci` in this directory, and restart the bot. Preserve its session directory.
The bot must remain connected for delivery and automatic tuition scheduling.
Score images use Playwright Chromium (Microsoft Edge on Windows).

## Behavior

- Official learning notifications target active linked parents, never students.
- Tuition reminders use the current Vietnam calendar month on Gregorian days
  5, 10 and 15. Lunar days 1 and 2 defer a slot to the next allowed day.
- Only saved, locked tuition balances are eligible. Finalize current-month
  tuition before automatic reminders; the worker does not recompute attendance.
- Unpaid and partially paid balances use one reminder. Children sharing a
  parent are grouped, with a separate exact-amount QR for each child.
- Each QR uses the student's phone suffix, never a parent-phone substitute.
- Balance, recipient and pause checks run again before each outgoing part.
  Changed balances cancel the stale notice rather than sending an old QR.
- Receipt confirmations share the dispatcher with direct messages and reminders.
- Session evaluations publish after 30 minutes; the cron scan runs every
  10 minutes. Publication and acknowledged Zalo delivery are separate states.
- Status buttons save a draft without generating or opening a message. The
  dispatch job composes it from active evaluation templates; manual previews
  and edits remain available.
- Half-month evaluations cover days 1-15 and 16 through the month's last day.
  They reuse the knowledge-good and focused status templates with the lead-in
  "Trong 2 tuan vua qua". They do not add attendance or session status records.
  Only attended students without a delivered evaluation qualify; unresolved
  individual evaluations suppress automatic positive summaries.
  Scans start after the half-month closes, between 07:00 and 22:00 Vietnam time.
  The installation cutoff prevents historical backlog dispatch.
- Deliberately saved absences notify parents; attendance backfills do not.
- Score tables/distributions are PNGs with other students anonymized.
- Historical messages remain intact. Obsolete template rows remain disabled
  so legacy clients cannot reactivate their fallback messages.
- Ambiguous external sends are quarantined, not blindly retried.

## Verification

From the repository root:

```powershell
npm --prefix services/zalo-bot run test:tuition-scheduler
node --test services/zalo-bot/parent-notification-policy.database.test.cjs
node --test services/zalo-bot/score-message-media.test.js tests/frontend-parent-score.node.cjs tests/evaluation-delivery.node.cjs tests/explicit-absence.node.cjs
npx playwright test tests/parent-only-notifications.spec.js
```

The database tests use local PostgreSQL/WASM. They do not send parent messages.
