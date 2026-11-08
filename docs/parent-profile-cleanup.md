# Parent profile cleanup

The read-only production review on 2026-11-06 found 230 parent profiles, 22
duplicate phone groups (22 extra profiles), no student with multiple active
parent links, and four student accounts without an active parent link. Sampled
duplicate profiles also have Auth accounts. These are preliminary counts, not
confirmation that all 22 profiles are safe to remove.

Run `SQL audit duplicate parent cleanup.sql` after restoring the expired Supabase
dashboard session. It identifies groups with exactly one primary profile owning
active family links or a Zalo identity, and a same-name/same-phone unused sibling
profile. It checks login activity and foreign-key references before deletion.
The audit writes only temporary tables. Review the proposed profile list and all
dependencies before authorizing the destructive step.

`SQL remove empty duplicate parent profiles.sql` is an owner-only maintenance
transaction, not an exposed RPC. It refuses to run if any duplicate group is
ambiguous, a removal candidate has logged in, or a candidate has any application
or storage dependency. It preserves a private profile audit archive without
passwords, deletes the unused public and Auth profiles, enforces one active parent
per student and one parent per canonical phone, and invokes the existing Zalo
identity reconciler for retained profiles. Two children may share one parent.
The archive does not restore a deleted login through a normal product flow.

If dependencies are found, prepare and review a separate merge plan; do not rely
on cascading deletes or silently discard revoked links/messages/history. The
four students without links must be investigated separately; do not invent a
parent or infer one from matching names alone.

The first conservative audit was resumed after restoring the Supabase session.
It found dependencies, so the empty-profile-only script must not be used for the
full production cleanup. The comprehensive preview below replaces that plan.

Local PGlite tests cover enum roles, Vietnamese phone normalization, preservation
of siblings/Zalo identity, private archive permissions, idempotence and rollback
for message/revoked-link dependencies, prior logins and ambiguous identities.

## Reviewed merge plan

`SQL preview duplicate parent merge.sql` rolls back all temporary/function
changes. The production preview identified all 22 duplicate profiles after
normalizing a nine-digit mobile phone that had lost its leading zero. Four
duplicates have prior logins. Dependencies are six memberships, two conversations
(zero messages in those two), 133 notifications, 20 old family links, one push
subscription and three mobile-status records. All 197 active family links stay.

`SQL merge duplicate parent profiles.sql` archives affected rows privately, moves
reviewed ownership references, preserves conversation IDs and normalizes their
keys. An empty legacy thread retains its old key when the canonical key already
exists, preserving both thread IDs. A populated colliding thread still aborts
for separate review. It coalesces redundant revoked family links/memberships/device-status rows,
preserving their original records in the private archive. Push keys and passwords
are excluded from the archive. Unknown dependencies and populated conversation-key
collisions abort the entire transaction. A fingerprint approved from the preview
must be supplied through `app.parent_cleanup.approved_fingerprint`; a changed plan
is rejected. Auth logins of removed profiles are permanently deleted.

The retained account is the sole profile already owning family/Zalo data. A
same-phone alias with a different name is accepted only with shared child-link
history. Existing ambiguity or a competing Zalo identity aborts. No student's
active parent is selected merely by latest timestamp. Four students without
links have no class enrollments; they are outside this duplicate merge and no
parent is invented for them.

The import RPC is patched in place to reuse the existing canonical-phone account
while preserving its login/name/phone and existing authorization. The UI reads
the resulting active family link, and preserves credentials when reusing a
different existing email. This supports one parent with several children.

The reviewed merge was applied on **2026-11-06**, after action-time confirmation
of the concrete 22-account plan. Local tests
cover preservation, rollback guards, nine-digit phones, enum-role indexes,
fingerprint enforcement, import reuse and credential preservation.

Live verification confirmed 208 remaining parent profiles, zero duplicate phone
groups, 22 archived removals and zero remaining Auth identities for the removed
IDs. All 197 active family links remain, with zero students having multiple active
parents. Both uniqueness indexes are valid, and the import reuse patch is active.
The two legacy conversation IDs, all 133 affected notifications and the affected
push subscription were preserved. Archive schema access is denied to anon and
authenticated roles. The two reported families' Zalo links are now verified.

The first transaction rolled back on a conversation-key collision, before any
commit. The corrected transaction retained empty legacy threads with their old
keys instead of deleting them. Eight merge tests and two credential tests passed;
the laptop worker was restarted and reported a connected listener, ten-second
pacing and zero pending acknowledgements/upload/storage errors. No synthetic
tuition notification was sent to a real parent for validation.

## Student-directory display correction, 2026-11-08

A fresh read-only audit confirmed zero duplicate parent-phone groups and zero
students with multiple active parent links. The two students in the reported
screenshot each had exactly one distinct active parent. The repeated names,
emails, Zalo controls and PH status lines came from overlapping directory loads
appending into the same shared map. Deterministic tests reproduced the duplicate
and stale-response behavior before the fix.

Student loads now share an in-flight request. Parent-directory loads build their
own map and publish it atomically only when their request is still current.
Repeated link rows are deduplicated by student/parent IDs, without masking
different parent identities that happen to share a name. Validation passed seven
Node tests (including existing credential behavior), one Chrome rendering test
with overlapping requests and mobile assertions, and five existing row-action
and search regression tests. No production records were deleted for this fix.
