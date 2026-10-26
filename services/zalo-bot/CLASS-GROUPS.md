# Zalo Class Parent Groups

- Apply `SQL Zalo class parent groups.sql`, deploy `zalo-gateway`, then restart the center bot.
- An administrator requests provisioning with `queue_zalo_class_groups()` or the **Cap nhat nhom lop** button. Opening the inbox does not create groups.
- One persistent class-to-Zalo-group mapping is stored in `zalo_class_groups`. Only active, non-revoked parents with verified Zalo IDs are added. Parents without a link remain visible in the member report.
- Existing groups are reused only through the saved mapping, or an unambiguous exact generated name owned by the bot account. No member is removed automatically.
- The worker shares the laptop sender lock, respects the existing global Zalo pause, validates the roster/actor before mutations, and stores create/add/send receipts in SQLite.
- A lost or ambiguous acknowledgement is quarantined. Do not reset an uncertain job blindly: inspect the actual Zalo group first. Group creation receipts survive bot restarts.
- A daily group-creation quota blocks only new group creation for 24 hours. Already requested classes remain queued; private messages and existing group replies are not paused by this group-specific quota.
- Staff see only their assigned class groups; administrators see all active class groups. Parents participate through the real Zalo group. Private tuition/QR messages remain private.
- Live and historical messages from mapped groups are synchronized; unrelated Zalo groups are ignored. Media bytes are not stored in Supabase. The existing on-demand media path checks class access before fetching from Zalo.
- Message bodies use the same checksum-confirmed laptop archive and 48-hour cloud retention as private chats. Recall tombstones prevent recalled messages from reappearing during a later history import.
- Group replies from the web enter a persistent queue. Group images can be sent in Zalo and viewed on demand from the web.
