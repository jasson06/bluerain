// SERVER FLOW MAP
// Search SECTION for setup areas or [FLOW: name] for a business flow.
// 01 Shared dependency context       02 Flow module loading
// 03 Shared helper bindings          04 Configuration and service clients
// 05 Middleware and database         06 Schemas and model registration
// 07 API routes and flow setup       08 Fallback and server startup
// Main business flows: quickbooks, tenants, tenant-portal, maintenance,
// maintenance-schedules, properties, units, payments, invoices, expenses.
// Implementations: server/flows/<flow-name>.js
// Some flows appear in multiple blocks to preserve Express registration order.
// Server bootstrap: configuration, models, middleware, ordered route registration, and jobs.

// ============================================================================
// [SECTION 01] SHARED DEPENDENCY CONTEXT
// ============================================================================
// Live getters preserve initialization timing and cross-flow dependencies.
const serverContext = {
  get uploadDir() { return uploadDir; },
  get resolveStoredUploadPath() { return resolveStoredUploadPath; },
  get sanitizeHeaderFilename() { return sanitizeHeaderFilename; },
  get encodeRFC5987Value() { return encodeRFC5987Value; },
  get getContentDispositionHeader() { return getContentDispositionHeader; },
  get sanitizeFilename() { return sanitizeFilename; },
  get ATTACHMENTS_DIR() { return ATTACHMENTS_DIR; },
  set ATTACHMENTS_DIR(value) { ATTACHMENTS_DIR = value; },
  get Announcement() { return Announcement; },
  set Announcement(value) { Announcement = value; },
  get Application() { return Application; },
  set Application(value) { Application = value; },
  get ApplicationInvite() { return ApplicationInvite; },
  set ApplicationInvite(value) { ApplicationInvite = value; },
  get CalorieUser() { return CalorieUser; },
  set CalorieUser(value) { CalorieUser = value; },
  get Client() { return Client; },
  set Client(value) { Client = value; },
  get Comment() { return Comment; },
  set Comment(value) { Comment = value; },
  get DailyUpdate() { return DailyUpdate; },
  set DailyUpdate(value) { DailyUpdate = value; },
  get Document() { return Document; },
  set Document(value) { Document = value; },
  get Estimate() { return Estimate; },
  set Estimate(value) { Estimate = value; },
  get Expense() { return Expense; },
  set Expense(value) { Expense = value; },
  get FileSystem() { return FileSystem; },
  set FileSystem(value) { FileSystem = value; },
  get Imap() { return Imap; },
  set Imap(value) { Imap = value; },
  get Invitation() { return Invitation; },
  set Invitation(value) { Invitation = value; },
  get Invoice() { return Invoice; },
  set Invoice(value) { Invoice = value; },
  get JWT_SECRET() { return JWT_SECRET; },
  set JWT_SECRET(value) { JWT_SECRET = value; },
  get LaborCost() { return LaborCost; },
  set LaborCost(value) { LaborCost = value; },
  get MAINTENANCE_WORKFLOW_STAGES() { return MAINTENANCE_WORKFLOW_STAGES; },
  set MAINTENANCE_WORKFLOW_STAGES(value) { MAINTENANCE_WORKFLOW_STAGES = value; },
  get MaintenanceRequest() { return MaintenanceRequest; },
  set MaintenanceRequest(value) { MaintenanceRequest = value; },
  get MaintenanceSchedule() { return MaintenanceSchedule; },
  set MaintenanceSchedule(value) { MaintenanceSchedule = value; },
  get Manager() { return Manager; },
  set Manager(value) { Manager = value; },
  get PORT() { return PORT; },
  set PORT(value) { PORT = value; },
  get Payment() { return Payment; },
  set Payment(value) { Payment = value; },
  get PortfolioTask() { return PortfolioTask; },
  set PortfolioTask(value) { PortfolioTask = value; },
  get Product() { return Product; },
  set Product(value) { Product = value; },
  get Project() { return Project; },
  set Project(value) { Project = value; },
  get Property() { return Property; },
  set Property(value) { Property = value; },
  get QB_CLIENT_ID() { return QB_CLIENT_ID; },
  set QB_CLIENT_ID(value) { QB_CLIENT_ID = value; },
  get QB_CLIENT_SECRET() { return QB_CLIENT_SECRET; },
  set QB_CLIENT_SECRET(value) { QB_CLIENT_SECRET = value; },
  get QB_ENVIRONMENT() { return QB_ENVIRONMENT; },
  set QB_ENVIRONMENT(value) { QB_ENVIRONMENT = value; },
  get QB_REDIRECT_URI() { return QB_REDIRECT_URI; },
  set QB_REDIRECT_URI(value) { QB_REDIRECT_URI = value; },
  get QB_SCOPE() { return QB_SCOPE; },
  set QB_SCOPE(value) { QB_SCOPE = value; },
  get QB_TOKEN_ENCRYPTION_CONFIGURED() { return QB_TOKEN_ENCRYPTION_CONFIGURED; },
  set QB_TOKEN_ENCRYPTION_CONFIGURED(value) { QB_TOKEN_ENCRYPTION_CONFIGURED = value; },
  get QB_TOKEN_KEY() { return QB_TOKEN_KEY; },
  set QB_TOKEN_KEY(value) { QB_TOKEN_KEY = value; },
  get QuickBooksConnection() { return QuickBooksConnection; },
  set QuickBooksConnection(value) { QuickBooksConnection = value; },
  get QuickBooksSyncLog() { return QuickBooksSyncLog; },
  set QuickBooksSyncLog(value) { QuickBooksSyncLog = value; },
  get Quote() { return Quote; },
  set Quote(value) { Quote = value; },
  get RoomPackage() { return RoomPackage; },
  set RoomPackage(value) { RoomPackage = value; },
  get SYSTEM_FOLDER_IDS() { return SYSTEM_FOLDER_IDS; },
  set SYSTEM_FOLDER_IDS(value) { SYSTEM_FOLDER_IDS = value; },
  get SelectionBoard() { return SelectionBoard; },
  set SelectionBoard(value) { SelectionBoard = value; },
  get Task() { return Task; },
  set Task(value) { Task = value; },
  get Tenant() { return Tenant; },
  set Tenant(value) { Tenant = value; },
  get Todo() { return Todo; },
  set Todo(value) { Todo = value; },
  get Unit() { return Unit; },
  set Unit(value) { Unit = value; },
  get Vendor() { return Vendor; },
  set Vendor(value) { Vendor = value; },
  get __dirname() { return __dirname; },
  set __dirname(value) { __dirname = value; },
  get app() { return app; },
  set app(value) { app = value; },
  get appendMaintenanceSystemUpdate() { return appendMaintenanceSystemUpdate; },
  set appendMaintenanceSystemUpdate(value) { appendMaintenanceSystemUpdate = value; },
  get applyDefaultAddressValues() { return applyDefaultAddressValues; },
  set applyDefaultAddressValues(value) { applyDefaultAddressValues = value; },
  get attachQuickBooksPaymentMatches() { return attachQuickBooksPaymentMatches; },
  set attachQuickBooksPaymentMatches(value) { attachQuickBooksPaymentMatches = value; },
  get authCalorie() { return authCalorie; },
  set authCalorie(value) { authCalorie = value; },
  get authTenantPortal() { return authTenantPortal; },
  set authTenantPortal(value) { authTenantPortal = value; },
  get authenticateManagerProfile() { return authenticateManagerProfile; },
  set authenticateManagerProfile(value) { authenticateManagerProfile = value; },
  get autoResolveQuickBooksPaymentsForProperty() { return autoResolveQuickBooksPaymentsForProperty; },
  set autoResolveQuickBooksPaymentsForProperty(value) { autoResolveQuickBooksPaymentsForProperty = value; },
  get axios() { return axios; },
  set axios(value) { axios = value; },
  get bcrypt() { return bcrypt; },
  set bcrypt(value) { bcrypt = value; },
  get buildAllPropertyDocumentsFolder() { return buildAllPropertyDocumentsFolder; },
  set buildAllPropertyDocumentsFolder(value) { buildAllPropertyDocumentsFolder = value; },
  get buildExpenseFromInvoice() { return buildExpenseFromInvoice; },
  set buildExpenseFromInvoice(value) { buildExpenseFromInvoice = value; },
  get buildExpenseLineItemFromInvoiceItem() { return buildExpenseLineItemFromInvoiceItem; },
  set buildExpenseLineItemFromInvoiceItem(value) { buildExpenseLineItemFromInvoiceItem = value; },
  get buildInvoiceFromExpense() { return buildInvoiceFromExpense; },
  set buildInvoiceFromExpense(value) { buildInvoiceFromExpense = value; },
  get buildInvoiceLineItemFromExpenseItem() { return buildInvoiceLineItemFromExpenseItem; },
  set buildInvoiceLineItemFromExpenseItem(value) { buildInvoiceLineItemFromExpenseItem = value; },
  get buildQuickBooksImportNote() { return buildQuickBooksImportNote; },
  set buildQuickBooksImportNote(value) { buildQuickBooksImportNote = value; },
  get buildQuickBooksPaymentRecord() { return buildQuickBooksPaymentRecord; },
  set buildQuickBooksPaymentRecord(value) { buildQuickBooksPaymentRecord = value; },
  get buildTenantPortalPayload() { return buildTenantPortalPayload; },
  set buildTenantPortalPayload(value) { buildTenantPortalPayload = value; },
  get buildTenantPortalPaymentLedger() { return buildTenantPortalPaymentLedger; },
  set buildTenantPortalPaymentLedger(value) { buildTenantPortalPaymentLedger = value; },
  get buildUnifiedQuickBooksPaymentEntries() { return buildUnifiedQuickBooksPaymentEntries; },
  set buildUnifiedQuickBooksPaymentEntries(value) { buildUnifiedQuickBooksPaymentEntries = value; },
  get calculateEstimateTotal() { return calculateEstimateTotal; },
  set calculateEstimateTotal(value) { calculateEstimateTotal = value; },
  get computeExpectedRentForMonth() { return computeExpectedRentForMonth; },
  set computeExpectedRentForMonth(value) { computeExpectedRentForMonth = value; },
  get computeFirstMonthProratedBaseRent() { return computeFirstMonthProratedBaseRent; },
  set computeFirstMonthProratedBaseRent(value) { computeFirstMonthProratedBaseRent = value; },
  get computeTenantPostedMonthlyRent() { return computeTenantPostedMonthlyRent; },
  set computeTenantPostedMonthlyRent(value) { computeTenantPostedMonthlyRent = value; },
  get createQbState() { return createQbState; },
  set createQbState(value) { createQbState = value; },
  get crypto() { return crypto; },
  set crypto(value) { crypto = value; },
  get daysInMonth() { return daysInMonth; },
  set daysInMonth(value) { daysInMonth = value; },
  get decryptQbSecret() { return decryptQbSecret; },
  set decryptQbSecret(value) { decryptQbSecret = value; },
  get deriveExpenseLineItemAmount() { return deriveExpenseLineItemAmount; },
  set deriveExpenseLineItemAmount(value) { deriveExpenseLineItemAmount = value; },
  get deriveExpenseTotals() { return deriveExpenseTotals; },
  set deriveExpenseTotals(value) { deriveExpenseTotals = value; },
  get deriveInvoiceLineItemTotal() { return deriveInvoiceLineItemTotal; },
  set deriveInvoiceLineItemTotal(value) { deriveInvoiceLineItemTotal = value; },
  get deriveMaintenanceStatusFromStage() { return deriveMaintenanceStatusFromStage; },
  set deriveMaintenanceStatusFromStage(value) { deriveMaintenanceStatusFromStage = value; },
  get encryptQbSecret() { return encryptQbSecret; },
  set encryptQbSecret(value) { encryptQbSecret = value; },
  get ensureQbCustomer() { return ensureQbCustomer; },
  set ensureQbCustomer(value) { ensureQbCustomer = value; },
  get ensureScheduleActivatedForDate() { return ensureScheduleActivatedForDate; },
  set ensureScheduleActivatedForDate(value) { ensureScheduleActivatedForDate = value; },
  get ensureVendorProjectAssignment() { return ensureVendorProjectAssignment; },
  set ensureVendorProjectAssignment(value) { ensureVendorProjectAssignment = value; },
  get escapeQbQuery() { return escapeQbQuery; },
  set escapeQbQuery(value) { escapeQbQuery = value; },
  get escapeRegexForMaintenanceLink() { return escapeRegexForMaintenanceLink; },
  set escapeRegexForMaintenanceLink(value) { escapeRegexForMaintenanceLink = value; },
  get fetch() { return fetch; },
  set fetch(value) { fetch = value; },
  get fetchQuickBooksPaymentRecords() { return fetchQuickBooksPaymentRecords; },
  set fetchQuickBooksPaymentRecords(value) { fetchQuickBooksPaymentRecords = value; },
  get formatMaintenanceTimelineDate() { return formatMaintenanceTimelineDate; },
  set formatMaintenanceTimelineDate(value) { formatMaintenanceTimelineDate = value; },
  get formatProjectDocumentLabel() { return formatProjectDocumentLabel; },
  set formatProjectDocumentLabel(value) { formatProjectDocumentLabel = value; },
  get fs() { return fs; },
  set fs(value) { fs = value; },
  get getEstimateItemStatusFromMaintenanceStatus() { return getEstimateItemStatusFromMaintenanceStatus; },
  set getEstimateItemStatusFromMaintenanceStatus(value) { getEstimateItemStatusFromMaintenanceStatus = value; },
  get getMaintenanceEmailHtml() { return getMaintenanceEmailHtml; },
  set getMaintenanceEmailHtml(value) { getMaintenanceEmailHtml = value; },
  get getMaintenanceStatusFromEstimateItemStatus() { return getMaintenanceStatusFromEstimateItemStatus; },
  set getMaintenanceStatusFromEstimateItemStatus(value) { getMaintenanceStatusFromEstimateItemStatus = value; },
  get getOverdueMaintenanceEmailHtml() { return getOverdueMaintenanceEmailHtml; },
  set getOverdueMaintenanceEmailHtml(value) { getOverdueMaintenanceEmailHtml = value; },
  get getQbConnection() { return getQbConnection; },
  set getQbConnection(value) { getQbConnection = value; },
  get getRecurringMaintenanceEstimateTitle() { return getRecurringMaintenanceEstimateTitle; },
  set getRecurringMaintenanceEstimateTitle(value) { getRecurringMaintenanceEstimateTitle = value; },
  get getRecurringMaintenanceUnitLabel() { return getRecurringMaintenanceUnitLabel; },
  set getRecurringMaintenanceUnitLabel(value) { getRecurringMaintenanceUnitLabel = value; },
  get getStartOfToday() { return getStartOfToday; },
  set getStartOfToday(value) { getStartOfToday = value; },
  get getTaskAssignmentEmailHtml() { return getTaskAssignmentEmailHtml; },
  set getTaskAssignmentEmailHtml(value) { getTaskAssignmentEmailHtml = value; },
  get inferApplyToFromQuickBooksPaymentRecord() { return inferApplyToFromQuickBooksPaymentRecord; },
  set inferApplyToFromQuickBooksPaymentRecord(value) { inferApplyToFromQuickBooksPaymentRecord = value; },
  get inferMethodFromQuickBooksPaymentRecord() { return inferMethodFromQuickBooksPaymentRecord; },
  set inferMethodFromQuickBooksPaymentRecord(value) { inferMethodFromQuickBooksPaymentRecord = value; },
  get inferPeriodMonthFromQuickBooksPaymentRecord() { return inferPeriodMonthFromQuickBooksPaymentRecord; },
  set inferPeriodMonthFromQuickBooksPaymentRecord(value) { inferPeriodMonthFromQuickBooksPaymentRecord = value; },
  get inferTypeFromQuickBooksPaymentRecord() { return inferTypeFromQuickBooksPaymentRecord; },
  set inferTypeFromQuickBooksPaymentRecord(value) { inferTypeFromQuickBooksPaymentRecord = value; },
  get invoiceLineItemsReadyForApproval() { return invoiceLineItemsReadyForApproval; },
  set invoiceLineItemsReadyForApproval(value) { invoiceLineItemsReadyForApproval = value; },
  get jwt() { return jwt; },
  set jwt(value) { jwt = value; },
  get logDailyUpdate() { return logDailyUpdate; },
  set logDailyUpdate(value) { logDailyUpdate = value; },
  get maintenancePhotoUpload() { return maintenancePhotoUpload; },
  set maintenancePhotoUpload(value) { maintenancePhotoUpload = value; },
  get maintenanceQC() { return maintenanceQC; },
  set maintenanceQC(value) { maintenanceQC = value; },
  get maintenanceQCError() { return maintenanceQCError; },
  set maintenanceQCError(value) { maintenanceQCError = value; },
  get maintenanceTempUpload() { return maintenanceTempUpload; },
  set maintenanceTempUpload(value) { maintenanceTempUpload = value; },
  get mapExpenseStatusToInvoiceStatus() { return mapExpenseStatusToInvoiceStatus; },
  set mapExpenseStatusToInvoiceStatus(value) { mapExpenseStatusToInvoiceStatus = value; },
  get mapInvoiceStatusToExpenseStatus() { return mapInvoiceStatusToExpenseStatus; },
  set mapInvoiceStatusToExpenseStatus(value) { mapInvoiceStatusToExpenseStatus = value; },
  get matchQuickBooksRecordForLocalPayment() { return matchQuickBooksRecordForLocalPayment; },
  set matchQuickBooksRecordForLocalPayment(value) { matchQuickBooksRecordForLocalPayment = value; },
  get matchTenantForQuickBooksPaymentRecord() { return matchTenantForQuickBooksPaymentRecord; },
  set matchTenantForQuickBooksPaymentRecord(value) { matchTenantForQuickBooksPaymentRecord = value; },
  get memoryUpload() { return memoryUpload; },
  set memoryUpload(value) { memoryUpload = value; },
  get mongoose() { return mongoose; },
  set mongoose(value) { mongoose = value; },
  get nodemailer() { return nodemailer; },
  set nodemailer(value) { nodemailer = value; },
  get normalizeAddressForTenantPortal() { return normalizeAddressForTenantPortal; },
  set normalizeAddressForTenantPortal(value) { normalizeAddressForTenantPortal = value; },
  get normalizeCalcMode() { return normalizeCalcMode; },
  set normalizeCalcMode(value) { normalizeCalcMode = value; },
  get normalizeExpenseLineItems() { return normalizeExpenseLineItems; },
  set normalizeExpenseLineItems(value) { normalizeExpenseLineItems = value; },
  get normalizeInvoiceLineItems() { return normalizeInvoiceLineItems; },
  set normalizeInvoiceLineItems(value) { normalizeInvoiceLineItems = value; },
  get normalizeMaintenanceWorkflowStage() { return normalizeMaintenanceWorkflowStage; },
  set normalizeMaintenanceWorkflowStage(value) { normalizeMaintenanceWorkflowStage = value; },
  get normalizeOptionalObjectId() { return normalizeOptionalObjectId; },
  set normalizeOptionalObjectId(value) { normalizeOptionalObjectId = value; },
  get normalizePaymentTypeServer() { return normalizePaymentTypeServer; },
  set normalizePaymentTypeServer(value) { normalizePaymentTypeServer = value; },
  get normalizePhoneDigits() { return normalizePhoneDigits; },
  set normalizePhoneDigits(value) { normalizePhoneDigits = value; },
  get normalizeQbPaymentAmount() { return normalizeQbPaymentAmount; },
  set normalizeQbPaymentAmount(value) { normalizeQbPaymentAmount = value; },
  get normalizeQbPaymentDate() { return normalizeQbPaymentDate; },
  set normalizeQbPaymentDate(value) { normalizeQbPaymentDate = value; },
  get normalizeQbPaymentText() { return normalizeQbPaymentText; },
  set normalizeQbPaymentText(value) { normalizeQbPaymentText = value; },
  get parseAddress() { return parseAddress; },
  set parseAddress(value) { parseAddress = value; },
  get parseAnnouncementCalendarDate() { return parseAnnouncementCalendarDate; },
  set parseAnnouncementCalendarDate(value) { parseAnnouncementCalendarDate = value; },
  get parseMaintenanceCost() { return parseMaintenanceCost; },
  set parseMaintenanceCost(value) { parseMaintenanceCost = value; },
  get parseMaintenanceDate() { return parseMaintenanceDate; },
  set parseMaintenanceDate(value) { parseMaintenanceDate = value; },
  get path() { return path; },
  set path(value) { path = value; },
  get qbBaseUrl() { return qbBaseUrl; },
  set qbBaseUrl(value) { qbBaseUrl = value; },
  get qbRequest() { return qbRequest; },
  set qbRequest(value) { qbRequest = value; },
  get qcReworkUpload() { return qcReworkUpload; },
  set qcReworkUpload(value) { qcReworkUpload = value; },
  get refreshQbConnection() { return refreshQbConnection; },
  set refreshQbConnection(value) { refreshQbConnection = value; },
  get resolveInvoiceAttachmentPath() { return resolveInvoiceAttachmentPath; },
  set resolveInvoiceAttachmentPath(value) { resolveInvoiceAttachmentPath = value; },
  get resolveInvoiceVendorName() { return resolveInvoiceVendorName; },
  set resolveInvoiceVendorName(value) { resolveInvoiceVendorName = value; },
  get resolveWorkspaceQbRecord() { return resolveWorkspaceQbRecord; },
  set resolveWorkspaceQbRecord(value) { resolveWorkspaceQbRecord = value; },
  get scheduleAutomaticQuickBooksPaymentSync() { return scheduleAutomaticQuickBooksPaymentSync; },
  set scheduleAutomaticQuickBooksPaymentSync(value) { scheduleAutomaticQuickBooksPaymentSync = value; },
  get sendExistingUserEmail() { return sendExistingUserEmail; },
  set sendExistingUserEmail(value) { sendExistingUserEmail = value; },
  get sendNewUserInviteEmail() { return sendNewUserInviteEmail; },
  set sendNewUserInviteEmail(value) { sendNewUserInviteEmail = value; },
  get sendOverdueScheduleAlert() { return sendOverdueScheduleAlert; },
  set sendOverdueScheduleAlert(value) { sendOverdueScheduleAlert = value; },
  get sendTenantPortalDocument() { return sendTenantPortalDocument; },
  set sendTenantPortalDocument(value) { sendTenantPortalDocument = value; },
  get sendTodayMaintenanceReminder() { return sendTodayMaintenanceReminder; },
  set sendTodayMaintenanceReminder(value) { sendTodayMaintenanceReminder = value; },
  get simpleParser() { return simpleParser; },
  set simpleParser(value) { simpleParser = value; },
  get syncExpenseToQuickBooks() { return syncExpenseToQuickBooks; },
  set syncExpenseToQuickBooks(value) { syncExpenseToQuickBooks = value; },
  get syncLinkedMaintenanceRecordsFromEstimateItem() { return syncLinkedMaintenanceRecordsFromEstimateItem; },
  set syncLinkedMaintenanceRecordsFromEstimateItem(value) { syncLinkedMaintenanceRecordsFromEstimateItem = value; },
  get syncMaintenanceRequestFromEstimateItem() { return syncMaintenanceRequestFromEstimateItem; },
  set syncMaintenanceRequestFromEstimateItem(value) { syncMaintenanceRequestFromEstimateItem = value; },
  get syncMaintenanceRequestToEstimate() { return syncMaintenanceRequestToEstimate; },
  set syncMaintenanceRequestToEstimate(value) { syncMaintenanceRequestToEstimate = value; },
  get syncMaintenanceScheduleFromEstimateItem() { return syncMaintenanceScheduleFromEstimateItem; },
  set syncMaintenanceScheduleFromEstimateItem(value) { syncMaintenanceScheduleFromEstimateItem = value; },
  get syncMaintenanceScheduleToEstimate() { return syncMaintenanceScheduleToEstimate; },
  set syncMaintenanceScheduleToEstimate(value) { syncMaintenanceScheduleToEstimate = value; },
  get syncPaymentToQuickBooks() { return syncPaymentToQuickBooks; },
  set syncPaymentToQuickBooks(value) { syncPaymentToQuickBooks = value; },
  get syncVendorAssignedEstimateItem() { return syncVendorAssignedEstimateItem; },
  set syncVendorAssignedEstimateItem(value) { syncVendorAssignedEstimateItem = value; },
  get transporter() { return transporter; },
  set transporter(value) { transporter = value; },
  get updateNextScheduledDates() { return updateNextScheduledDates; },
  set updateNextScheduledDates(value) { updateNextScheduledDates = value; },
  get upload() { return upload; },
  set upload(value) { upload = value; },
  get verifyQbState() { return verifyQbState; },
  set verifyQbState(value) { verifyQbState = value; },
  get visionClient() { return visionClient; },
  set visionClient(value) { visionClient = value; },
  get w9Upload() { return w9Upload; },
  set w9Upload(value) { w9Upload = value; }
};


// ============================================================================
// [SECTION 02] FLOW MODULE LOADING
// ============================================================================
const serverFlows = {
  "email": require('./server/flows/email')(serverContext),
  "projects": require('./server/flows/projects')(serverContext),
  "shared": require('./server/flows/shared')(serverContext),
  "uploads": require('./server/flows/uploads')(serverContext),
  "vendors": require('./server/flows/vendors')(serverContext),
  "maintenance": require('./server/flows/maintenance')(serverContext),
  "announcements": require('./server/flows/announcements')(serverContext),
  "invoices": require('./server/flows/invoices')(serverContext),
  "documents": require('./server/flows/documents')(serverContext),
  "applications": require('./server/flows/applications')(serverContext),
  "clients": require('./server/flows/clients')(serverContext),
  "estimates": require('./server/flows/estimates')(serverContext),
  "auth": require('./server/flows/auth')(serverContext),
  "tasks": require('./server/flows/tasks')(serverContext),
  "catalog": require('./server/flows/catalog')(serverContext),
  "quotes": require('./server/flows/quotes')(serverContext),
  "labor-costs": require('./server/flows/labor-costs')(serverContext),
  "quality-control": require('./server/flows/quality-control')(serverContext),
  "maintenance-schedules": require('./server/flows/maintenance-schedules')(serverContext),
  "properties": require('./server/flows/properties')(serverContext),
  "units": require('./server/flows/units')(serverContext),
  "tenants": require('./server/flows/tenants')(serverContext),
  "payments": require('./server/flows/payments')(serverContext),
  "expenses": require('./server/flows/expenses')(serverContext),
  "maintenance-estimates": require('./server/flows/maintenance-estimates')(serverContext),
  "quickbooks": require('./server/flows/quickbooks')(serverContext),
  "tenant-portal": require('./server/flows/tenant-portal')(serverContext),
  "system": require('./server/flows/system')(serverContext),
  "calorie-tracker": require('./server/flows/calorie-tracker')(serverContext)
};


// ============================================================================
// [SECTION 03] SHARED HELPER BINDINGS
// ============================================================================

// Helpers | Email and notifications
let checkEmailInbox = serverFlows["email"].checkEmailInbox;

// Helpers | Projects, utilities and daily updates
let logDailyUpdate = serverFlows["projects"].logDailyUpdate;

// Helpers | Shared utilities
let logger = serverFlows["shared"].logger;

// Helpers | Maintenance requests
let deriveMaintenanceStatusFromStage = serverFlows["maintenance"].deriveMaintenanceStatusFromStage;
let normalizeMaintenanceWorkflowStage = serverFlows["maintenance"].normalizeMaintenanceWorkflowStage;
let appendMaintenanceSystemUpdate = serverFlows["maintenance"].appendMaintenanceSystemUpdate;
let parseMaintenanceDate = serverFlows["maintenance"].parseMaintenanceDate;
let parseMaintenanceCost = serverFlows["maintenance"].parseMaintenanceCost;
let formatMaintenanceCost = serverFlows["maintenance"].formatMaintenanceCost;
let formatMaintenanceTimelineDate = serverFlows["maintenance"].formatMaintenanceTimelineDate;

// Helpers | Property announcements
let parseAnnouncementCalendarDate = serverFlows["announcements"].parseAnnouncementCalendarDate;
let getStartOfToday = serverFlows["announcements"].getStartOfToday;

// Helpers | Shared utilities
let normalizeOptionalObjectId = serverFlows["shared"].normalizeOptionalObjectId;

// Helpers | Invoices and expense conversion
let normalizeInvoiceLineItems = serverFlows["invoices"].normalizeInvoiceLineItems;

// Helpers | Shared utilities
let invoiceLineItemsReadyForApproval = serverFlows["shared"].invoiceLineItemsReadyForApproval;

// Helpers | Invoices and expense conversion
let deriveInvoiceLineItemTotal = serverFlows["invoices"].deriveInvoiceLineItemTotal;
let deriveExpenseLineItemAmount = serverFlows["invoices"].deriveExpenseLineItemAmount;
let normalizeExpenseLineItems = serverFlows["invoices"].normalizeExpenseLineItems;
let buildExpenseLineItemFromInvoiceItem = serverFlows["invoices"].buildExpenseLineItemFromInvoiceItem;
let buildInvoiceLineItemFromExpenseItem = serverFlows["invoices"].buildInvoiceLineItemFromExpenseItem;
let deriveExpenseTotals = serverFlows["invoices"].deriveExpenseTotals;
let resolveInvoiceAttachmentPath = serverFlows["invoices"].resolveInvoiceAttachmentPath;
let mapInvoiceStatusToExpenseStatus = serverFlows["invoices"].mapInvoiceStatusToExpenseStatus;
let mapExpenseStatusToInvoiceStatus = serverFlows["invoices"].mapExpenseStatusToInvoiceStatus;
let resolveInvoiceVendorName = serverFlows["invoices"].resolveInvoiceVendorName;
let buildExpenseFromInvoice = serverFlows["invoices"].buildExpenseFromInvoice;
let buildInvoiceFromExpense = serverFlows["invoices"].buildInvoiceFromExpense;

// Helpers | Documents, folders and files
let formatProjectDocumentLabel = serverFlows["documents"].formatProjectDocumentLabel;
let buildAllPropertyDocumentsFolder = serverFlows["documents"].buildAllPropertyDocumentsFolder;

// Helpers | Invoices and expense conversion
let ensureExpenseReceiptIndexAllowsLineItems = serverFlows["invoices"].ensureExpenseReceiptIndexAllowsLineItems;

// Helpers | Maintenance requests
let maintenanceQCError = serverFlows["maintenance"].maintenanceQCError;

// Helpers | Authentication and manager accounts
let authenticateManagerProfile = serverFlows["auth"].authenticateManagerProfile;

// Helpers | Email and notifications
let sendExistingUserEmail = serverFlows["email"].sendExistingUserEmail;
let sendNewUserInviteEmail = serverFlows["email"].sendNewUserInviteEmail;
let getTaskAssignmentEmailHtml = serverFlows["email"].getTaskAssignmentEmailHtml;

// Helpers | Projects, utilities and daily updates
let parseAddress = serverFlows["projects"].parseAddress;
let applyDefaultAddressValues = serverFlows["projects"].applyDefaultAddressValues;

// Helpers | Labor costs
let normalizeCalcMode = serverFlows["labor-costs"].normalizeCalcMode;

// Helpers | Rent payments and monthly charges
let normalizePaymentTypeServer = serverFlows["payments"].normalizePaymentTypeServer;
let daysInMonth = serverFlows["payments"].daysInMonth;
let computeFirstMonthProratedBaseRent = serverFlows["payments"].computeFirstMonthProratedBaseRent;
let computeExpectedRentForMonth = serverFlows["payments"].computeExpectedRentForMonth;
let computeTenantPostedMonthlyRent = serverFlows["payments"].computeTenantPostedMonthlyRent;

// Helpers | Recurring maintenance and reminders
let getOverdueMaintenanceEmailHtml = serverFlows["maintenance-schedules"].getOverdueMaintenanceEmailHtml;
let sendTodayMaintenanceReminder = serverFlows["maintenance-schedules"].sendTodayMaintenanceReminder;
let ensureScheduleActivatedForDate = serverFlows["maintenance-schedules"].ensureScheduleActivatedForDate;
let sendOverdueScheduleAlert = serverFlows["maintenance-schedules"].sendOverdueScheduleAlert;

// Helpers | Maintenance / estimate synchronization
let getEstimateItemStatusFromMaintenanceStatus = serverFlows["maintenance-estimates"].getEstimateItemStatusFromMaintenanceStatus;
let getMaintenanceStatusFromEstimateItemStatus = serverFlows["maintenance-estimates"].getMaintenanceStatusFromEstimateItemStatus;
let calculateEstimateTotal = serverFlows["maintenance-estimates"].calculateEstimateTotal;

// Helpers | Recurring maintenance and reminders
let escapeRegexForMaintenanceLink = serverFlows["maintenance-schedules"].escapeRegexForMaintenanceLink;

// Helpers | Maintenance / estimate synchronization
let getRecurringMaintenanceEstimateTitle = serverFlows["maintenance-estimates"].getRecurringMaintenanceEstimateTitle;

// Helpers | Recurring maintenance and reminders
let getRecurringMaintenanceUnitLabel = serverFlows["maintenance-schedules"].getRecurringMaintenanceUnitLabel;
let getNextScheduledDateForCompletion = serverFlows["maintenance-schedules"].getNextScheduledDateForCompletion;

// Helpers | Maintenance / estimate synchronization
let ensureVendorProjectAssignment = serverFlows["maintenance-estimates"].ensureVendorProjectAssignment;
let syncVendorAssignedEstimateItem = serverFlows["maintenance-estimates"].syncVendorAssignedEstimateItem;
let syncMaintenanceScheduleFromEstimateItem = serverFlows["maintenance-estimates"].syncMaintenanceScheduleFromEstimateItem;
let syncLinkedMaintenanceRecordsFromEstimateItem = serverFlows["maintenance-estimates"].syncLinkedMaintenanceRecordsFromEstimateItem;
let syncMaintenanceRequestFromEstimateItem = serverFlows["maintenance-estimates"].syncMaintenanceRequestFromEstimateItem;
let syncMaintenanceScheduleToEstimate = serverFlows["maintenance-estimates"].syncMaintenanceScheduleToEstimate;
let syncMaintenanceRequestToEstimate = serverFlows["maintenance-estimates"].syncMaintenanceRequestToEstimate;

// Helpers | Recurring maintenance and reminders
let updateNextScheduledDates = serverFlows["maintenance-schedules"].updateNextScheduledDates;
let scheduleDailyUpdateNextScheduledDates = serverFlows["maintenance-schedules"].scheduleDailyUpdateNextScheduledDates;
let getMaintenanceEmailHtml = serverFlows["maintenance-schedules"].getMaintenanceEmailHtml;
let sendMaintenanceReminders = serverFlows["maintenance-schedules"].sendMaintenanceReminders;

// Helpers | QuickBooks connections and synchronization
let encryptQbSecret = serverFlows["quickbooks"].encryptQbSecret;
let decryptQbSecret = serverFlows["quickbooks"].decryptQbSecret;
let createQbState = serverFlows["quickbooks"].createQbState;
let verifyQbState = serverFlows["quickbooks"].verifyQbState;
let qbBaseUrl = serverFlows["quickbooks"].qbBaseUrl;
let refreshQbConnection = serverFlows["quickbooks"].refreshQbConnection;
let getQbConnection = serverFlows["quickbooks"].getQbConnection;
let qbRequest = serverFlows["quickbooks"].qbRequest;
let normalizeQbPaymentDate = serverFlows["quickbooks"].normalizeQbPaymentDate;
let buildQuickBooksPaymentRecord = serverFlows["quickbooks"].buildQuickBooksPaymentRecord;
let inferApplyToFromQuickBooksPaymentRecord = serverFlows["quickbooks"].inferApplyToFromQuickBooksPaymentRecord;
let inferMethodFromQuickBooksPaymentRecord = serverFlows["quickbooks"].inferMethodFromQuickBooksPaymentRecord;
let inferTypeFromQuickBooksPaymentRecord = serverFlows["quickbooks"].inferTypeFromQuickBooksPaymentRecord;
let inferPeriodMonthFromQuickBooksPaymentRecord = serverFlows["quickbooks"].inferPeriodMonthFromQuickBooksPaymentRecord;
let matchTenantForQuickBooksPaymentRecord = serverFlows["quickbooks"].matchTenantForQuickBooksPaymentRecord;
let buildQuickBooksImportNote = serverFlows["quickbooks"].buildQuickBooksImportNote;
let autoResolveQuickBooksPaymentsForProperty = serverFlows["quickbooks"].autoResolveQuickBooksPaymentsForProperty;
let buildUnifiedQuickBooksPaymentEntries = serverFlows["quickbooks"].buildUnifiedQuickBooksPaymentEntries;
let fetchQuickBooksPaymentRecords = serverFlows["quickbooks"].fetchQuickBooksPaymentRecords;
let matchQuickBooksRecordForLocalPayment = serverFlows["quickbooks"].matchQuickBooksRecordForLocalPayment;
let attachQuickBooksPaymentMatches = serverFlows["quickbooks"].attachQuickBooksPaymentMatches;
let ensureQbCustomer = serverFlows["quickbooks"].ensureQbCustomer;
let scheduleAutomaticQuickBooksPaymentSync = serverFlows["quickbooks"].scheduleAutomaticQuickBooksPaymentSync;
let syncPaymentToQuickBooks = serverFlows["quickbooks"].syncPaymentToQuickBooks;
let syncExpenseToQuickBooks = serverFlows["quickbooks"].syncExpenseToQuickBooks;
let resolveWorkspaceQbRecord = serverFlows["quickbooks"].resolveWorkspaceQbRecord;

// Helpers | Tenant portal
let authTenantPortal = serverFlows["tenant-portal"].authTenantPortal;
let normalizePhoneDigits = serverFlows["tenant-portal"].normalizePhoneDigits;
let normalizeAddressForTenantPortal = serverFlows["tenant-portal"].normalizeAddressForTenantPortal;
let buildTenantPortalPaymentLedger = serverFlows["tenant-portal"].buildTenantPortalPaymentLedger;
let buildTenantPortalPayload = serverFlows["tenant-portal"].buildTenantPortalPayload;
let sendTenantPortalDocument = serverFlows["tenant-portal"].sendTenantPortalDocument;

// Helpers | Calorie tracker
let authCalorie = serverFlows["calorie-tracker"].authCalorie;




// ============================================================================
// [SECTION 04] CONFIGURATION AND SERVICE CLIENTS
// ============================================================================


// Load environment variables from .env file
const express = require('express');
const path = require('path');
const fs = require('fs');
const vision = require("@google-cloud/vision");
require('dotenv').config();

// [SECTION] Production storage: existing mount, environment override, and fallback.
const { uploadDir, resolveStoredUploadPath, sanitizeHeaderFilename, encodeRFC5987Value, getContentDispositionHeader, sanitizeFilename } = require('./server/production-storage')({ fs, path, rootDir: __dirname, env: process.env });

const mongoose = require('mongoose');

const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const { zonedTimeToUtc, utcToZonedTime } = require('date-fns-tz');
// Set your business time zone
const BUSINESS_TZ = 'America/Chicago';
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5500;
const JWT_SECRET = process.env.JWT_SECRET;

const visionClient = new vision.ImageAnnotatorClient();

const Imap = require('imap');
const { simpleParser } = require('mailparser');

// QuickBooks config (use your real keys and companyId)
const QB_CLIENT_ID = process.env.QB_CLIENT_ID;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const QB_REDIRECT_URI = process.env.QB_REDIRECT_URI;
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || 'sandbox'; // or 'production'
// QuickBooks connections are stored per property. Legacy global company/token
// variables are intentionally not used because every property has separate books.

// Directory for saving attachments
const ATTACHMENTS_DIR = path.join(uploadDir, 'email-receipts');
if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

// Check every 60 minutes
// New inbox ingestion is opt-in; the supplied live server did not run this job.
if (process.env.ENABLE_EMAIL_RECEIPT_INGESTION === 'true') {
  setInterval(checkEmailInbox, 1 * 60 * 1000);
}


// ============================================================================
// [SECTION 05] MIDDLEWARE, STATIC FILES AND DATABASE
// ============================================================================


// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Serve static files
const buildPath = path.join(__dirname, "dist");
app.use(express.static(buildPath));
// Production keeps dist before public in the static lookup order.

// Debugging: Log the static directory being served
console.log("Serving static files from:", buildPath);

// ✅ Serve static files from "public" and "dist"
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "dist")));

console.log("📂 Serving static files from:", path.join(__dirname, "public"));
console.log("📂 Serving static files from:", path.join(__dirname, "dist"));

// [FLOW: production] Existing CORS and HTTPS redirect policies.
app.use(
  cors({
    origin: ["http://localhost:5500", "https://bluerain.onrender.com"],
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] !== "https" && process.env.NODE_ENV === "production") {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});
app.use(logger);

app.use('/uploads', express.static(uploadDir));


// ============================================================================
// [FLOW: projects] Projects, utilities and daily updates
// ============================================================================
// Implementation: server/flows/projects.js
serverFlows["projects"].get_details_projects_id();

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Please check your environment variables.");
  process.exit(1); // Exit the application if MONGO_URI is missing
}

const connectToDatabase = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,        // Avoid deprecation warning
      
    });
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error.message);
    process.exit(1); // Exit the application if the connection fails
  }
};

connectToDatabase();

// [FLOW: production] Upload diagnostics and health check.
const productionRoutes = require('./server/production-routes')(serverContext);
productionRoutes.registerUploadListing();
productionRoutes.registerHealthCheck();

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Save files to persistent disk
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// ✅ For email attachments (e.g., PDFs) — in-memory buffer
const memoryUpload = multer({ storage: multer.memoryStorage() });


// ============================================================================
// [FLOW: uploads] Uploads and OCR
// ============================================================================
// Implementation: server/flows/uploads.js
serverFlows["uploads"].post_api_ocr();
serverFlows["uploads"].post_api_upload_photos();


// ============================================================================
// [FLOW: vendors] Vendors and assignments
// ============================================================================
// Implementation: server/flows/vendors.js
serverFlows["vendors"].post_api_assign_vendor();


// ============================================================================
// [FLOW: uploads] Uploads and OCR (continued)
// ============================================================================
serverFlows["uploads"].delete_api_delete_photo_id();


// ============================================================================
// [SECTION 06] SCHEMAS AND MODEL REGISTRATION
// ============================================================================

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  quantity: { type: Number, required: false }, // Optional, for items assigned
  unitPrice: { type: Number, required: false }, // Optional, for items assigned
  total: { type: Number, required: false }, // Optional, for items assigned
  dueDate: { type: Date },
  completed: { type: Boolean, default: false },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, refPath: 'assignedToModel', default: null },
  assignedToModel: { type: String, enum: ['Vendor', 'Manager'], default: null }, // No longer required
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  photos: {
    before: [{ type: String }], // Array of strings for photo paths
    after: [{ type: String }],
  },
  comments: [
    {
      text: { type: String, required: true }, // The comment text
      createdAt: { type: Date, default: Date.now }, // Timestamp for the comment
    },
  ],
  category: { type: String, enum: ['new', 'in-progress', 'punch-list'], default: 'new' }, // Workflow categories
  status: { type: String, enum: ['new', 'in-progress', 'completed'], default: 'new' }, // Task workflow status
  createdAt: { type: Date, default: Date.now },
});

// Portfolio-level lightweight tasks for property management overview
const portfolioTaskSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['new', 'in-progress', 'completed'], default: 'new' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  category: { type: String, default: 'general' },
  relatedType: { type: String, default: '' },
  relatedId: { type: String, default: '' },
  assignedTo: { type: String, default: '' },
  dueDate: { type: Date },
  pinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

portfolioTaskSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const quickBooksConnectionSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true, index: true },
  realmId: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, default: '' },
  environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
  encryptedAccessToken: { type: String, required: true, select: false },
  encryptedRefreshToken: { type: String, required: true, select: false },
  accessTokenExpiresAt: Date,
  refreshTokenExpiresAt: Date,
  scopes: [{ type: String }],
  status: { type: String, enum: ['connected', 'attention', 'disconnected'], default: 'connected' },
  connectedBy: { type: String, default: '' },
  connectedAt: { type: Date, default: Date.now },
  lastSuccessfulSyncAt: Date,
  lastRefreshAt: Date,
  lastError: { type: String, default: '' },
  disconnectedAt: Date,
  mappings: {
    incomeItems: { type: mongoose.Schema.Types.Mixed, default: {} },
    depositAccounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    paymentMethods: { type: mongoose.Schema.Types.Mixed, default: {} },
    expenseAccounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultExpensePaymentAccount: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  settings: {
    paymentSyncMode: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
    expenseSyncMode: { type: String, enum: ['manual', 'automatic'], default: 'manual' }
  }
}, { timestamps: true });

const quickBooksSyncLogSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuickBooksConnection', required: true },
  localEntityType: { type: String, enum: ['Payment', 'Expense', 'Tenant', 'Vendor'], required: true },
  localEntityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  operation: { type: String, default: 'create' },
  quickBooksEntityType: { type: String, default: '' },
  quickBooksEntityId: { type: String, default: '' },
  externalKey: { type: String, required: true, index: true },
  requestHash: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'syncing', 'synced', 'failed', 'conflict'], default: 'queued' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  responseSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
  syncedAt: Date
}, { timestamps: true });
quickBooksSyncLogSchema.index({ connectionId: 1, externalKey: 1 }, { unique: true });

const commentSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Task' },
  text: { type: String, required: true },
  managerName: { type: String, required: true },
  timestamp: { type: Date, required: true },
});

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, required: true, trim: true },
});

const estimateSchema = new mongoose.Schema({ 
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  title: { type: String, default: '' },

  lineItems: [
    {
      type: {
        type: String,
        enum: ['category'],
        required: true
      },
      category: { type: String, required: true },
      sortOrder: { type: Number, default: 0 },

      // ✅ Expanded to support QC statuses
      status: { 
        type: String, 
        enum: ['in-progress', 'completed', 'approved', 'rework'], 
        default: 'in-progress' 
      },

      items: [
        {
          type: { type: String, enum: ['item'], default: 'item' },
          name: { type: String, required: true },
          sortOrder: { type: Number, default: 0 },
          description: { type: String },
          costCode: { type: String, default: 'Uncategorized' }, // ✅ Added Cost Code
          quantity: { type: Number, required: true, min: 1 },
          unitPrice: { type: Number, required: true },
          calcMode: { type: String, enum: ['each', 'sqft', 'lnft'], default: 'each' }, // <-- Add this line
              area: Number,    // <-- Add this line
              length: Number,  // <-- Add this line
          laborCost: { type: Number, default: 0 },
          materialCost: { type: Number, default: 0 },
           billed: { type: Number, default: 0 },
          total: { type: Number, required: true },

          // ✅ Expanded here too
          status: { 
            type: String, 
            enum: ['new', 'in-progress', 'completed', 'approved', 'rework'], 
            default: 'new' 
          },
          phase: {
            type: String,
            enum: ['pre-construction', 'permits', 'demo', 'structure', 'rough-in', 'inspections', 'finishes', 'exterior', 'punch'],
            default: 'pre-construction'
          },
          percentComplete: { type: Number, min: 0, max: 100, default: 0 },
maintenanceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceRequest', default: null },
maintenanceScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceSchedule', default: null },
          splitPercentage: { type: Number, min: 1, max: 100, default: null },
          splitGroupId: { type: String, default: null },
qualityControl: {
  status: { type: String, enum: ["pending", "approved", "rework"], default: "pending" },
  notes: { type: String },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
  reviewedAt: { type: Date },
  rework: {
    note: { type: String },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
    photos: [{ type: String }],
    requestedAt: { type: Date }
  }
},

          assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            default: null
          },

          photos: {
            before: [{ type: String }],
            after: [{ type: String }]
          },

          startDate: { type: Date, default: null },
          endDate: { type: Date, default: null }
        }
      ]
    }
  ],

  total: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Additional domain schemas
const vendorSchema = new mongoose.Schema({
  name: { type: String, required: false, trim: true },  // Name is now optional
  email: { type: String, required: false, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: false },  // Password is now optional

  // New basic profile fields
  title: { type: String, trim: true, default: "" },

  // Vendor documents (e.g., W9)
  documents: {
    w9Path: { type: String, default: "" },
    w9UploadedAt: { type: Date }
  },

  role: { type: String, enum: ["vendor", "project-manager"], default: "vendor" }, 

assignedItems: [
  {
    itemId: { type: String, required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    estimateId: { type: mongoose.Schema.Types.ObjectId, ref: "Estimate" },
    costCode: { type: String, default: "Uncategorized" },
    name: { type: String, required: true },
    description: { type: String, default: "No description provided" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    calcMode: { type: String, enum: ['each', 'sqft', 'lnft'], default: 'each' },
    area: { type: Number, default: 0 },
    length: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: { type: String, enum: ["new", "in-progress", "completed", "approved", "rework"], default: "new" },
    photos: {
      before: [{ type: String }],
      after: [{ type: String }],
    },
    qualityControl: {
      status: {
        type: String,
        enum: ["pending", "approved", "rework"],
        default: "pending"
      },
      notes: { type: String },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
      reviewedAt: { type: Date },
      rework: {
        note: { type: String },
        managerId: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
        photos: [{ type: String }],
        requestedAt: { type: Date }
      }
    },
    startDate: { type: Date, default: null },   // <-- ADD THIS
    endDate: { type: Date, default: null },     // <-- ADD THIS
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }
],

  assignedProjects: [
    {
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
      status: { type: String, enum: ["new", "in-progress", "completed", "rework"], default: "new" },
    }
  ],

  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },

  // New fields to track invitation status
  isInvited: { type: Boolean, default: false },  // Track if the vendor was invited
  isActive: { type: Boolean, default: false },   // Becomes true when vendor activates account
  status: { type: String, enum: ["active", "inactive"], default: "inactive" }, // Explicit lifecycle status
},
{ timestamps: true });

// ✅ Indexing for Faster Queries
vendorSchema.index({ "assignedItems.itemId": 1 });
vendorSchema.index({ "assignedItems.projectId": 1 });
// Unique sparse index on email allows multiple docs without email, enforces uniqueness when present
vendorSchema.index({ email: 1 }, { unique: true, sparse: true });

// Hash the password before saving the vendor
vendorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // Prevent rehashing if the password is already hashed
  if (this.password.startsWith('$2b$')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Project schema
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: String, required: true },
  color: { type: String, default: 'blue' },
  type: { type: String, required: true },
  code: { type: String, required: true },
  address: {
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String },
  },
  description: { type: String },
  // Rental-property information used by the property-management workspace.
  // Mixed keeps this backward compatible for existing construction projects.
  propertyProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
  buildingEquipment: { type: [mongoose.Schema.Types.Mixed], default: [] },
  utilityAccounts: { // <-- Add this block
    water: {
      accountNumber: { type: String, default: "" },
      provider: { type: String, default: "" },
      status: { type: String, default: "unknown" } // "active", "on", "off", "disconnected"
      
    },
    gas: {
      accountNumber: { type: String, default: "" },
      provider: { type: String, default: "" },
      status: { type: String, default: "unknown" }
      
    },
    electricity: {
      accountNumber: { type: String, default: "" },
      provider: { type: String, default: "" },
      status: { type: String, default: "unknown" }
      
    }
  },
  estimates: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Estimate",
    },
  ],
  files: [{
    filename: String,
    path: String,
    mimetype: String,
  }],
});

// Invitation Schema and Model
const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role: { type: String, required: true, enum: ["vendor", "project-manager"] },
  projectId: { type: mongoose.Schema.Types.ObjectId, required: false, ref: "Project" },
  token: { type: String, required: true },
  invitedAt: { type: Date, default: Date.now },
  status: { type: String, default: "pending", enum: ["pending", "accepted", "declined"] }, // Tracks invitation state
  expiresAt: { type: Date, default: () => Date.now() + 3600000 }, // Token expires in 1 hour
  acceptedAt: { type: Date }, // Tracks when the invitation was accepted
  declinedAt: { type: Date }, // Tracks when the invitation was declined
  deleted: { type: Boolean, default: false }, // For soft deletion
});

// Project Manager Schema and Model
const managerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date }
}, { timestamps: true });

// Hash password before saving
managerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // Prevent rehashing if the password is already hashed
  if (this.password.startsWith('$2b$')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const selectionBoardSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  room: { type: String, required: true },
  selections: [
    {
      name: { type: String, required: true },
      description: { type: String, required: true },
      price: { type: Number, required: true },
      link: { type: String, required: true },
      photo: { type: String }  // Optionally store product photo.
    }
  ]
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  link: { type: String, required: true },
  photo: { type: String }  // Stores the extracted photo URL.
}, { timestamps: true });

// ✅ Ensure DailyUpdate model is defined
const DailyUpdateSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  projectName: { type: String, required: true },
  author: { type: String, required: true },
  text: { type: String, required: true },
  images: [{ type: String }],
  timestamp: { type: Date, default: Date.now }
});

//invoice schema
const invoiceSchema = new mongoose.Schema({
  projectId: String,
  vendorId: String,
  attachmentPath: { type: String, default: '' },
  tax: { type: Number, default: 0 },
  email: String,
  header: {
    companyName: String,
    street: String,
    city: String,
    phoneFax: String
  },
  recipient: {
    name: String,
    company: String,
    street: String,
    city: String,
    phone: String
  },
  invoiceNumber: String,
  date: String,
  lineItems: [
    {
      projectId: String,
        projectName: String,
        projectAddress: String,
      name: String,
      description: String,
      quantity: Number,
      unitPrice: Number,
      costCode: String,
      total: { type: Number, required: true },
      // 👇 Add these fields for tracking
      estimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate' },
      itemId: { type: mongoose.Schema.Types.ObjectId } // or String if you use string IDs
    }
  ],
  total: Number,
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Approved', 'Rejected', 'Paid', 'Overdue'],
    default: 'Draft'
  },
  createdAt: { type: Date, default: Date.now }
});

const quoteSchema = new mongoose.Schema({
  from: {
    name: String,
    address: String,
    email: String,
    phone: String,
    license: { type: String, default: "RBC-2400049" } // ✅ Added license field
  },
  to: {
    name: String,
    address: String,
    email: String,
    phone: String
  },
  // Optional client signature captured from public signing link
  signature: {
    name: String,                    // Client name as signed
    type: { type: String, enum: ['typed', 'drawn', ''], default: '' },
    imageData: String,               // Data URL for drawn signatures
    signedAt: Date                   // When the client signed
  },
  quoteNumber: String,
  date: Date,
  validTill: Date,
  notes: String,
  lineItems: [{
    costCode: String, // ✅ Added costCode field
    name: String,
    description: String,
    rate: Number,
    qty: Number,
    // Markup percentage applied to (labor + material) when computing rate on the client
    markup: { type: Number, default: 0 },
    laborRate: Number,
    laborHours: Number,
    laborCost: Number,
    materialRate: Number,
    materialQty: Number,
    materialCost: Number
  }],
  totals: {
    subtotal: Number,
    discount: Number,
    tax: Number,
    total: Number
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Approved'],
    default: 'Draft'
  },
  // ✅ Store editable payment term percentages for milestones (frontend uses 4 by default)
  paymentTerms: {
    percentages: { type: [Number], default: [30, 30, 30, 10] }
  },
   payments: [
    {
      label: String,
      amount: Number,
      status: { type: String, enum: ["Pending", "Paid", "Overdue"], default: "Pending" },
      date: String
    }
  ],
  // 👇 ADD THIS:
  paymentSchedules: [
    {
      name: String,
      description: String,
      payments: [
        {
          label: String,
          amount: Number,
          status: { type: String, enum: ["Pending", "Paid", "Overdue"], default: "Pending" },
          date: String
        }
      ]
    }
  ]
}, { timestamps: true });

// Labor and Material Cost Schema

const laborCostSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  costCode: { type: String, default: "Uncategorized" },

  // 💰 Labor details
  laborRate: { type: Number, default: 0 }, // Rate per hour or per unit
  laborHours: { type: Number, default: 0 },    // Hours worked or units
  laborCost: {
    type: Number,
    default: function () {
      return this.laborRate * this.laborHours;
    }
  },

  // 🧱 Material details
  materialRate: { type: Number, default: 0 },
  materialQty: { type: Number, default: 0 },
  materialCost: {
    type: Number,
    default: function () {
      return this.materialRate * this.materialQty;
    }
  },

  // Manual base rate (used when no labor/material breakdown is provided)
  baseRate: { type: Number, default: 0 },

  // Markup value and mode
  // markup represents either a percent (e.g., 10 => 10%) or a flat amount (e.g., 25 => $25)
  markup: { type: Number, default: 0 },
  markupMode: { type: String, enum: ['percent', 'amount'], default: 'percent' },

  // 🧾 Combined total (with markup)
  totalCost: {
    type: Number,
    default: function () {
      // This default is superseded by the pre-save hook below. Kept for completeness.
      const lh = this.laborHours || 0;
      const mq = this.materialQty || 0;
      const subtotal = (this.laborRate * lh) + (this.materialRate * mq) || this.baseRate || 0;
      if (this.markupMode === 'amount') {
        return subtotal + (this.markup || 0);
      }
      return subtotal * (1 + (this.markup || 0) / 100);
    }
  },

  // 🧩 Metadata
  calcMode: { type: String, enum: ['each', 'sqft', 'lnft', 'hour'], default: 'each' },
  unit: { type: String, default: '' },
}, { timestamps: true });

// ✅ Keep totalCost always up to date before saving (with markup)
laborCostSchema.pre('save', function (next) {
  // Determine if we have a breakdown (labor/material) or a manual base rate
  const hasLabor = typeof this.laborRate === 'number' && this.laborRate !== 0;
  const hasMaterial = typeof this.materialRate === 'number' && this.materialRate !== 0;

  // Default laborHours/materialQty to 1 if a corresponding rate is provided but qty is falsy
  const lh = hasLabor ? (this.laborHours ?? 1) : (this.laborHours || 0);
  const mq = hasMaterial ? (this.materialQty ?? 1) : (this.materialQty || 0);

  if (hasLabor || hasMaterial) {
    this.laborCost = (this.laborRate || 0) * lh;
    this.materialCost = (this.materialRate || 0) * mq;
  } else {
    // Manual base rate path: attribute base to laborCost for reporting simplicity
    const base = this.baseRate || 0;
    this.laborCost = base;
    this.materialCost = 0;
  }

  const baseSubtotal = this.laborCost + this.materialCost;
  if (this.markupMode === 'amount') {
    this.totalCost = baseSubtotal + (this.markup || 0);
  } else {
    this.totalCost = baseSubtotal * (1 + (this.markup || 0) / 100);
  }
  next();
});

const TodoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
}, { timestamps: true });

const fileSchema = new mongoose.Schema({
  name: String,
  size: String,
  type: String,
  modified: String,
  url: String
});

const folderSchema = new mongoose.Schema({
  name: String,
  position: Number,
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  files: [fileSchema]
});

const expenseSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: false }, // can be missing for OCR
  item: {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: false }, // can be string "unknown" for OCR
    estimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', required: false },
    name: String,
    costCode: String
  },
  lineItems: [{
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: false },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: false },
    estimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', required: false },
    name: String,
    costCode: String,
    description: String,
    amount: Number
  }],
  salesTax: { type: Number, default: 0 },
  vendor: String,
  category: String,
  description: String,
  amount: { type: Number, required: false },
  receiptTotal: { type: Number, required: false },
  date: { type: String, required: false },
  ref: { type: String },
  invoiceNumber: { type: String, default: "" },
  duplicateWarning: { type: Boolean, default: false },
  duplicateCandidates: [{
    expenseId: String,
    vendor: String,
    date: String,
    amount: Number,
    ref: String,
    reason: String
  }],
  status: {
    type: String,
    enum: ['missing info', 'pending_review', 'archived', 'submitted', 'approved', 'rejected'],
    default: 'missing info'
  },
  receiptPath: { type: String, default: "" }, // Path to uploaded/scanned receipt image or PDF
  receiptType: { type: String, default: "" }, // Optional: 'pdf', 'image', etc.
  receiptName: { type: String, default: "" }, // Optional: original filename
  linkedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate.lineItems.items', required: false },
  jobName: String,
  source: { type: String, default: "" }, // e.g. 'manual', 'imap'
  receiptHash: { type: String, default: "" }, // For deduplication of OCR/email receipts
  quickBooks: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index receipt captures for lookup; receipt details now live in Expense.lineItems.
expenseSchema.index({ receiptPath: 1, source: 1 });

// Add these new schemas to your existing schemas section
const propertySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, default: 'Multifamily' },
  address: {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true }
  },
  units: [{
    number: { type: String, required: true },
    floor: { type: Number },
    bedrooms: { type: Number, required: true },
    bathrooms: { type: Number, required: true },
    sqft: { type: Number },
    status: { 
      type: String, 
      enum: ['vacant', 'occupied', 'maintenance'],
      default: 'vacant'
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant'
    },
    lease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lease'
    }
  }]
}, { timestamps: true });

const utilityAccountSchema = new mongoose.Schema({
    accountNumber: String,
    provider: String,
    status: String,
    under: { type: String, enum: ['tenant', 'landlord', ''], default: '' } // who is under the bill
}, { _id: false });

const utilityBillSchema = new mongoose.Schema({
    type: { type: String, enum: ['water', 'gas', 'electricity'], required: true },
    amount: { type: Number, default: 0 },
    dueDate: Date,
    paid: { type: Boolean, default: false },
    paidBy: { type: String, enum: ['tenant', 'landlord', ''], default: '' }
}, { _id: false });

const equipmentSchema = new mongoose.Schema({
    category: { type: String, default: '' },
    name: { type: String, default: '' },
    brand: { type: String, default: '' },
    model: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    powerType: { type: String, default: '' },
    capacity: { type: String, default: '' },
    location: { type: String, default: '' },
    installedDate: Date,
    manufacturedYear: Number,
    condition: { type: String, enum: ['', 'excellent', 'good', 'fair', 'poor', 'replace'], default: '' },
    warrantyExpires: Date,
    lastServiceDate: Date,
    nextServiceDate: Date,
    expectedReplacementDate: Date,
    estimatedReplacementCost: { type: Number, default: 0 },
    serviceProvider: { type: String, default: '' },
    notes: { type: String, default: '' }
}, { timestamps: true });

const unitSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    number: { type: String, required: true },
    floor: { type: Number, default: 1 },
    bedrooms: { type: Number, default: 1 },
    bathrooms: { type: Number, default: 1 },
    sqft: { type: Number },
  // Market rent for this unit (used especially when vacant)
  rent: { type: Number, default: 0 },
    status: { type: String, enum: ['vacant', 'occupied', 'maintenance'], default: 'vacant' },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },

    // Utility accounts for each type
    utilityAccounts: {
        water: { type: utilityAccountSchema, default: {} },
        gas: { type: utilityAccountSchema, default: {} },
        electricity: { type: utilityAccountSchema, default: {} }
    },

    // Utility bills history
    utilityBills: { type: [utilityBillSchema], default: [] },

    // Amenities/features checklist
    amenities: [{ type: String }],

    profile: { type: mongoose.Schema.Types.Mixed, default: {} },
    equipment: { type: [equipmentSchema], default: [] },
    conditionDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    turnover: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Add any other fields as needed
}, { timestamps: true });

const tenantSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  parking: { type: String, default: '' },
  accessCode: { type: String, default: '' },
  emergencyContact: {
    name: String,
    phone: String,
    email: String,
    relation: String,
    address: String
},
authorizedOccupants: [String],
  quickBooks: { type: mongoose.Schema.Types.Mixed, default: {} },
  pets: {
    hasPets: { type: Boolean, default: false },
    count: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },
    nonRefundableFee: { type: Number, default: 0 },      // Non-refundable pet fee
    monthlyRent: { type: Number, default: 0 },           // Monthly pet rent
    depositIncrease: { type: Number, default: 0 },       // Increased security deposit
    details: [{
      type: { type: String },        // e.g. dog, cat, etc.
      name: String,
      breed: String,
      weight: String,
      age: String,
      gender: { type: String, enum: ['male', 'female', ''] },
      vaccination: String
    }]
  },
  cars: {
    hasCar: { type: Boolean, default: false },
    count: { type: Number, default: 0 },
    details: [{
      make: String,
      model: String,
      color: String,
      licensePlate: String,
      year: String
    }]
  },
leaseRenewal: { type: String, enum: ['renew', 'terminate'], default: 'renew' },
  leaseStart: Date,
  leaseEnd: Date,
  baseRent: { type: Number, default: 0 },
  deposit: { type: Number, default: 0 },
  // Track how much of the security deposit has been paid
  depositPaid: { type: Number, default: 0 },
  waterFee: { type: Number, default: 0 },      // <-- Add this line
  trashFee: { type: Number, default: 0 },      // <-- Add this line
  adminFee: { type: Number, default: 0 }, 
  additionalFee: {
    type: {
      type: String, // e.g. 'parking', 'storage', 'other'
      default: ''
    },
    label: { type: String, default: '' }, // Custom label if "Other"
    amount: { type: Number, default: 0 }
  },
leaseType: { type: String, enum: ['fmr', 'section8'], default: 'fmr' },
fmrNotes: String,
hubContribution: { type: Number, default: 0 },
tenantContribution: { type: Number, default: 0 },
leaseStatus: { type: String, enum: ['active', 'pending', 'expired', 'terminated'], default: 'active' },
termination: {
  effectiveDate: Date,
  reason: String,
  finalRent: Number,
  possessionReturned: Boolean,
  returnedAt: Date,
  unitDisposition: { type: String, enum: ['vacant', 'maintenance', null] },
  reviewedAt: Date
},
leaseHolders: {
  type: [{ name: String, phone: String, email: String }],
  default: []
},
// Chat-style internal notes timeline for tenants
notesHistory: [
  {
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }
],
  // Move-in readiness checklist (per-tenant)
  moveInChecklistCompleted: {
    type: [String],
    default: []
  },
  moveInChecklistNotes: {
    type: Map,
    of: String,
    default: {}
  },
// Per-month manual overrides for expected rent and late fee. Keyed by 'YYYY-MM'.
monthlyOverrides: {
  type: Map,
  of: new mongoose.Schema({
    expectedRent: { type: Number, default: null },
    lateFee: { type: Number, default: null },
    lateFeeMode: { type: String, enum: ['amount','percent'], default: 'amount' }
  }, { _id: false }),
  default: {}
}

}, { timestamps: true });

const MAINTENANCE_WORKFLOW_STAGES = [
  'new',
  'scheduled',
  'waiting',
  'in-progress',
  'completed',
  'closed'
];

const maintenanceRequestSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  assignedTo: String,
  workflowStage: {
    type: String,
    enum: MAINTENANCE_WORKFLOW_STAGES,
    default: 'submitted'
  },
  assignedVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  linkedEstimateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Estimate',
    default: null
  },
  linkedEstimateItemId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  cost: { type: Number, default: null },
  scheduledFor: { type: Date, default: null },
  accessNotes: { type: String, default: '' },
  completedAt: Date,
  // New: photo file paths relative to /uploads
  photos: [{ type: String }],
  afterPhotos: [{ type: String }],
  updates: [{
    authorRole: { type: String, enum: ['tenant', 'manager', 'vendor', 'system'], default: 'system' },
    authorName: { type: String, default: '' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const documentSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
  },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['lease', 'notice', 'invoice', 'other'],
    required: true
  },
  filePath: { type: String, required: true },
  uploadedBy: String
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' }, // <-- Add this line
  type: { type: String, enum: ['rent', 'hub', 'partial', 'adjustment', 'custom'], required: true },
  customType: { type: String, default: '' }, // when type === 'custom'
  // What the payment is applied to: rent (monthly), deposit (security), or fee (one-off)
  applyTo: { type: String, enum: ['rent', 'deposit', 'fee', 'late', 'water', 'electric', 'trash', 'admin', 'other'], default: 'rent' },
  // For fee payments: categorize the fee and optionally provide a label
  feeType: { type: String, default: '' },
  feeLabel: { type: String, default: '' },
  // Optional period identifier (e.g., '2025-11' or a Date) when the payment applies to a specific month
  periodMonth: { type: String, default: '' },
  // Optional free-form note (e.g., credit reason, memo)
  note: { type: String, default: '' },
  // Credit carry forward: if true and balance < 0, mark credit to auto-apply next month
  carryForward: { type: Boolean, default: false },
  // How much prior credit was applied to this month
  appliedCredit: { type: Number, default: 0 },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'check', 'bank', 'online'], required: true },
  date: { type: Date, required: true },
  lateFee: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  source: { type: String, enum: ['local', 'quickbooks'], default: 'local', index: true },
  postingStatus: { type: String, enum: ['posted', 'pending', 'conflict'], default: 'posted', index: true },
  quickBooks: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });
paymentSchema.index({ projectId: 1, 'quickBooks.entityType': 1, 'quickBooks.entityId': 1 }, { unique: true, partialFilterExpression: { 'quickBooks.entityId': { $type: 'string' } } });

const roomPackageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g., 'kitchen'
  name: { type: String, required: true },
  items: [
    {
      costCode: String,
      name: String,
      description: String,
      rate: Number,
      qty: Number
    }
  ]
}, { timestamps: true });

const maintenanceScheduleSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true },
  description: String,
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'], required: true },
  intervalDays: { type: Number, default: null }, // for custom
  startDate: { type: Date, required: true },
  nextScheduledDate: { type: Date, required: true },
  assignedVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  linkedEstimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', default: null },
  linkedEstimateItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  completedAt: { type: Date, default: null },
  cost: { type: Number, default: 0 },
  // --- Add history array ---
  history: [{
    completedAt: Date,
    completedBy: String, 
    notes: String,
    cost: { type: Number, default: 0 },
    scheduledFor: Date,
    submittedAt: Date,
    estimateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', default: null },
    estimateItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    photos: { before: [String], after: [String] },
    qcStatus: { type: String, enum: ['legacy', 'awaiting-qc', 'approved', 'rework'], default: 'legacy' },
    reworkPhotos: [String],
    reviews: [{
      status: { type: String, enum: ['submitted', 'approved', 'rework', 'resubmitted'] },
      notes: String, reviewedAt: Date,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager' },
      reviewerName: String,
      photos: { before: [String], after: [String] }
    }]
  }],
  createdAt: { type: Date, default: Date.now }
}, { optimisticConcurrency: true });

const announcementSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  category: { type: String, enum: ['notice', 'inspection', 'utility', 'parking', 'general'], default: 'general' },
  targetTenantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }],
  pinned: { type: Boolean, default: false },
  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdBy: { type: String, default: 'Management' }
}, { timestamps: true });

const applicationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  email: { type: String, required: true },
  unit: String,
  moveIn: Date,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  // Raw application payload or structured info (existing usage)
  notes: String,
  // Chat-style internal notes timeline
  notesHistory: [
    {
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  submitted: { type: Date, default: Date.now }
});

const Task = mongoose.model('Task', taskSchema);
const PortfolioTask = mongoose.model('PortfolioTask', portfolioTaskSchema);
const QuickBooksConnection = mongoose.model('QuickBooksConnection', quickBooksConnectionSchema);
const QuickBooksSyncLog = mongoose.model('QuickBooksSyncLog', quickBooksSyncLogSchema);
const Comment = mongoose.model("Comment", commentSchema);
const Client = mongoose.model('Client', clientSchema);
const Estimate = mongoose.model("Estimate", estimateSchema);
const Vendor = mongoose.model('Vendor', vendorSchema);
const Project = mongoose.model('Project', projectSchema);
const Manager = mongoose.model('Manager', managerSchema);
const Invitation = mongoose.model("Invitation", invitationSchema);
const SelectionBoard = mongoose.model('SelectionBoard', selectionBoardSchema);
const Product = mongoose.model('Product', productSchema);
const DailyUpdate = mongoose.model("DailyUpdate", DailyUpdateSchema);
const Invoice = mongoose.model('Invoice', invoiceSchema);

const Quote = mongoose.model('Quote', quoteSchema);
const LaborCost = mongoose.model('LaborCost', laborCostSchema);
const Todo = mongoose.model('Todo', TodoSchema);
const FileSystem = mongoose.model('FileSystem', folderSchema);
const Folder = mongoose.model('Folder', folderSchema); // ✅ Add this line

const SYSTEM_FOLDER_IDS = Object.freeze({
  allPropertyDocuments: 'system-all-property-documents'
});

const Expense = mongoose.model('Expense', expenseSchema);

if (mongoose.connection.readyState === 1) {
  ensureExpenseReceiptIndexAllowsLineItems();
} else {
  mongoose.connection.once('open', ensureExpenseReceiptIndexAllowsLineItems);
}
const Property = mongoose.model('Property', propertySchema);
const Unit = mongoose.model('Unit', unitSchema);
const Tenant = mongoose.model('Tenant', tenantSchema);
const MaintenanceRequest = mongoose.model('MaintenanceRequest', maintenanceRequestSchema);
const Document = mongoose.model('Document', documentSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const RoomPackage = mongoose.model('RoomPackage', roomPackageSchema);
const MaintenanceSchedule = mongoose.model('MaintenanceSchedule', maintenanceScheduleSchema);
const maintenanceQC = require('./maintenance-qc')({ MaintenanceSchedule, Estimate, Manager, jwt,
  secret: JWT_SECRET, nextDate: getNextScheduledDateForCompletion, syncVendor: syncVendorAssignedEstimateItem,
  syncVendorQC: async (estimate, item, qualityControl) => {
    await Vendor.updateMany({ 'assignedItems.itemId': item._id, 'assignedItems.projectId': estimate.projectId }, {
      $set: { 'assignedItems.$[qcItem].qualityControl': qualityControl }
    }, { arrayFilters: [{ 'qcItem.itemId': item._id, 'qcItem.projectId': estimate.projectId }], runValidators: true });
  } });

const Announcement = mongoose.model('Announcement', announcementSchema);
const Application = mongoose.model('Application', applicationSchema);
const ApplicationInvite = mongoose.model('ApplicationInvite', new mongoose.Schema({
  name: { type: String, default: 'Applicant' },
  email: { type: String, required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  propertyName: { type: String },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  unitNumber: { type: String },
  context: { type: String },
  applicationUrl: { type: String },
  sentAt: { type: Date, default: Date.now },
  openedAt: { type: Date },
  openCount: { type: Number, default: 0 },
  status: { type: String, enum: ['sent','opened','delivered','bounced'], default: 'sent' },
  // Chat-style internal notes timeline for invites
  notesHistory: [
   {
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    } 
  ]
}));

// ── Calorie Tracker User ──
const calorieUserSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name:     { type: String, trim: true, default: '' },
  calorieGoal: { type: Number, default: 2000 },
  proteinGoal: { type: Number, default: 150 },
  carbGoal: { type: Number, default: 200 },
  fatGoal: { type: Number, default: 65 },
  quickFoods:  { type: [String], default: [
    "chicken breast","rice","egg","banana","protein shake",
    "oatmeal","salmon","greek yogurt","avocado","almonds",
    "sweet potato","pasta","apple","peanut butter","broccoli"
  ]},
  savedMeals: { type: [mongoose.Schema.Types.Mixed], default: [] },
  planData: { type: mongoose.Schema.Types.Mixed, default: null },
  trackerData: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

calorieUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const CalorieUser = mongoose.model('CalorieUser', calorieUserSchema);

module.exports = {
  Task,
  Comment,
  Client,
  Estimate,
  Vendor,
  Project,
  Manager,
  Invitation,
  Quote,
  Unit,
  CalorieUser,
};



// ============================================================================
// [SECTION 07] API ROUTES AND FLOW-SPECIFIC SETUP
// ============================================================================
// ============================================================================
// [FLOW: applications] Rental applications and invitations
// ============================================================================
// Implementation: server/flows/applications.js
serverFlows["applications"].get_applications_new();

serverFlows["applications"].get_applications_review_id();

serverFlows["applications"].post_api_rental_applications();

serverFlows["applications"].post_api_rental_applications_send_link();

serverFlows["applications"].get_api_rental_applications();

serverFlows["applications"].get_api_application_invites();

serverFlows["applications"].put_api_application_invites_id();

serverFlows["applications"].delete_api_application_invites_id();

serverFlows["applications"].post_api_application_invites_id_notes();

serverFlows["applications"].delete_api_application_invites_id_notes_noteId();

serverFlows["applications"].get_api_rental_applications_id();

serverFlows["applications"].put_api_rental_applications_id();

serverFlows["applications"].post_api_rental_applications_id_notes();

serverFlows["applications"].delete_api_rental_applications_id_notes_noteId();

serverFlows["applications"].delete_api_rental_applications_id();


// ============================================================================
// [FLOW: clients] Clients
// ============================================================================
// Implementation: server/flows/clients.js
serverFlows["clients"].post_api_add_client();

serverFlows["clients"].get_api_clients();

serverFlows["clients"].put_api_clients_id();

serverFlows["clients"].delete_api_clients_id();


// ============================================================================
// [FLOW: estimates] Estimates and line items
// ============================================================================
// Implementation: server/flows/estimates.js
serverFlows["estimates"].post_api_estimates();

serverFlows["estimates"].get_api_estimates_id();

serverFlows["estimates"].get_api_estimates();

serverFlows["estimates"].delete_api_estimates_id();

serverFlows["estimates"].put_api_estimates_id();

serverFlows["estimates"].patch_api_estimates_id_update_photo();

serverFlows["estimates"].get_estimate_view_html();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].post_api_add_vendor();

serverFlows["vendors"].get_api_vendors();

serverFlows["vendors"].get_api_vendors_id();

serverFlows["vendors"].delete_api_vendors_id();


// ============================================================================
// [FLOW: auth] Authentication and manager accounts
// ============================================================================
// Implementation: server/flows/auth.js
serverFlows["auth"].get_api_managers();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].put_api_vendors_id();

// Upload W9 for a vendor
// Ensure the uploads/vendors/w9 directory exists
const w9Dir = path.join(uploadDir, 'vendors', 'w9');
if (!fs.existsSync(w9Dir)) {
  fs.mkdirSync(w9Dir, { recursive: true });
}

const w9Storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, w9Dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitized = sanitizeFilename(file.originalname);
    const safeName = sanitized || 'document.pdf';
    cb(null, `${uniqueSuffix}-${safeName}`);
  }
});
const w9Upload = multer({ storage: w9Storage });

serverFlows["vendors"].post_api_vendors_id_upload_w9();

serverFlows["vendors"].delete_api_vendors_id_w9();


// ============================================================================
// [FLOW: auth] Authentication and manager accounts (continued)
// ============================================================================
serverFlows["auth"].get_api_manager_profile();
serverFlows["auth"].put_api_manager_profile();

serverFlows["auth"].put_api_manager_password();

serverFlows["auth"].get_api_managers_id();


// ============================================================================
// [FLOW: projects] Projects, utilities and daily updates (continued)
// ============================================================================
serverFlows["projects"].post_api_add_project();

serverFlows["projects"].get_api_projects();

serverFlows["projects"].put_api_projects_id();

serverFlows["projects"].get_details_projects_id_2();

serverFlows["projects"].get_api_details_projects_id();

serverFlows["projects"].delete_api_projects_projectId();


// ============================================================================
// [FLOW: tasks] Tasks, to-dos and comments
// ============================================================================
// Implementation: server/flows/tasks.js
serverFlows["tasks"].get_api_tasks();

serverFlows["tasks"].get_api_task_id();

serverFlows["tasks"].put_api_task_id_assign();

serverFlows["tasks"].get_api_portfolio_tasks();

serverFlows["tasks"].post_api_portfolio_tasks();

serverFlows["tasks"].put_api_portfolio_tasks_id();

serverFlows["tasks"].delete_api_portfolio_tasks_id();

serverFlows["tasks"].post_api_tasks();

serverFlows["tasks"].put_api_task_id();

serverFlows["tasks"].delete_api_task_id();

serverFlows["tasks"].get_api_comments();

serverFlows["tasks"].post_api_comments();


// ============================================================================
// [FLOW: auth] Authentication and manager accounts (continued)
// ============================================================================
serverFlows["auth"].post_api_signup();

serverFlows["auth"].post_api_signin();

serverFlows["auth"].post_api_password_reset_request();

serverFlows["auth"].post_api_password_reset();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].get_api_vendors_vendorId_debug_items();

serverFlows["vendors"].put_api_vendors_vendorId_update_item_status();

serverFlows["vendors"].put_api_vendor_start_project();

serverFlows["vendors"].get_api_subcontractor_tasks();

serverFlows["vendors"].get_api_vendors_vendorId_assigned_projects();

serverFlows["vendors"].get_api_subcontractor_projects();

serverFlows["vendors"].put_api_vendor_update_project_status();

serverFlows["vendors"].post_api_vendors_vendorId_assign_item();

serverFlows["vendors"].patch_api_vendors_vendorId_assigned_items_update();

serverFlows["vendors"].post_api_assign_items();

serverFlows["vendors"].delete_api_delete_photo_vendorId_itemId_photoUrl();


// ============================================================================
// [FLOW: uploads] Uploads and OCR (continued)
// ============================================================================
serverFlows["uploads"].get_api_photos_itemId();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].get_api_vendors_vendorId_assigned_items_projectId();

serverFlows["vendors"].patch_api_clear_vendor_assignment_itemId();


// ============================================================================
// [FLOW: documents] Documents, folders and files
// ============================================================================
// Implementation: server/flows/documents.js
serverFlows["documents"].post_api_projects_projectId_files();

serverFlows["documents"].get_api_projects_projectId_files();

serverFlows["documents"].delete_api_projects_projectId_files_fileId();


// ============================================================================
// [FLOW: auth] Authentication and manager accounts (continued)
// ============================================================================
serverFlows["auth"].post_api_manager_signup();

serverFlows["auth"].post_api_manager_signin();

serverFlows["auth"].post_api_manager_reset_password();

// 📌 Configure Email Transporter
// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Helps with SSL issues
  },
});

serverFlows["auth"].post_api_invite();

serverFlows["auth"].get_sign_inpage_html();

serverFlows["auth"].post_api_invite_accept();


// ============================================================================
// [FLOW: email] Email and notifications
// ============================================================================
// Implementation: server/flows/email.js
serverFlows["email"].post_api_send_email();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].get_api_projects_projectId_vendors();

serverFlows["vendors"].delete_api_projects_projectId_vendors_vendorId();


// ============================================================================
// [FLOW: projects] Projects, utilities and daily updates (continued)
// ============================================================================
serverFlows["projects"].get_api_projects_current();


// ============================================================================
// [FLOW: estimates] Estimates and line items (continued)
// ============================================================================
serverFlows["estimates"].get_api_estimates_projectId_line_items();

serverFlows["estimates"].put_api_estimates_line_items_lineItemId();


// ============================================================================
// [FLOW: catalog] Products, selections and room packages
// ============================================================================
// Implementation: server/flows/catalog.js
serverFlows["catalog"].delete_api_selection_boards();

serverFlows["catalog"].get_api_products();

serverFlows["catalog"].post_api_products();

serverFlows["catalog"].post_api_selection_board();

serverFlows["catalog"].get_api_selection_boards();

serverFlows["catalog"].get_api_product_details();

serverFlows["catalog"].delete_api_products_id();


// ============================================================================
// [FLOW: projects] Projects, utilities and daily updates (continued)
// ============================================================================
serverFlows["projects"].get_api_on_market_projects();

serverFlows["projects"].get_api_upcoming_projects();

serverFlows["projects"].get_api_completed_projects();

serverFlows["projects"].get_api_daily_updates();

serverFlows["projects"].post_api_daily_updates();

serverFlows["projects"].get_api_notifications();


// ============================================================================
// [FLOW: quotes] Quotes and signatures
// ============================================================================
// Implementation: server/flows/quotes.js
serverFlows["quotes"].post_api_quotes();

serverFlows["quotes"].get_api_quotes();

serverFlows["quotes"].get_api_quotes_id();

serverFlows["quotes"].post_api_quotes_id_signature();

serverFlows["quotes"].delete_api_quotes_id();

serverFlows["quotes"].put_api_quotes_id();

// Usage Example
const address1 = "9150 Devils River Converse Texas, 78109";
const address2 = "9150 Devils River, Converse, TX 78109";
console.log(parseAddress(address1));
console.log(parseAddress(address2));

serverFlows["quotes"].post_api_quotes_id_convert_to_job();

serverFlows["quotes"].put_api_quotes_id_payments();

serverFlows["quotes"].patch_api_quotes_id_payment_terms();


// ============================================================================
// [FLOW: labor-costs] Labor costs
// ============================================================================
// Implementation: server/flows/labor-costs.js
serverFlows["labor-costs"].get_api_labor_costs();

serverFlows["labor-costs"].post_api_labor_costs();

serverFlows["labor-costs"].put_api_labor_costs_id();

serverFlows["labor-costs"].delete_api_labor_costs_id();


// ============================================================================
// [FLOW: tasks] Tasks, to-dos and comments (continued)
// ============================================================================
serverFlows["tasks"].get_api_todos();

serverFlows["tasks"].post_api_todos();

serverFlows["tasks"].put_api_todos_id();

serverFlows["tasks"].delete_api_todos_id();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].get_api_vendors_login_direct_id();


// ============================================================================
// [FLOW: quality-control] Quality control and rework
// ============================================================================
// Implementation: server/flows/quality-control.js
serverFlows["quality-control"].get_api_quality_review_items_projectId();

serverFlows["quality-control"].put_api_items_itemId_quality_review();


// ============================================================================
// [FLOW: documents] Documents, folders and files (continued)
// ============================================================================
serverFlows["documents"].get_api_folders();

serverFlows["documents"].post_api_folders();

serverFlows["documents"].put_api_folders_reorder();

serverFlows["documents"].put_api_folders_id();

serverFlows["documents"].post_api_folders_id_files();

serverFlows["documents"].put_api_folders_folderId_files_index();

serverFlows["documents"].delete_api_folders_id();

serverFlows["documents"].delete_api_folders_folderId_files_index();

serverFlows["documents"].post_api_folders_folderId_delete_files();

serverFlows["documents"].get_api_projects_projectId_files_fileId_download();


// ============================================================================
// [FLOW: maintenance] Maintenance requests
// ============================================================================
// Implementation: server/flows/maintenance.js
serverFlows["maintenance"].get_api_properties_maintenance();


// ============================================================================
// [FLOW: maintenance-schedules] Recurring maintenance and reminders
// ============================================================================
// Implementation: server/flows/maintenance-schedules.js
serverFlows["maintenance-schedules"].get_api_properties_maintenance_schedules();


// ============================================================================
// [FLOW: properties] Property profiles and overview
// ============================================================================
// Implementation: server/flows/properties.js
serverFlows["properties"].post_api_properties();

serverFlows["properties"].get_api_properties_id();

serverFlows["properties"].get_api_properties_multifamily();


// ============================================================================
// [FLOW: units] Units and availability
// ============================================================================
// Implementation: server/flows/units.js
serverFlows["units"].get_api_properties_id_units();


// ============================================================================
// [FLOW: properties] Property profiles and overview (continued)
// ============================================================================
serverFlows["properties"].put_api_properties_id_profile();

serverFlows["properties"].get_api_properties_id_overview();


// ============================================================================
// [FLOW: units] Units and availability (continued)
// ============================================================================
serverFlows["units"].post_api_properties_id_units();

serverFlows["units"].put_api_properties_propertyId_units_unitId();

serverFlows["units"].delete_api_properties_propertyId_units_unitId();

serverFlows["units"].get_api_public_availability();


// ============================================================================
// [FLOW: tenants] Tenant records and lease notes
// ============================================================================
// Implementation: server/flows/tenants.js
serverFlows["tenants"].get_api_properties_propertyId_tenants();

serverFlows["tenants"].post_api_properties_propertyId_tenants();

serverFlows["tenants"].put_api_properties_propertyId_tenants_tenantId();

serverFlows["tenants"].delete_api_properties_propertyId_tenants_tenantId();

serverFlows["tenants"].post_api_tenants_id_notes();

serverFlows["tenants"].delete_api_tenants_id_notes_noteId();

serverFlows["tenants"].put_api_tenants_id_move_in_checklist();


// ============================================================================
// [FLOW: maintenance] Maintenance requests (continued)
// ============================================================================
serverFlows["maintenance"].get_api_properties_propertyId_maintenance();

// Storage for maintenance photos
const maintenancePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadDir, 'maintenance');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {  
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname);
    cb(null, unique);
  }
});
const maintenancePhotoUpload = multer({ storage: maintenancePhotoStorage });

// Temp storage for pre-save uploads
const maintenanceTempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadDir, 'maintenance', 'temp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = 'temp-' + Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname);
    cb(null, unique);
  }
});
const maintenanceTempUpload = multer({ storage: maintenanceTempStorage });

serverFlows["maintenance"].post_api_properties_propertyId_maintenance();

serverFlows["maintenance"].post_api_properties_propertyId_maintenance_temp_photos();

serverFlows["maintenance"].patch_api_properties_propertyId_maintenance_requestId();

serverFlows["maintenance"].put_api_properties_propertyId_maintenance_requestId();

serverFlows["maintenance"].delete_api_properties_propertyId_maintenance_requestId_photos();

serverFlows["maintenance"].delete_api_properties_propertyId_maintenance_requestId();

serverFlows["maintenance"].post_api_properties_propertyId_maintenance_requestId_messages();


// ============================================================================
// [FLOW: announcements] Property announcements
// ============================================================================
// Implementation: server/flows/announcements.js
serverFlows["announcements"].get_api_properties_propertyId_announcements();

serverFlows["announcements"].post_api_properties_propertyId_announcements();

serverFlows["announcements"].put_api_properties_propertyId_announcements_announcementId();

serverFlows["announcements"].delete_api_properties_propertyId_announcements_announcementId();


// ============================================================================
// [FLOW: documents] Documents, folders and files (continued)
// ============================================================================
serverFlows["documents"].get_api_properties_propertyId_documents();

serverFlows["documents"].get_api_properties_propertyId_documents_documentId_view();

serverFlows["documents"].post_api_properties_propertyId_documents();

serverFlows["documents"].put_api_properties_propertyId_documents_documentId();

serverFlows["documents"].delete_api_properties_propertyId_documents_documentId();

serverFlows["documents"].get_api_properties_propertyId_documents_documentId_download();


// ============================================================================
// [FLOW: payments] Rent payments and monthly charges
// ============================================================================
// Implementation: server/flows/payments.js
serverFlows["payments"].get_api_properties_propertyId_payments();

serverFlows["payments"].get_api_properties_propertyId_payments_paymentId();

serverFlows["payments"].post_api_properties_propertyId_payments_paymentId_send_receipt();

serverFlows["payments"].delete_api_properties_propertyId_payments_paymentId();

serverFlows["payments"].post_api_properties_propertyId_payments();

serverFlows["payments"].put_api_properties_propertyId_payments_paymentId();

serverFlows["payments"].get_api_tenants_tenantId_monthly_overrides();

serverFlows["payments"].get_api_tenants_tenantId_monthly_overrides_period();

serverFlows["payments"].put_api_tenants_tenantId_monthly_overrides_period();

serverFlows["payments"].post_api_properties_propertyId_payments_creditPaymentId_apply_credit();


// ============================================================================
// [FLOW: catalog] Products, selections and room packages (continued)
// ============================================================================
serverFlows["catalog"].get_api_room_packages();

serverFlows["catalog"].get_api_room_packages_key();

serverFlows["catalog"].put_api_room_packages_key();


// ============================================================================
// [FLOW: vendors] Vendors and assignments (continued)
// ============================================================================
serverFlows["vendors"].get_api_vendors_vendorId_used_line_item_ids();

// Ensure the uploads/qc-rework directory exists
const reworkDir = path.join(uploadDir, 'qc-rework');
if (!fs.existsSync(reworkDir)) {
  fs.mkdirSync(reworkDir, { recursive: true });
}

const qcReworkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, reworkDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const qcReworkUpload = multer({ storage: qcReworkStorage });


// ============================================================================
// [FLOW: quality-control] Quality control and rework (continued)
// ============================================================================
serverFlows["quality-control"].post_api_qc_rework_photos();

serverFlows["quality-control"].post_api_quality_review_rework();

serverFlows["quality-control"].post_api_qc_delete_photo();


// ============================================================================
// [FLOW: projects] Projects, utilities and daily updates (continued)
// ============================================================================
serverFlows["projects"].get_api_projects_projectId_utilities();

serverFlows["projects"].put_api_projects_projectId_utilities();


// ============================================================================
// [FLOW: expenses] Expenses and receipts
// ============================================================================
// Implementation: server/flows/expenses.js
serverFlows["expenses"].delete_api_expenses_delete_receipt_file();

serverFlows["expenses"].get_api_expenses_missing_info();

serverFlows["expenses"].post_api_expenses();

serverFlows["expenses"].get_api_expenses();

serverFlows["expenses"].get_api_expenses_duplicates();
serverFlows["expenses"].get_api_expenses_id();

serverFlows["expenses"].put_api_expenses_id();

serverFlows["expenses"].delete_api_expenses_id();

serverFlows["expenses"].post_api_expenses_id_recategorize_bill();


// ============================================================================
// [FLOW: invoices] Invoices and expense conversion
// ============================================================================
// Implementation: server/flows/invoices.js
serverFlows["invoices"].post_api_send();

serverFlows["invoices"].post_api_create();

serverFlows["invoices"].get_api_invoices();

serverFlows["invoices"].patch_api_invoices_id();

serverFlows["invoices"].delete_api_invoices_id();

serverFlows["invoices"].post_api_invoices_id_recategorize_expense();

serverFlows["invoices"].get_api_invoices_by_number_invoiceNumber();


// ============================================================================
// [FLOW: projects] Projects, utilities and daily updates (continued)
// ============================================================================
serverFlows["projects"].get_api_projects_projectId();


// ============================================================================
// [FLOW: invoices] Invoices and expense conversion (continued)
// ============================================================================
serverFlows["invoices"].post_api_invoices();

serverFlows["invoices"].get_history();


// ============================================================================
// [FLOW: expenses] Expenses and receipts (continued)
// ============================================================================
serverFlows["expenses"].post_api_expenses_id_auto_ocr();

serverFlows["expenses"].post_api_expenses_upload_receipt();


// ============================================================================
// [FLOW: estimates] Estimates and line items (continued)
// ============================================================================
serverFlows["estimates"].patch_api_estimates_line_items_lineItemId_status();
 

// ============================================================================
// [FLOW: maintenance-schedules] Recurring maintenance and reminders (continued)
// ============================================================================
serverFlows["maintenance-schedules"].get_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId();

serverFlows["maintenance-schedules"].patch_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId_review();

serverFlows["maintenance-schedules"].patch_api_properties_propertyId_maintenance_schedules_scheduleId_complete();

scheduleDailyUpdateNextScheduledDates();

// --- Run this function every morning at 8am ---
const now = new Date();
const millisTill11 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0, 0) - now;
setTimeout(function() {
  sendMaintenanceReminders();
  setInterval(sendMaintenanceReminders, 24 * 60 * 60 * 1000); // every 24 hours
}, millisTill11 > 0 ? millisTill11 : 0);

serverFlows["maintenance-schedules"].post_api_properties_propertyId_maintenance_schedules();

serverFlows["maintenance-schedules"].get_api_properties_propertyId_maintenance_schedules();

serverFlows["maintenance-schedules"].post_api_properties_propertyId_maintenance_schedules_scheduleId_estimate();

serverFlows["maintenance-schedules"].put_api_properties_propertyId_maintenance_schedules_scheduleId();
 
serverFlows["maintenance-schedules"].delete_api_properties_propertyId_maintenance_schedules_scheduleId();

// ===== Property-scoped QuickBooks Online integration =====
const QB_SCOPE = 'com.intuit.quickbooks.accounting';
const QB_TOKEN_ENCRYPTION_CONFIGURED = !!process.env.QB_TOKEN_ENCRYPTION_KEY;
const QB_TOKEN_KEY = crypto.createHash('sha256').update(process.env.QB_TOKEN_ENCRYPTION_KEY || JWT_SECRET).digest();

const escapeQbQuery=value=>String(value||'').replace(/'/g,"\\'");
const normalizeQbPaymentText=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
const normalizeQbPaymentAmount=value=>Math.round((Number(value)||0)*100)/100;


// ============================================================================
// [FLOW: quickbooks] QuickBooks connections and synchronization
// ============================================================================
// Implementation: server/flows/quickbooks.js
serverFlows["quickbooks"].get_api_properties_propertyId_quickbooks_connect();
serverFlows["quickbooks"].get_api_qb_callback();
serverFlows["quickbooks"].get_api_properties_propertyId_quickbooks_status();
serverFlows["quickbooks"].delete_api_properties_propertyId_quickbooks_connection();
serverFlows["quickbooks"].get_api_properties_propertyId_quickbooks_catalog();
serverFlows["quickbooks"].put_api_properties_propertyId_quickbooks_mappings();

serverFlows["quickbooks"].post_api_properties_propertyId_payments_paymentId_sync_quickbooks();

serverFlows["quickbooks"].post_api_properties_propertyId_expenses_expenseId_sync_quickbooks();
serverFlows["quickbooks"].get_api_properties_propertyId_quickbooks_sync_log();
serverFlows["quickbooks"].get_api_properties_propertyId_quickbooks_payments();

serverFlows["quickbooks"].get_api_properties_propertyId_quickbooks_payment_workspace();

serverFlows["quickbooks"].put_api_properties_propertyId_quickbooks_customer_mapping_tenantId();

serverFlows["quickbooks"].post_api_properties_propertyId_quickbooks_payment_workspace_link();

serverFlows["quickbooks"].post_api_properties_propertyId_quickbooks_payment_workspace_import();


// ============================================================================
// [FLOW: tenant-portal] Tenant portal
// ============================================================================
// Implementation: server/flows/tenant-portal.js
serverFlows["tenant-portal"].post_api_tenant_portal_login();

serverFlows["tenant-portal"].get_api_tenant_portal_me();

serverFlows["tenant-portal"].put_api_tenant_portal_profile();

serverFlows["tenant-portal"].post_api_tenant_portal_maintenance();

serverFlows["tenant-portal"].post_api_tenant_portal_maintenance_requestId_messages();

serverFlows["tenant-portal"].post_api_tenant_portal_payment_notice();

serverFlows["tenant-portal"].get_api_tenant_portal_documents_documentId_view();

serverFlows["tenant-portal"].get_api_tenant_portal_documents_documentId_download();


// ============================================================================
// [FLOW: email] Email and notifications (continued)
// ============================================================================
serverFlows["email"].post_api_contact();


// ============================================================================
// [FLOW: system] System and root endpoints
// ============================================================================
// Implementation: server/flows/system.js
serverFlows["system"].get_api_debug();


// ============================================================================
// [FLOW: calorie-tracker] Calorie tracker
// ============================================================================
// Implementation: server/flows/calorie-tracker.js
serverFlows["calorie-tracker"].post_api_calorie_register();

serverFlows["calorie-tracker"].post_api_calorie_login();

serverFlows["calorie-tracker"].get_api_calorie_me();

serverFlows["calorie-tracker"].put_api_calorie_data();

serverFlows["calorie-tracker"].post_api_calorie_identify_food();


// ============================================================================
// [FLOW: system] System and root endpoints (continued)
// ============================================================================
serverFlows["system"].get_();


// ============================================================================
// [FLOW: eviction-cases] Eviction case integration
// ============================================================================
// Implementation: eviction-cases.js
require('./eviction-cases')({app,mongoose,Tenant,Project,Expense,Manager,authenticateManagerProfile,multer});


// ============================================================================
// [SECTION 08] FALLBACK AND SERVER STARTUP
// ============================================================================
// 404 Fallback Route
app.use((req, res) => {
  res.status(404).send('Page not found.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
