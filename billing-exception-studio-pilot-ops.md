# Billing Exception Studio — public pilot deployment record
Date: 2026-11-04 (UTC). Owner-approved scope: publicly publish a no-cost, synthetic-data-only preview and a pilot-interest page, but do not charge, accept confidential client uploads, or contact prospects.

## Live environment
- URL: https://billing-exception-studio-pilot.onrender.com/
- Render workspace: tea-dau3c3dg1s2s73ba0dc0
- Render static service: srv-dblp6715efls73acjtm0
- Render deploy: dep-dblp6715efls73acju50
- Deployment status: `live` (Render API, 2026-11-04 20:18:52 UTC)
- Source: GitHub repository ericaihaddadene-sketch/magpiebrief, isolated branch `billing-exception-studio-pilot-20261104`
- Published directory: `billing-exception-studio-pilot/`
- Commit deployed: `20bf35f09b992e61c62010dee5055b2b88f2b1ac`
- Auto deploy: `no`; production branches and existing apps were not modified.
- Website is a static public preview, not a production customer portal or financial-data service.

## Authorization boundaries
- 0 payments, 0 payment links, 0 invoices, 0 API keys, 0 customer records uploaded.
- No website form, file chooser, backend endpoints, external scripts, pixels, or telemetry.
- Pilot interest CTA is explicitly a `mailto:` link to the already operated `hello@siteinthree.com` inbox; a visitor must choose to send the email. Do not follow up automatically.
- The page says the contemplated $299 price is exploratory and is not an order or guaranteed offer.
- No sensitive client uploads. Visitor instructions explicitly prohibit sending records.
- Name is descriptive provisional only. A preliminary exact-phrase internet search found no obvious exact-match company/product, but this is NOT USPTO trademark clearance; page includes `noindex,nofollow`.

## Technical validation
- Original local reconciliation core: 19 Node tests passing on 2026-11-04.
- The public site uses derived, precomputed synthetic findings instead of allowing live file processing.
- Synthetic numbers: $750 candidates (one $150 partial and one $600 missing invoice), $225 draft pending, $80 overbilling review. NOT commercial results.
- GitHub source read-back of index.html, styles.css, demo.js: 12/12 launch invariants passed.
- Render API reports deploy `live`, and public DNS returns A records 216.24.57.16 and 216.24.57.18.
- HTTP smoke test: independent read-only GET requests on public `/`, `/styles.css`, `/demo.js` returned 200 and matching expected asset byte counts. Live HTML confirms no file-upload control and the pilot mailto link.
- Limitations: full interactive browser end-to-end testing (especially filtering, CSV download, mobile layout, and visitor mail client behavior) remains unverified. Render log lookup failed with a transient upstream 503; HTTP smoke testing succeeded via a separate runtime.

## Response handling
- Incoming pilot-interest emails can be identified by subject `Billing Exception Studio Pilot Interest` in the existing operator business inbox.
- Record only voluntary, qualified expressions of interest. Distinguish real buyer, genuine purchase intent, and a request for more information. Do not report email link clicks as leads.
- Do not email anyone until separately approved.
- Never request contracts, invoice PDFs, bank records, customer names, work logs, or other confidential data without a separately approved secure onboarding workflow.

## Distribution and validation gate
- No outreach or marketing campaign was sent. Publishing does not constitute market validation.
- A credible expansion signal is >=3 independent, qualified buyers expressing clear willingness to discuss the specifically priced $299 pilot, including >=1 paid commitment through a separately approved payment process. This is a decision criterion, not a result.
- If the next 14 days produce zero qualified interest following legitimate distribution, revisit audience and acquisition rather than expanding features.
- Before taking payments: explicit owner approval, legal/trademark review, privacy/security plan for client data, delivery capacity, customer terms/refunds and approved checkout.

## Cost guard
- Render static site creation has no fixed service price. It consumes the owner's account-wide included bandwidth/build allowances and may result in overage fees if those allowances are exceeded and billing is enabled. We have not changed any billing settings or authorized metered purchases.
- Auto-deploy disabled. Check usage alerts and Render dashboard before driving traffic. The expected incremental cost under included limits is $0, but this is not a guaranteed hard spend cap.
- No new Hatchable public app was used because free Personal projects are normally private until an owner-side visibility action.

## Operations and recovery
1. Check Render's static-service dashboard for deploy status, delivery metrics and billing alerts.
2. Test the public page on mobile and desktop. Confirm that the demo table filters and synthetic CSV download work, that the pilot mailto link opens a compose window, and that no financial upload exists.
3. If broken, do not send clients data or purchase any paid service. Repair the isolated branch and explicitly trigger a deploy on the static service (auto deploy is off). Check last deployment before retrying.
4. If immediate takedown is required, suspend/delete only static service `srv-dblp6715efls73acjtm0` after confirming that identifier. Never touch the existing TruEnvelope services.
5. Before any refresh: inspect existing service's last deploy, current Git branch and owner instructions. Avoid duplicate deploys.

## Outstanding
- Browser end-to-end and mail-client experience should be independently verified.
- There is no CRM intake database, automated lead monitoring, or paid customer delivery workflow.
- Brand clearance is preliminary only.
- Deployment stores no lead information, so interest is measured only from emails the visitor chooses to send.
