# Message Automations

Entry point: Messages > Tin nhan tu dong. The manager is loaded lazily in a
dialog; closing it preserves the conversation and composer underneath.

## Deployment

Apply `SQL message automation campaigns.sql`, then
`SQL message automation system catalog.sql`, then `SQL overdue tuition notice.sql`
and `SQL manual overdue tuition notices.sql`, after the current unified Zalo
dispatch, automatic tuition/template and class permission migrations. Both are
idempotent. Publish the HTML/CSS/JS files with the normal static web deployment.

The scheduler runs every minute through pg_cron. The existing service-role
`claim_mindup_zalo_message` also invokes it. These migrations do not create any
campaign or send test messages. No bot restart or extra local process is needed.

## Scope And Delivery

- Admins manage center-wide campaigns. Teachers default to their assigned classes.
  Other staff require `messages.automation.manage`; center-wide selection also
  requires `messages.automation.all`.
- Campaigns belong to their creator; only the creator or an admin can change them.
- Active parent/student links and active class enrollments determine eligibility.
  Only parents with verified enabled Zalo links are queued.
- Targets are recalculated at each scheduled occurrence, grouped by parent.
  Explicit parent selections remain explicit; an all-in-scope selection follows
  current membership. Recipient names and content are snapshotted for each run.
- Supported placeholders: `[Ten_hoc_sinh]`, `[Ten_phu_huynh]`, `[Ten_lop]`,
  `[Ngay_gui]`, `[Ten_trung_tam]`. Names of multiple children are joined with "va".
- Dates are interpreted in Asia/Ho_Chi_Minh regardless of the browser timezone.
  Yearly repetition preserves the local date/time. Missed occurrences are not
  replayed in a burst; expired occurrences finish without delivery.
- The shared outbox handles paced sending and delivery acknowledgements. Campaign
  messages use dispatch source `campaign`, never a separate Zalo sender.
- Pause/cancel affects pending jobs. A message already being transmitted can finish.
  Expiration and authorization are rechecked before pending messages are claimed.
- A failed recipient does not block the next one. Explicit retry reuses failed jobs
  or previously skipped recipients, within the run's validity window. Sent and
  uncertain jobs are never automatically retried.
- Campaign notices do not count as human support replies.

## Existing System Notices

The system tab reads existing settings instead of creating duplicate schedules.
Only admins can change them. Tuition uses the shared tuition notice template and
automatic tuition pause control. Other notices use the existing message_templates
rows. Session/periodic evaluations retain their status-specific weighted template
pool, available through the existing evaluation template editor.

Greeting configuration is applied inside the existing service-only enqueue
function, retaining phone/identity checks and deduplication. An empty greeting
template preserves the bot's existing variants. Disabling it skips new greetings;
it does not retract queued or delivered messages.

System history lists the most recent 100 authorized shared-outbox deliveries.
Grouped automatic tuition and QR delivery details remain in the Tuition screen.

## Overdue Tuition

The overdue notice is MANUAL ONLY. An admin previews current-month debt, selects
parents, then explicitly confirms Send. There is no send-day setting, enabled
toggle, automatic catch-up, or time-of-day restriction for this notice. The old
activation RPC cannot enable it. Existing calendar-created pending jobs are
cancelled by the manual migration; in-flight delivery cannot be retracted.

Children with current-month debt are grouped per parent; old-month-only debts are
not mislabeled as current-month debt. Sending is allowed only after the 15th.
The saved tuition debt snapshot already reflects discounts. No tuition amounts
are modified and no extra QR is generated. Global Zalo pause controls still apply;
the automatic tuition pause flag does not prevent an explicit manual request.

Each confirmed action has a durable UUID and recipient snapshot. Network retries
with that same UUID cannot create duplicate messages. New actions skip parents
whose previous notice is pending, processing or uncertain. A subsequent explicit
action may remind a still-indebted parent again after their previous message was
sent; the preview displays the previous send time and confirmation warns about it.

The existing scheduler hook ONLY maintains already requested pending jobs. It
never discovers or queues new recipients. Before dispatch it rechecks the month,
verified link, debt and current date, updating partial-payment content or cancelling
fully paid jobs. Pending requests expire after 24 hours. All outcomes remain in
the shared system delivery history.

## Verification

Run `node --test --test-concurrency=1 tests/message-automations.node.cjs tests/message-automations-ui.node.cjs`.
Database tests run in an isolated PGlite instance. Browser tests use a local mock
RPC server and never contact parents or create production campaigns.
