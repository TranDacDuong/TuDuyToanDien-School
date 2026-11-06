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

The cleanup has **not** been applied to production. The Supabase browser session
expired during the reference audit. Browser-based permanent deletion additionally
requires action-time confirmation before the final destructive execution.

Local PGlite tests cover enum roles, Vietnamese phone normalization, preservation
of siblings/Zalo identity, private archive permissions, idempotence and rollback
for message/revoked-link dependencies, prior logins and ambiguous identities.
