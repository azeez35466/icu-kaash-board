# ICU KAASH — connected pilot build

This is an implementation package for a test deployment. Accounts, SQL, cloud services and printers have not been connected or deployed. The existing clinical UI is retained; cloud persistence, authentication and the print bridge are separate modules. Do not treat this as a validated clinical production system.

## Included
- English responsive UI, night mode, Patient List bed transfer, staffing, two-page A4 Kardex and label studio.
- Supabase email/password login with session tokens held in memory, membership-based access and no patient writes to browser localStorage in the connected runtime.
- Revision-checked cloud saves: conflicting edits stop saving and offer draft export/reload.
- Pilot board persistence in JSON, with database audit events recording actor/time/revision. This is an interim schema, not fully normalized clinical tables or field-level auditing.
- EPL raster job queue and outbound-only hospital-side Python bridge for 203 dpi ZD420/ZD421. Exact label size and printer IPs must be configured.
- Authenticated n8n operational-event endpoint and an importable acknowledgement workflow. No automatic medication decisions or messages.

## 1. Supabase test project
1. Run supabase/001_pilot.sql in a NEW test project.
2. Run supabase/003_initialize_unit.sql and copy its ICU_UNIT_ID result.
3. Create the initial Auth account, then use supabase/004_add_first_admin.sql after replacing the email and unit UUID placeholders.
4. Set ICU_UNIT_ID in Vercel.
2. Create staff accounts in Supabase Auth. No public signup UI is included.
3. Use 002_bootstrap_example.sql to create a unit, board and membership, replacing placeholders.
4. Admin/Doctor/Charge Nurse can edit the pilot board; Nurse/PCT are read-only in this first connected build. Nurse has database permission to queue label jobs, but no chart write access. Nurse bedside observation write access requires separating clinical record tables before expanding permissions.
5. Create a dedicated print_agent login with bridge_id; it can claim/finish jobs for its own bridge, not read the patient board. Keep its password on the bridge computer only.
6. Register printers in kaash_printers using real IPs and measured roll sizes, 203 dpi, port 9100. Leave enabled=false until the bridge is configured and a fictional test print is approved. No default printer addresses are deployed.

## 2. Vercel
Import this folder as the project root. Framework: Other. Output directory: public. No build command is needed. Keep the root api directory.
The supplied project URL and publishable key are built into api/config.js as public client configuration. Set ICU_UNIT_ID from 003_initialize_unit.sql in Vercel. Optional automation variables: N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET.
No secret/service_role key is required by the web app. The /api/config endpoint returns only the publishable key, URL and unit ID. The login page shows a setup message until configured. /demo.html is the separate fictional local-storage demo.
Use /index.html for the connected pilot. Supabase RLS enforces permissions independently of the interface. Sessions persist in sessionStorage for one hour from sign-in in the same tab. Patient data and unsaved drafts remain in memory. See UPDATE_AR.md for upgrade instructions. No MFA flow is implemented yet. Changes are not automatically refreshed from other users; use Reload latest board. A revision conflict blocks further writes and preserves the unsaved in-memory draft for explicit export. Exports may contain patient data: use hospital-approved handling.

## 3. Hospital print bridge
Python 3.10+ is required. Install dependencies using `python -m pip install -r print-bridge/requirements.txt`.
Set environment variables from bridge.env.example locally, including an exact IP allowlist and font path. Never commit passwords. Then run `python print-bridge/bridge.py`.
The bridge polls Supabase over outbound HTTPS and sends bytes only to allowlisted local IPs on TCP 9100. It has no incoming public listener.
EPL graphic raster dimensions use 8 dots/mm for 203 dpi. The printer database configuration determines the actual label dimensions; browser preview dimensions are not a substitute for calibration.
The bridge refuses unsupported DPI, missing label fields, excessive copies and overflowing text. Status sent means socket delivery only; physical printing is not verified. If transmission is uncertain, status unknown is recorded and no automatic retry occurs. A bridge crash can leave processing jobs; an administrator must investigate before retrying to avoid duplicates. Print-job retention/cleanup is not implemented yet.
A4 Kardex printing continues through the browser's standard printer dialog, on the paper printer. Do not send A4 Kardex to the Zebra label queue.

## 4. n8n
Import n8n/kaash-events.json. Configure Header Auth with name X-KAASH-Secret and the same server-side secret. Activate the workflow and use its production URL in Vercel.
POST /api/automation with a valid user Bearer token and {"event":"shift_summary_requested"}; only Admin/Charge Nurse are allowed. The payload contains unit ID/time, not patient names or MRNs. The workflow acknowledges the event; actual reports/reminders are not implemented or scheduled yet. No workflow notification button exists in the clinical UI in this build.

## Checks and remaining validation
Run `npm test` and `python -m unittest discover -s tests -p 'test_*.py'`.
The package includes mocked API permission tests and EPL raster tests. These do not verify live SQL deployment/RLS, browser flows, hospital networking, n8n import compatibility or physical printers. Those checks require the actual services/devices.
Before clinical use: normalize the board into admission/observation/order/administration tables, implement authenticated handover signatures and MFA, test RLS with each real role, validate concurrent edits and backup restoration, and verify data-hosting approval and print layout using fictional cases. The current patient handover name field remains a manual entry, not an authenticated electronic signature.

