# Property management JavaScript

Feature files contain classic global function declarations. The HTML loads them before property-management.js, which holds shared state, startup listeners, global exports, and function wrappers in their original execution order. Keep this order; do not add async or change these scripts to modules without migrating the global handlers.

Existing account, toolbar, and sorting scripts retain their positions.

Payment rows expose download receipt, email receipt, void, and delete through the
vertical three-dot Actions menu in payments-search.js. The menu is mounted
outside the scrolling table to avoid clipping, supports keyboard navigation,
and closes on outside click, Escape, scrolling, resizing, or table re-render.
Voided rows offer Reinstate payment instead of email, void, or delete. After
confirmation, reinstatement restores collections and tenant balances, refreshes
payments/tenants and invalidates overview data. QuickBooks-linked payments show
a local-only warning; split allocations are reinstated together.

## Feature files

- maintenance-workflow.js
- application-core.js
- applications-search.js
- global-search.js
- portfolio-records.js
- portfolio-search.js
- property-profile.js
- quickbooks.js
- property-overview.js
- navigation-properties.js
- shared-utilities.js
- units.js
- tenants.js
- maintenance-requests.js
- maintenance-schedules.js
- documents-announcements.js
- applications-invites.js
- maintenance-overview.js
- application-prefill.js
- notes.js
- payments-search.js
- payments-charges.js
- payment-receipts.js
- tenant-balances-reports.js
- modals-loaders.js
- portfolio-dashboard.js
- portfolio-workspace.js
- portfolio-tasks-mobile.js
- portfolio-details.js
- application-ui.js

## Tenant lifecycle

Tenant cards include a guided Terminate lease / Review termination action.
The Former Tenants tab preserves ledger access and shows rent balances separately.
Possession confirmation, not lease status alone, controls unit release.
`shared-utilities.js` supplies lease-cutoff and tenant/period allocation helpers
used by tenant cards, portfolio rent details, and balance-sheet/PDF calculations;
the server equivalents are regression-tested for parity. Overview collection
totals apply to selected-period charges; cash receipts and former balances are
displayed separately. Deposits require a separate ledger review before settlement.

Open Ledger in the shared tenant details view replaces the detail content with a
monthly lease ledger and a Back to tenant details action. It lists all months
from lease start through the earlier lease end/termination date, including
future scheduled charges. Expected rent is editable per month; late fees are
displayed separately and preserved by rent-only updates. The payment history
shows receipt dates separately from applied rent months.

## Validation

The property overview Rent collection panel lists each tenant/month in the
selected range with expected, applied, and outstanding amounts. Badges distinguish
Paid, Partially paid, Unpaid, Scheduled future payments, and No charge.
Tenant names open the editable lease ledger. The list uses the same server
tenant/period calculations as the panel totals, not a separate browser estimate.
Overview cache reuse requires the same property/date range and a payment
breakdown that reconciles with all three rent totals. Missing or inconsistent
details display a refresh error rather than a false empty-payment message.

The initial split preserved all 561 function declarations exactly. A subsequent static audit removed seven unreferenced functions and three superseded duplicate declarations; retained function bodies are unchanged. All startup statements were preserved exactly in their original order. Every generated script parses successfully. Effective global function definitions match the original, including duplicate declarations. Live authenticated browser flows were not exercised.
