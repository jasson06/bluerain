Production overlay: read ../DEPLOYMENT.txt and ../MERGE-REPORT.txt first.
The original organization notes below describe the local split; production storage and operational endpoints are now supplied by production-storage.js and production-routes.js.

# Server flows

`../server.js` remains the entry point for `npm start` and `npm run dev`. It owns configuration, service clients, schemas/models, upload middleware, scheduled-job startup, and the ordered list of route registrations.

`flows/` holds route handlers and helper functions grouped by business flow:

- `quickbooks.js`: property connections, OAuth, payment matching/import, and synchronization.
- `tenants.js`, `tenant-portal.js`, `units.js`, `properties.js`: rental operations.
- `maintenance.js`, `maintenance-schedules.js`, `maintenance-estimates.js`: requests, recurring work, reminders, and estimate synchronization.
- `payments.js`, `invoices.js`, `expenses.js`: money movement and accounting records.
- `applications.js`, `announcements.js`, `documents.js`: applications and property communication.
- `projects.js`, `tasks.js`, `vendors.js`, `clients.js`, `estimates.js`, `quotes.js`, `labor-costs.js`, `quality-control.js`, `catalog.js`: project workflows.
- `auth.js`, `email.js`, `uploads.js`, `shared.js`, `system.js`, `calorie-tracker.js`: supporting services and other existing endpoints.

Each module exports a factory receiving `serverContext`. Creating a flow only defines functions; it does not register routes or read models/configuration. `server.js` invokes each exported route-registration function at the original position relative to middleware and initialization.

The context uses getters/setters so a callback sees the current shared dependency when it runs. This matters for routes registered before a model or helper variable is initialized. It also retains the original root `__dirname` and `require`, so uploads, static files, and relative imports resolve as before. Do not eagerly destructure the context at factory creation.

Helper aliases are initialized before the existing bootstrap statements, matching the original availability of hoisted function declarations. Calls written as `(0, serverContext.helper)(...)` preserve the original standalone-function calling convention.

To edit a flow, change its module. To add an endpoint, export its registration function and call it from `server.js` at the appropriate point before the 404 fallback. Express route order matters; update the route-order fixture deliberately if changing that order is intended.

No endpoint was removed or renamed. Existing `maintenance-qc.js` and `eviction-cases.js` integrations retain their registration and setup locations.

## Maintenance invoices

Maintenance responses include an `invoices` array derived from invoice lines
matching both `linkedEstimateId` and `linkedEstimateItemId` on the same line.
Each summary contains `_id`, `invoiceNumber`, `date`, `status`, and `amount`.
The amount sums only the matching lines, not the entire invoice. Multiple
invoices per item are supported; unlinked work returns an empty array.
Recurring history entries match their own `estimateId` and `estimateItemId`,
never the current visit's item. The schedule's `invoices` array includes both
current and completed visits, so completing a visit and clearing its current
item link does not remove its invoice from the response. An invoice
covering multiple visits appears once on the schedule, with the sum of its
matching visit lines. No historical links are guessed.

Property and portfolio maintenance requests show invoice summaries. Recurring
cards and expanded rows show invoices only for the selected completion, updating
when another history date is selected; they do not display the schedule-wide
invoice aggregate. Invoice numbers/statuses remain beside completed dates.
Clicking the invoice number opens the existing
invoice preview using `invoice-creater.html?invoiceId=...`, without requiring
a vendor ID for that preview. Links are resolved on read, so edits, deletion,
and re-categorization are reflected on refresh without a backfill or migration.
`GET /api/invoices/:id` retrieves the exact invoice, including bills whose
reference number is blank or reused.

## Maintenance chat updates

Posting, editing, and deleting chat updates synchronize the affected request's
thread in property and portfolio views without rebuilding the section, changing
filters, or discarding other message drafts. Request deletion removes its own
card/row and updates counts and portfolio pagination in place.

Managers can edit or delete management and tenant messages with
`PATCH` / `DELETE /api/properties/:propertyId/maintenance/:requestId/messages/:updateId`.
These endpoints require a manager bearer token, scope updates to the request and
property, and allow managers to edit/delete manager, tenant, system, and workflow
updates; vendor messages remain read-only. Edits preserve authorship
and creation time and record `editedAt`. Atomic per-message updates preserve
concurrently posted messages and reject changes to an update that changed during
the operation. Hover/focus reveals edit/delete icons; touch devices show them.
If the manager token is missing or expired, an in-place sign-in dialog renews
the session through the existing manager sign-in endpoint, then retries the
edit/delete once. Cancelling leaves the update and draft unchanged. Manager IDs
alone never authorize message changes, and invalid sessions are not bypassed.

Tenant notes can also be edited in place using the pencil beside the delete
icon on property/portfolio tenant cards, the tenant notes drawer, and the
portfolio notes sidebar. `PATCH /api/tenants/:id/notes/:noteId` requires a
manager bearer token and atomically changes only the matching note's text,
preserving its ID, creation time, and other notes. Empty text and invalid IDs
return 400; a missing tenant/note returns 404. Editing renews expired manager
sessions through the same sign-in dialog. Save updates the loaded tenant records
and visible copies of that note without rebuilding cards or clearing new-note
drafts; Cancel leaves the note unchanged.
Tenant card delete controls call the shared deletion handler directly in both
property and portfolio grids, including after cards are re-rendered.

Posting tenant notes (`POST /api/tenants/:id/notes`) requires a manager bearer
token. The server stores `authorRole: 'manager'` and an `authorName` snapshot
from the authenticated manager's profile, ignoring client-supplied authorship.
All tenant note posting surfaces use session renewal when needed. Cards, the
notes drawer, and the portfolio sidebar display the saved author. Older notes
without authorship remain labeled Management, not the current viewer's name;
their original author cannot be reconstructed. Edits preserve authorship.

Maintenance request workflow/status changes through PATCH and full-edit PUT
require a manager session. Their timeline entries store `authorRole: 'manager'`
and the authenticated manager's profile name as `authorName`. `kind: 'workflow'`
identifies generated workflow entries, which managers can also edit or delete.
Changing/removing a timeline entry does not change the request's workflow status.
Other automatic updates remain System; historical entries are not relabeled.
Inline, quick-status, and photo/full-edit saves all support session renewal and
preserve the existing media-upload flow.

## Tenant termination and overview accounting

`tenant-lifecycle.js` defines lease charge cutoffs and tenant/period payment
allocation. Tenant updates accept a reviewed `termination` containing an
effective date, reason, non-negative final rent, and possession confirmation.
The final rent is saved as that month's expected-rent override; existing late
fees remain separate. No final-month proration, write-off, or deposit refund is
automatic. Subsequent months stop accruing recurring rent and fees.

Termination, payment-balance recalculation, and possession release run in one
MongoDB transaction (a replica set or transaction-capable deployment is required,
as for payment allocations). A unit is released only when possession is
confirmed and it is still assigned to the tenant. Expiration/status edits alone
do not imply vacancy. Terminated lease history stays immutable through ordinary
tenant edits; create a new tenant/lease record for a new lease.

Overview expected rent and outstanding are calculated per tenant and applied
rent month, including historical/final charges through the lease cutoff.
`rentCollected` is capped payment/credit allocation against those charges,
not cash received. Operating `rentalIncome` uses `rentCollected` for the selected
rent months; `otherIncome` uses non-deposit receipts dated in the selected range.
`cashRentCollected` and `totalCashCollected` are separate receipt-date measures;
the latter includes non-deposit income. NOI and management fees use operating
income, not the receipt-date cash totals. `formerTenants` exposes cumulative
former rent balances separately from active/pending delinquency. These totals
overlap when the selected period includes former tenants' final charges; do not
add them together. Deposits remain in their existing separate ledger.

QuickBooks rent payments linked to invoices are assigned to the invoice's due
month, not its creation or payment date. If an invoice has no due date, its
invoice date remains the fallback rent month.
Payment-workspace success and informational statuses dismiss after four
seconds. Errors and in-progress loading statuses stay visible; a newer status
cancels any pending dismissal.
The payment table's informational QuickBooks connection reminder also dismisses
after four seconds, including when no transactions match. Error notices remain.
Property tabs fill the available viewport height. Record lists and payment
tables use the space below their actual headers and filters, reserving room for
pagination and mobile navigation. Sizing updates on tab changes, content
updates, and viewport resizing; short screens retain a usable scroll area.
Card-grid rows keep their intrinsic content height inside these scroll areas,
so utilities, details, and action buttons are not squeezed or clipped.

Overview clients send `from` and exclusive `to` timestamps plus the browser's
IANA `timeZone`. Rent months and month-based expense counts use that calendar,
so a UTC offset cannot include the previous or next month accidentally. Receipt
and expense date filters retain the original absolute timestamp boundaries.
Requests without `timeZone` retain the server-local calendar behavior.

The overview expected-payment table uses compact single-line summaries with
sticky Tenant / Unit, Status, Expected, and Due column headers inside its scroll
container. Due is the outstanding rent balance. Hover reveals the
full tenant, unit, rent month, and applied payment/credit details; the tenant
button exposes the same details to assistive technology and opens the lease
ledger as before.

Existing former leases are not rewritten or assigned invented termination dates.
Missing lease start/end information is flagged for review, not reported as settled.
Tenants with former leases or payment history cannot be deleted.
Former-tenant rent receipts and credit allocations must target a rent month
within the ended lease. The stored receipt date remains the actual payment date.
Voiding a payment keeps its ledger record and reason, excludes it from rent,
cash, deposit, and balance calculations, and recalculates the tenant ledger.
Posting a replacement receipt also excludes voided receipts and their late
fees from the prior-payment totals, so a returned payment cannot create credit.
Payments linked to QuickBooks are voided locally; their QuickBooks transaction
must be voided separately.
Voided payments can be reinstated through the payment Actions menu. Reinstatement
restores the pre-void posting status (posted for older voids), retains the void
reason/date, and records a reinstatement timestamp. All rows of a split allocation
are restored together in one transaction, including deposit-paid tracking and
tenant balance recalculation. Duplicate reinstatements and partially voided
allocation groups are rejected. This operation does not modify QuickBooks.
Monthly override updates validate the lease period and non-negative amounts,
preserve omitted fields, and recalculate stored payment balances transactionally.
Changing final-month expected rent also updates the reviewed termination charge.

### Credit application

Credits are applied explicitly through the shared allocation modal, one category
and month at a time. Posting a receipt no longer automatically consumes legacy
`carryForward` credits. Partial applications leave the unused amount available.
The payment table displays applied months as `NOV-26`. Generated credit notes
use the source credit's period, for example `(Credit applied from OCT-26)`,
while `creditSourceId` retains the audit link. Older ID-based notes are formatted
for display when their source is loaded, without rewriting historical records.

The source stores `creditConsumed`; a zero-cash adjustment stores `appliedCredit`,
`creditSourceId`, and an idempotency UUID (`creditApplicationKey`). Source
consumption, the adjustment, deposit tracking, and balance recalculation commit
in one MongoDB transaction. Retrying the same UUID returns the original
adjustment; changing its destination or amount returns a conflict. Invalid or
excessive amounts are rejected rather than silently replaced or capped.
Rent and deposit applications cannot exceed the outstanding balance; any
unused source credit remains available.

Receipt amounts and dates remain unchanged. Transferring an overpayment reduces
its source-category applied value and applies it to the selected destination;
it does not create new cash or update QuickBooks. A source cannot be re-applied
to its existing category and month, and allocation entries cannot become new
credit sources. Used sources and their adjustments cannot be edited, deleted,
voided, or split without a supported reconciliation flow.
Clicking a voided or credit-linked payment row opens a compact anchored
explanation box without an inline lock indicator. Focused locked rows also open
the box with Enter or Space. Its close button, Escape, outside clicks, and
viewport changes dismiss it. Ordinary payments remain editable.

Legacy negative credits retain their previously consumed amount. Legacy
positive payments with ambiguous `appliedCredit` history are rejected for
further credit application and require reconciliation; no historical records
are guessed or bulk-migrated.

## Checks

Run `npm test -- --runInBand`. `__tests__/serverFlows.test.js` covers module initialization, the original 253 endpoint registrations (paths, methods, handler counts, and order), tenant handlers, payment calculations, maintenance normalization, and QuickBooks configuration/encryption. Tests use mocked dependencies and do not start the production server.

The extraction was also checked by comparing parsed code before and after dependency qualification: all 98 helper functions and 253 handlers retained their logic, and other startup statements retained their order. Live database, email, OCR, and QuickBooks integrations still require environment-backed testing.
