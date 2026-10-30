# Word Question Import

## Architecture

The web uploads a DOCX to the private `word-question-sources` bucket and creates a job.
A separate, below-normal-priority Python process on the center laptop claims one job at a time.
It does not open Word, execute macros/OLE programs, call AI, or share Zalo's sending queue.
Formula conversion uses the pinned `mathtypejx` MTEF decoder, Office's installed OMML XSL transforms,
and `mathml-to-latex`. Microsoft Office's XSL files are read locally, not redistributed.

Images (including WMF/EMF via Pillow's Windows decoder) become bounded PNG files. Unsupported
images/equations remain explicit errors, with an original preview when available. Inline positions,
numbered questions, equation placement, tables, merged cells, and option tables are preserved.
Drawing/chart formats outside this supported set require review rather than silent removal.
Maximum source: 20 MB compressed / 200 MB unpacked; maximum 5000 questions per job.

The Node adapter calls the same parser as `question_word_import.js`. Formulas and rich content are
protected during question splitting, then restored. Plain LaTeX remains editable. Inline images use
`[[WIMG:job-id/sha256.png]]`; tables use bounded base64 JSON `[[WTABLE:...]]`, never arbitrary HTML.
`word-question-content.js` renders these safely on question-bank and exam surfaces.

## Immediate Availability And Review

Each saved worker batch also creates usable `question_bank` records with a separate pending review flag.
`word_question_import_items` retains source payloads, warnings and the linked question ID for later review.
Teachers/assistants see their own imports; admins can review all imports. Import and create permissions
are checked before publishing; updating or hiding an existing record also requires the corresponding permission.
Approval updates that same question ID, preserving exam references; rejection hides it without deleting it.
Retries and migration backfills never duplicate a linked question or resurrect one deleted from the bank.
Answers are never inferred with AI or defaulted to false. Missing answers do not block initial availability,
but must be filled before approval. Reviewing opens the latest bank content, including edits made there.

## Setup

1. Apply `SQL Word question imports.sql`, then `SQL Word questions immediate bank.sql` to the project.
2. Deploy `supabase/functions/word-import-gateway` with `verify_jwt=false`. It authenticates the laptop
   using the existing project secret `ZALO_GATEWAY_TOKEN`; no service-role key is placed on the web or laptop.
3. Run `install-worker.ps1` on the center laptop (requires Python 3.10+, Git, Node.js, and Office XSL files).
4. Run `start-worker.bat`, or run `install-autostart.ps1` once to start at Windows sign-in.

The configuration is read from `services/word-import/.env` or the existing Zalo bot `.env`.
Only `ZALO_GATEWAY_URL` (the project gateway base) and `ZALO_GATEWAY_TOKEN` are used.
The worker derives the separate `/word-import-gateway` endpoint. Optional `MINDUP_NODE` selects Node.
Never commit `.env`, `.venv`, or `.state`.

## Reliability

Jobs have renewable leases and a single-process local file lock. Heartbeats run every 20 seconds.
Pause/cancel invalidates the lease, so an old worker cannot continue writing. Draft batches contain at
most 10 items. `(job_id, ordinal)` is unique; resumes never duplicate saved or already-approved items.
After parsing, a local atomic cache lets saving resume without converting again. Interrupted conversion
before that checkpoint restarts conversion from the original file. Completed local caches are removed.
The original source remains private in storage for review. Cancelled/failed local source caches may
remain in `.state` for troubleshooting and can be removed after the corresponding import is no longer needed.

## Tests

```powershell
services/word-import/.venv/Scripts/python.exe -m unittest discover -s services/word-import -p test_docx_source.py -v
node --test services/word-import/word-import.test.cjs
npx playwright test tests/word-question-imports.spec.js --workers=1
```

`database.test.sql` exercises permission guards, immediate availability, duplicate batches, pause/resume and approval
inside a transaction that rolls back all test rows, including its approved test question.
