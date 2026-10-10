# Single-client pilot runbook

Use a non-production test client and real, client-authorized source material. Do not copy Northstar demo records into the client tenant. Record who performed each step, the date, and the source/evidence reference. Stop if a security boundary fails.

## 0. Preflight

1. Deploy the current reviewed checkout, not only the older remote `main` commit. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; leave `NEXT_PUBLIC_DELARO_DEMO_MODE` unset.
2. Verify all 17 migrations with `supabase migration list` or the Dashboard. Run `supabase/tests/pilot_rls.sql` only with a privileged test SQL connection; it is transactional and rolls back its clearly labeled fixtures.
3. Enable Supabase Auth leaked-password protection. Allow the deployed HTTPS `/auth/callback` URL and recovery callback query; verify SMTP and rate limits. Keep service-role keys out of this app.
4. Confirm the private `client-documents` bucket is not public. Agree on which pilot file classes are permitted. Do not upload regulated/sensitive documents until scanning and retention rules are approved.

## 1. Onboard a test client

1. Create the client organization through a controlled admin SQL/Dashboard operation. Do not reuse the Delaro Systems organization as the client tenant.
2. Invite a test `client_admin` and `client_user` in Supabase Auth, then assign active `organization_memberships` only after their Auth profiles exist. Do not assign internal Delaro roles to client identities. Preserve a read-only test identity for negative checks.
3. In separate clean browser profiles, verify password sign-in, refresh persistence, password recovery, sign-out, no-membership/suspended-member denial, and that clients cannot open any internal route or query internal tables via the Data API.

## 2. Diagnose and publish

1. In Delaro Operations, add an area, a draft process, its input/process/decision/action/output steps where relevant, and systems. Record the actual trigger, expected output, and downstream effect. Publish reviewed steps before publishing the process.
2. Record a constraint and private diagnosis. Write separate client-safe root-cause and consequence summaries, then publish. Confirm the client sees only the reviewed map and summary, not private notes or scores.
3. Record a scored internal opportunity using actual evidence and no unsupported exposure number. Publish a separate client-safe summary only after review. Create a private improvement from the opportunity; set its objective, phase and next milestone, then publish a client-safe summary.
4. If a client approval is required, have an authorized Delaro administrator create and assign the decision record through a controlled procedure; an internal creation screen is not yet available. Include a published option. Verify that no implementation is represented as approved before the assigned client responds. Never treat a demo cookie response as an approval.

## 3. Implement and measure

1. Update the improvement's real phase/milestone as work proceeds. Keep draft or private details internal.
2. Define a metric linked to the process or improvement. Submit a source reference/evidence record, baseline, and expected target separately. A reviewer verifies the source before verifying the baseline.
3. Submit an actual observation with its measurement period and source. A reviewer verifies it. Confirm Impact shows the actual only after verification; rejected/pending observations must remain visibly pending.
4. For an economic claim, create a value model with named input factors, origin and source for every input, and explicit recoverable/expected percentages when supported. Publish the model only when the formula is complete. Submit realized units/value for a real period with source evidence, verify that evidence and snapshot, then explicitly approve the documented benefit stream for executive aggregation. Do not infer realized value from a target or estimate.

## 4. Files and reporting

1. Upload an approved non-sensitive test file as a client member and a Delaro-only file as an internal member. Check that client A cannot list or download another tenant's file or the Delaro-only file. Download from a fresh link and confirm the signed URL expires.
2. Compare the client Overview, Operations, Improvements, Decisions, Files, and Impact pages against the records above. Verify private opportunity scores/notes, draft records, unverified observations, and internal file metadata never appear.
3. Have the client admin and Delaro lead sign off on the visible process map, decision record, baseline/source, measured period, and report language. Record any gap in `docs/production-readiness.md` before inviting a real engagement.

## Stop conditions

- Any cross-tenant read/write, client access to an internal route/field/file, or approval without the assigned human response.
- Any unverified or demo metric presented as an actual result, or any expected value labeled verified.
- Missing recovery email, failed sign-out, a public Storage bucket, or an unexplained RLS/migration mismatch.
