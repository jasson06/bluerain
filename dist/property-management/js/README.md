# Property management JavaScript

Feature files contain classic global function declarations. The HTML loads them before property-management.js, which holds shared state, startup listeners, global exports, and function wrappers in their original execution order. Keep this order; do not add async or change these scripts to modules without migrating the global handlers.

Existing account, toolbar, and sorting scripts retain their positions.

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

## Validation

The initial split preserved all 561 function declarations exactly. A subsequent static audit removed seven unreferenced functions and three superseded duplicate declarations; retained function bodies are unchanged. All startup statements were preserved exactly in their original order. Every generated script parses successfully. Effective global function definitions match the original, including duplicate declarations. Live authenticated browser flows were not exercised.
