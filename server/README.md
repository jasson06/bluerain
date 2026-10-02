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

## Checks

Run `npm test -- --runInBand`. `__tests__/serverFlows.test.js` covers module initialization, the original 253 endpoint registrations (paths, methods, handler counts, and order), tenant handlers, payment calculations, maintenance normalization, and QuickBooks configuration/encryption. Tests use mocked dependencies and do not start the production server.

The extraction was also checked by comparing parsed code before and after dependency qualification: all 98 helper functions and 253 handlers retained their logic, and other startup statements retained their order. Live database, email, OCR, and QuickBooks integrations still require environment-backed testing.
