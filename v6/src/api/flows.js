/* ============================================================
    POWER AUTOMATE FLOW INTEGRATION — shared by App.jsx and
    ProjectAllocation.jsx. Pulled into its own file so both can
    import it without a circular import between the two.

    Real HTTP-triggered flow. In dev, calls go through the Vite
    proxy path "/flow" (see vite.config.js) to avoid CORS; in
    production point this at your own proxy/Azure Function.

    ONE flow serves every master-data module via an "entity"
    switch. Trigger schema was extended (Sept 2026) to add:
    email, reportingManagerId, locationId (User); zohoProjectId,
    projectManagerUserId, deliveryHeadUserId, projectDepartmentId,
    currencyId, projectValue, geography, poNumber, sowReference,
    remarks, projectStatusId, approvalStatusId (Project);
    designationId, resourceDepartmentId (ProjectResource);
    countryCurrencyId (Country); pipelineCode, opportunityName,
    projectType, pipelineBillingTypeId, pipelineCurrencyId,
    expectedStartDate, durationMonths, probabilityPct, priority,
    pipelineGeography, pipelineRemarks, convertedToProjectId
    (PipelineProject). See flow1's live trigger for the exact
    current schema — this comment is a summary, not the source
    of truth.

    ENTITY VALUES (must match exactly — case-sensitive, checked
    against the flow's outer Switch_on_Entity "case" values):
      "Department" | "Country" | "ProjectCategory" | "Role" |
      "DealStatus" | "BillingType" | "Client" | "ClientContacts" |
      "User" | "Project" | "ProjectResource" | "ApprovalStatus" |
      "ProjectStatus" | "UserRoles" | "InvoiceStatus" | "PipelineProject" |
      "ProjectResourceTxn"

    RESPONSE SHAPES (what each entity's Select action actually
    returns — these are NOT uniform, so each wrapper below reads
    the exact keys its own flow branch produces):
      Department      -> "Department Code","Department Name","Status","guid"
      Country         -> "CountryCode","CountryName","IsActive","guid","currencyId"
      ProjectCategory -> "CategoryCode","CategoryName","IsActive","guid"
      Role            -> "RoleCode","RoleName","IsActive","guid"
      DealStatus      -> "guid","name","active"                 (no code)
      BillingType     -> "guid","code","name","active"
      Client          -> "guid","clientCode","clientName","countryId","active"
      ClientContacts  -> "guid","clientId","contactName","contactEmail","contactPhone","active"
      User            -> "UserID","EmpID","FirstName","LastName","Gender","JobTitle","DepartmentID","IsActive","Email","ReportingManagerId","LocationId"
      Project         -> "guid","projectCode","projectName","categoryId","clientId","billingTypeId","dealStatusId","startDate","endDate","active", + zohoProjectId/projectManagerUserId/deliveryHeadUserId/projectDepartmentId/currencyId/projectValue/geography/poNumber/sowReference/remarks/projectStatusId/approvalStatusId
      ProjectResource -> "guid","projectId","userId","roleId","allocationPct","weeklyHours","billable","startDate","endDate","designationId","resourceDepartmentId"
      ApprovalStatus  -> "guid","ApprovalStatusCode","ApprovalStatusName","IsActive"   (guid = the table's int "Id" column, NOT the Guid uniqueidentifier column)
      ProjectStatus   -> "guid","ProjectStatusCode","ProjectStatusName","IsActive"     (same "Id"-as-guid convention)
      UserRoles       -> "guid","userId","roleId","active"                             (guid = "Id"; junction row between Users and Roles)
      InvoiceStatus   -> "guid","InvoiceStatusCode","InvoiceStatusName","IsActive"     (guid = "InvoiceStatusId"; table + flow branch both live)
      PipelineProject -> "guid","projectName","clientId","dealValue","dealStatusId","expectedCloseDate","ownerUserId","active", + pipelineCode/opportunityName/projectManagerUserId/deliveryHeadUserId/pipelineDepartmentId/projectType/pipelineBillingTypeId/pipelineCurrencyId/expectedStartDate/durationMonths/probabilityPct/priority/pipelineGeography/pipelineRemarks/convertedToProjectId   (guid = "PipelineProjectId")
      ProjectResourceTxn -> "guid","projectId","userId","roleId","startDate","endDate","allocationPct","active"   (guid = "ProjectResourceTxnId"; history/log table, distinct from ProjectResource)
      Billing (flow2) -> "guid","projectId","billingPeriodId","billingTypeId","amount","currencyId","milestoneName","submittedByUserId","approvalStatusId","approvedByUserId","approvedOn","remarks","active"
    ============================================================ */

  // The app always calls the relative "/flow" path. In dev, Vite's
  // proxy (vite.config.js) forwards it. In production, a redirect
  // rule does the same job — so no code branching is needed.
  export const FLOW_URL = "/flow";
export const AUDIT_FLOW_URL = "/auditflow";
// Live — the new-entities flow (Location, Designation, Currency, plus
// BillingPeriod/Billing/ProjectApproval/ProjectDocument/Timesheet/AuditLog/
// ProjectDocumentFile). In dev, Vite's proxy (vite.config.js) forwards
// "/flow2" to the real Power Automate trigger URL, same pattern as
// FLOW_URL/AUDIT_FLOW_URL. In production, netlify.toml carries the
// matching redirect — it MUST be listed before the /flow redirect.
export const NEW_FLOW_URL = "/flow2";

// GENERIC mailer over the SAME /auditflow flow — the flow's trigger schema
// carries { to, cc, subject, body } and its Send an email (V2) action reads
// those four fields directly (see the flow-edit note in utils/mail.js).
// Returns { success: true } or { success: false, error } instead of
// swallowing failures, so mail.js can write an accurate NotificationLog row.
export function callAuditEmailFlow({ to, cc = "", subject, body }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FLOW_TIMEOUT_MS);

  return fetch(AUDIT_FLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, cc, subject, body }),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Audit flow returned ${res.status}`);
      return { success: true };
    })
    .catch((e) => {
      console.error("Audit email failed:", e.message);
      return { success: false, error: e.message };
    })
    .finally(() => clearTimeout(timeoutId));
}
  // If the network/proxy silently hangs (misconfigured proxy, dropped
  // connection, corporate SSL interception, etc.) fetch's promise can sit
  // pending forever — which is why "Loading…" screens never resolve.
  // This timeout guarantees every call either succeeds or rejects.
  const FLOW_TIMEOUT_MS = 20000;

  /* ============================================================
    GLOBAL CONCURRENCY GATE — every flow call (FLOW_URL, AUDIT_FLOW_URL,
    NEW_FLOW_URL alike) funnels through fetchFlow, so throttling here caps
    the whole app's simultaneous requests, not just one screen's. warmFlowCache
    (17 calls on login) plus any screen's own LIST calls were saturating the
    shared SQL connection at once, starving whichever calls lost the race —
    always the NEW_FLOW_URL ones in practice. Only MAX_CONCURRENT_FLOW_CALLS
    run at a time app-wide; the rest queue and start as slots free up.
    ============================================================ */
  const MAX_CONCURRENT_FLOW_CALLS = 5;
  let activeFlowCalls = 0;
  const flowCallQueue = [];

  function acquireFlowSlot() {
    if (activeFlowCalls < MAX_CONCURRENT_FLOW_CALLS) {
      activeFlowCalls++;
      return Promise.resolve();
    }
    return new Promise((resolve) => flowCallQueue.push(resolve)).then(() => { activeFlowCalls++; });
  }

  function releaseFlowSlot() {
    activeFlowCalls--;
    const next = flowCallQueue.shift();
    if (next) next();
  }

  async function fetchFlow(body, label, url = FLOW_URL) {
    // Several trigger-schema fields (clientId, departmentId, categoryId,
    // billingTypeId, projectId, userId, roleId, ...) are typed as strict
    // "integer" with no "null" option. Sending an explicit null for those
    // fails schema validation with a 400 TriggerInputSchemaMismatch.
    // Omitting the key entirely is safe for every field, nullable or not —
    // triggerBody()?['x'] returns null either way when the key is absent.
    const cleanBody = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== null) cleanBody[k] = v;
    }

    // Wait for a free concurrency slot before starting the network timer —
    // queued time shouldn't eat into the 20s request timeout below.
    await acquireFlowSlot();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FLOW_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanBody),
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error(`Flow request timed out after ${FLOW_TIMEOUT_MS / 1000}s — check the dev proxy / network connection.`);
      }
      throw new Error(`Network error calling flow: ${e.message}`);
    } finally {
      clearTimeout(timeoutId);
      releaseFlowSlot();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Keep the raw SQL/flow error in the console for debugging, but never
      // show it to the user — translate it into something they can act on.
      console.error(`Flow error [${label}] ${res.status}:`, text);
      throw new Error(friendlyFlowError(body.entity, text) || `Flow returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    // Some flow setups still return HTTP 200 even when the underlying
    // action (the SQL delete/update) failed — e.g. a Response action
    // wired to run "after failed" that echoes the error as plain text
    // instead of the expected JSON array. Read as text first so that
    // case can be caught too, not just a non-200 status.
    const rawText = await res.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.error(`Flow returned 200 but a non-JSON body [${label}]:`, rawText);
      throw new Error(friendlyFlowError(body.entity, rawText) || "The flow returned an unexpected response. Please try again.");
    }
    if (import.meta.env?.DEV) console.log(`Flow raw response [${label}]:`, json);
    // A flow can also return 200 with valid JSON that's actually an error
    // shape ({ error: {...} }) rather than the expected array/list.
    if (json && !Array.isArray(json) && (json.error || json.Error)) {
      const errText = JSON.stringify(json);
      console.error(`Flow returned 200 with an error payload [${label}]:`, json);
      throw new Error(friendlyFlowError(body.entity, errText) || "The flow reported an error. Please try again.");
    }
    // Response body is the array produced by the flow's Select action —
    // but stay defensive in case it's ever wrapped.
    return Array.isArray(json) ? json : (json.body || json.data || json.value || []);
  }

  /* ============================================================
    FRIENDLY ERROR TRANSLATION — deleting a row that something
    else still points to (a Department with Users in it, a Client
    with Projects against it, ...) fails in SQL with a REFERENCE
    constraint error, and Power Automate hands that raw SQL text
    straight back to us. Nobody using the app needs to see
    "FK_Users_Department" or "clientRequestId: ..." — this turns
    it into "This department is still in use..." instead. Handled
    once here so every entity's delete gets it for free.
    ============================================================ */
  // Friendly singular name for the record being acted on ("This <label>...").
  const ENTITY_LABELS = {
    Department: "department", Country: "country", ProjectCategory: "project category",
    Role: "role", DealStatus: "deal status", BillingType: "billing type",
    ApprovalStatus: "approval status", ProjectStatus: "project status",
    InvoiceStatus: "invoice status", Client: "client", ClientContacts: "client contact",
    User: "user", Project: "project", ProjectResource: "project resource",
    PipelineProject: "pipeline project", UserRoles: "user role",
    ProjectResourceTxn: "project resource", Billing: "billing record",
  };
  // Friendly plural name for whatever table is still referencing it
  // ("...is still in use by existing <label>.").
  const REFERENCING_TABLE_LABELS = {
    Users: "users", Department: "departments", Project: "projects",
    ProjectResource: "project resource assignments", ProjectResourceTxn: "project resource records",
    Client: "clients", ClientContacts: "client contacts", PipelineProject: "pipeline projects",
    UserRoles: "user role assignments", Country: "countries", ProjectCategory: "project categories",
    Role: "roles", BillingType: "billing types", DealStatus: "deal statuses",
    ApprovalStatus: "approval statuses", ProjectStatus: "project statuses", InvoiceStatus: "invoice statuses",
  };
  function humanizeTableName(name) {
    const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return spaced.endsWith("s") ? spaced : spaced + "s";
  }
  function friendlyFlowError(entity, rawText) {
    if (!rawText) return null;
    if (/(REFERENCE|FOREIGN KEY) constraint/i.test(rawText)) {
      const tableMatch = rawText.match(/dbo\.(\w+)/i);
      const refTable = tableMatch ? tableMatch[1] : null;
      const refLabel = refTable ? (REFERENCING_TABLE_LABELS[refTable] || humanizeTableName(refTable)) : "other records";
      const entityLabel = ENTITY_LABELS[entity] || (entity || "record").toLowerCase();
      return `This ${entityLabel} is still in use by existing ${refLabel} and can't be deleted. Remove or reassign those first, then try again.`;
    }
    // Backstop for a duplicate slipping past the client-side check (e.g. a
    // race between two users, or a stale cached list) and hitting SQL's own
    // UNIQUE/PRIMARY KEY constraint. Same idea as the FK case above: never
    // show the raw "Violation of UNIQUE KEY constraint 'UQ__...'" text —
    // translate it into the same "<X> Code already exists" wording each
    // screen's own client-side check already uses.
    if (/Violation of (?:UNIQUE|PRIMARY) KEY constraint/i.test(rawText)) {
      const entityLabel = ENTITY_LABELS[entity] || (entity || "record").toLowerCase();
      const titleLabel = entityLabel.replace(/\b\w/g, (c) => c.toUpperCase());
      return `${titleLabel} Code already exists. Please enter a unique ${titleLabel} Code.`;
    }
    return null;
  }

  /* ============================================================
    LIST RESPONSE CACHE — every screen used to hit the flow again
    on every mount (open Department, leave, come back — another
    round trip), which is what made navigation feel slow. Since
    every wrapper below funnels through this one function, caching
    here covers all of them with no changes needed anywhere else.

    Rules:
      - A "LIST" call for an entity already in cache is answered
        INSTANTLY from cache — the caller never waits on the network,
        even if the entry has gone stale (see below). Two components
        asking for the same entity at the same time (e.g. the
        Dashboard and a page mounting together) share one in-flight
        request instead of firing two.
      - If the cached entry is older than LIST_CACHE_TTL_MS, a fresh
        copy is fetched silently in the background to update the
        cache for the *next* request — the current caller still gets
        the fast (slightly older) answer immediately, never a wait.
      - Any non-LIST call (CREATE/EDIT/DELETE) for an entity drops
        that entity's cached list, so the very next LIST refetches
        current data instead of showing something stale.
    ============================================================ */
  const LIST_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  const listCache = new Map(); // entity -> { promise, timestamp }

  export function invalidateFlowCache(entity) {
    if (entity) listCache.delete(entity);
    else listCache.clear();
  }

  function postFlow(body, label, url = FLOW_URL) {
    const entity = body.entity;
    const isList = body.action === "LIST";

    if (isList) {
      const cached = listCache.get(entity);
      if (cached) {
        if (Date.now() - cached.timestamp >= LIST_CACHE_TTL_MS) {
          // Stale — refresh quietly in the background for next time.
          // The caller right now still gets the cached promise below,
          // so nothing on screen has to wait for this.
          const refreshed = fetchFlow(body, label, url);
          listCache.set(entity, { promise: refreshed, timestamp: Date.now() });
          refreshed.catch(() => listCache.delete(entity));
        }
        return cached.promise;
      }
    }

    const requestPromise = fetchFlow(body, label, url);

    if (isList) {
      listCache.set(entity, { promise: requestPromise, timestamp: Date.now() });
      // A failed request shouldn't stay cached — let the next attempt retry.
      requestPromise.catch(() => listCache.delete(entity));
    } else {
      // Data just changed — drop the stale cached list for this entity.
      requestPromise.then(() => listCache.delete(entity)).catch(() => {});
    }

    return requestPromise;
  }

  function normGuid(v) {
    return v === "" || v === null || v === undefined ? "" : Number(v);
  }
  function toGuidParam(guid) {
    // "guid" is a plain integer identity column, not a string GUID —
    // 0/null means "no id yet" (CREATE/LIST), a real positive integer for EDIT/DELETE.
    return guid === "" || guid === null || guid === undefined ? null : Number(guid);
  }

  /* ============================================================
    GENERIC code / name / active ENTITIES
    Department, ProjectCategory, Role, DealStatus, BillingType.
    (Country moved to its own custom wrapper below — it now needs
    a currencyId field the generic shape doesn't carry.) Each
    Select renames columns differently, so a small per-entity
    field map does the translation into the uniform
    { id, guid, code, name, active } shape the grids use.
    ============================================================ */
  const ENTITY_FIELD_MAP = {
    Department: { codeCol: "Department Code", nameCol: "Department Name", activeCol: "Status" },
    ProjectCategory: { codeCol: "CategoryCode", nameCol: "CategoryName", activeCol: "IsActive" },
    Role: { codeCol: "RoleCode", nameCol: "RoleName", activeCol: "IsActive" },
    DealStatus: { codeCol: null, nameCol: "name", activeCol: "active" },
    BillingType: { codeCol: "code", nameCol: "name", activeCol: "active" },
    ApprovalStatus: { codeCol: "ApprovalStatusCode", nameCol: "ApprovalStatusName", activeCol: "IsActive" },
    ProjectStatus: { codeCol: "ProjectStatusCode", nameCol: "ProjectStatusName", activeCol: "IsActive" },
    // No backing table yet — see the note in flows.js header and in ADMIN_MODULES (App.jsx).
    InvoiceStatus: { codeCol: "InvoiceStatusCode", nameCol: "InvoiceStatusName", activeCol: "IsActive" },
  };

  export function callMasterDataFlow(entity, action, item = {}) {
    const body = {
      entity,
      guid: toGuidParam(item.guid),
      action,
      code: item.code || "",
      name: item.name || "",
      active: !!item.active,
    };

    return postFlow(body, entity).then((list) => {
      const { codeCol, nameCol, activeCol } = ENTITY_FIELD_MAP[entity];
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid ?? d.id);
        return {
          id: guid !== "" ? guid : (codeCol ? d[codeCol] : String(i)),
          guid,
          code: (codeCol ? d[codeCol] : "") ?? "",
          name: d[nameCol] ?? "",
          active: !!(d[activeCol] ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  export const callDepartmentFlow = (action, department) => callMasterDataFlow("Department", action, department);
  export const callProjectCategoryFlow = (action, category) => callMasterDataFlow("ProjectCategory", action, category);
  export const callRoleFlow = (action, role) => callMasterDataFlow("Role", action, role);
  export const callBillingTypeFlow = (action, billingType) => callMasterDataFlow("BillingType", action, billingType);
  export const callDealStatusFlow = (action, dealStatus) => callMasterDataFlow("DealStatus", action, dealStatus);
  export const callApprovalStatusFlow = (action, item) => callMasterDataFlow("ApprovalStatus", action, item);
  export const callProjectStatusFlow = (action, item) => callMasterDataFlow("ProjectStatus", action, item);
  export const callInvoiceStatusFlow = (action, item) => callMasterDataFlow("InvoiceStatus", action, item);

  /* ============================================================
    COUNTRY FLOW — entity="Country". Own wrapper (not the generic
    callMasterDataFlow) since it carries an extra currencyId field
    the generic code/name/active shape doesn't have.
    ============================================================ */
  export function callCountryFlow(action, item = {}) {
    const body = {
      entity: "Country",
      guid: toGuidParam(item.guid),
      action,
      code: item.code || "",
      name: item.name || "",
      active: !!item.active,
      countryCurrencyId: item.currencyId ? Number(item.currencyId) : null,
    };

    return postFlow(body, "Country").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          code: d.CountryCode ?? "",
          name: d.CountryName ?? "",
          active: !!(d.IsActive ?? false),
          currencyId: d.currencyId ?? "",
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    NEW FLOW ENTITIES — Location, Designation, Currency. Live on
    NEW_FLOW_URL ("/flow2").
    ============================================================ */
  export function callDesignationFlow(action, item = {}) {
    const body = { entity: "Designation", guid: toGuidParam(item.guid), action, code: item.code || "", name: item.name || "", active: !!item.active };
    return postFlow(body, "Designation", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return { id: guid !== "" ? guid : String(i), guid, code: d.code ?? "", name: d.name ?? "", active: !!(d.active ?? false) };
      });
      return { success: true, data: normalized };
    });
  }

  export function callLocationFlow(action, item = {}) {
    const body = {
      entity: "Location", guid: toGuidParam(item.guid), action,
      code: item.code || "", name: item.name || "",
      countryId: item.countryId ? Number(item.countryId) : null,
      active: !!item.active,
    };
    return postFlow(body, "Location", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return { id: guid !== "" ? guid : String(i), guid, code: d.code ?? "", name: d.name ?? "", countryId: d.countryId ?? "", active: !!(d.active ?? false) };
      });
      return { success: true, data: normalized };
    });
  }

  export function callCurrencyFlow(action, item = {}) {
    const body = {
      entity: "Currency", guid: toGuidParam(item.guid), action,
      code: item.code || "", name: item.name || "", symbol: item.symbol || "",
      countryId: item.countryId ? Number(item.countryId) : null,
      active: !!item.active,
    };
    return postFlow(body, "Currency", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return { id: guid !== "" ? guid : String(i), guid, code: d.code ?? "", name: d.name ?? "", symbol: d.symbol ?? "", countryId: d.countryId ?? "", active: !!(d.active ?? false) };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PROJECT APPROVAL FLOW — entity="ProjectApproval". CREATE only
    accepts projectId/approvalStatusId/cpPercent/requestedByUserId
    (no comments/decidedOn — those are EDIT-only, matching the
    flow's Insert vs Update actions). Callers create first, then
    immediately follow with an EDIT to record the comment/decision
    timestamp — see ProjectApprovalPage.confirmDecision.
    ============================================================ */
  export function callProjectApprovalFlow(action, item = {}) {
    const body = {
      entity: "ProjectApproval",
      guid: toGuidParam(item.guid),
      action,
      projectId: item.projectId ? Number(item.projectId) : null,
      cpPercent: item.cpPercent !== undefined && item.cpPercent !== "" ? Number(item.cpPercent) : null,
      requestedByUserId: item.requestedByUserId ? Number(item.requestedByUserId) : null,
      approvalStatusId: item.approvalStatusId ? Number(item.approvalStatusId) : null,
      comments: item.comments || "",
      decidedByUserId: item.decidedByUserId ? Number(item.decidedByUserId) : null,
      decidedOn: item.decidedOn || null,
      active: item.active !== undefined ? !!item.active : true,
    };
    return postFlow(body, "ProjectApproval", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectId: d.projectId ?? "",
          cpPercent: d.cpPercent ?? "",
          requestedByUserId: d.requestedByUserId ?? "",
          approvalStatusId: d.approvalStatusId ?? "",
          comments: d.comments ?? "",
          decidedByUserId: d.decidedByUserId ?? "",
          decidedOn: d.decidedOn ?? "",
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PROJECT DOCUMENT FLOW — entity="ProjectDocument". LIST/CREATE
    deliberately do NOT carry fileData (kept out of the Select so a
    document list doesn't drag every file's bytes over the wire —
    see callProjectDocumentFileFlow below for the single-file fetch
    that does). EDIT only accepts docName/docType/active — matches
    the flow's Update action, which can't change the project,
    uploader, upload date, or the file itself after creation.
    ============================================================ */
  export function callProjectDocumentFlow(action, item = {}) {
    const body = {
      entity: "ProjectDocument",
      guid: toGuidParam(item.guid),
      action,
      projectId: item.projectId ? Number(item.projectId) : null,
      docName: item.docName || "",
      docType: item.docType || "",
      uploadedByUserId: item.uploadedByUserId ? Number(item.uploadedByUserId) : null,
      uploadDate: item.uploadDate || "",
      fileName: item.fileName || "",
      // Base64 payload only (no "data:...;base64," prefix) — the flow's
      // Insert writes this straight into a varbinary(max) column.
      fileData: item.fileData || "",
      active: item.active !== undefined ? !!item.active : true,
    };
    return postFlow(body, "ProjectDocument", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectId: d.projectId ?? "",
          docName: d.docName ?? "",
          docType: d.docType ?? "",
          uploadedByUserId: d.uploadedByUserId ?? "",
          uploadDate: d.uploadDate ?? "",
          fileName: d.fileName ?? "",
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PROJECT DOCUMENT FILE FLOW — entity="ProjectDocumentFile", a
    read-only single-row fetch (GetItem_V2, not GetItems_V2) that DOES
    include fileData. Call this only when the user actually clicks
    View/Download on one document, never for a list. Returns the one
    document object (or null), not the { success, data: [...] } shape
    the other wrappers use, since there's no list here to normalize.
    ============================================================ */
  export function callProjectDocumentFileFlow(guid) {
    const body = { entity: "ProjectDocumentFile", guid: toGuidParam(guid) };
    return postFlow(body, "ProjectDocumentFile", NEW_FLOW_URL).then((list) => {
      const row = Array.isArray(list) ? list[0] : list;
      if (!row) return null;
      return {
        guid: normGuid(row.guid),
        docName: row.docName ?? "",
        docType: row.docType ?? "",
        fileName: row.fileName ?? "",
        fileData: row.fileData ?? "", // base64, no data: URL prefix
      };
    });
  }

  /* ============================================================
    AUDIT LOG FLOW — entity="AuditLog". CREATE + LIST only — the
    flow deliberately has no EDIT/DELETE branch (append-only log).
    Never wire a delete/clear action to this; if pruning is ever
    needed, do it with a scheduled server-side cleanup, not user
    facing CRUD. Field names deliberately kept generic (screen/
    action/record/user/timestamp) so utils/audit.js's logAudit()
    and AuditLogPage don't need to know the SQL column names.
    ============================================================ */
  export function callAuditLogFlow(action, item = {}) {
    const body = {
      entity: "AuditLog",
      action,
      screenName: item.screen || "",
      auditAction: item.action || "",
      recordName: item.record || "",
      byUser: item.user || "",
    };
    return postFlow(body, "AuditLog", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          screen: d.screenName ?? "",
          action: d.auditAction ?? "",
          record: d.recordName ?? "",
          user: d.byUser ?? "",
          timestamp: d.loggedOn ?? "",
        };
      });
      return { success: true, data: normalized };
    });
  }


  /* ============================================================
    NOTIFICATION LOG FLOW — entity="NotificationLog". CREATE + LIST
    only, append-only, same convention as AuditLog above. Maps to
    dbo.NotificationLog: EmailType, RecipientEmail, CcEmail,
    SubjectLine, SentDate, DeliveryStatus, ErrorMessage, SentBy.

    RelatedProjectId was dropped (both the SQL column and its FK to
    Project) — it was blocking Project deletes whenever any
    notification referenced that project. No longer sent or read
    here; matching flow-side edit: remove the "item/RelatedProjectId"
    mapping from Insert row (V2) (NotificationLog) in flow2's
    "NotificationLog" case.
    ============================================================ */
export function callNotificationLogFlow(action, item = {}) {
  const body = {
    entity: "NotificationLog",
    action,
    emailType: item.emailType || "",
    recipientEmail: item.recipientEmail || "",
    ccEmail: item.ccEmail || "",
    subjectLine: item.subjectLine || "",
    deliveryStatus: item.deliveryStatus || "",
    errorMessage: item.errorMessage || "",
    sentBy: item.sentBy || "",
  };
  return postFlow(body, "NotificationLog", NEW_FLOW_URL).then((list) => {
    const normalized = list.map((d, i) => {
      const guid = normGuid(d.guid);
      return {
        id: guid !== "" ? guid : String(i),
        guid,
        emailType: d.emailType ?? "",
        recipientEmail: d.recipientEmail ?? "",
        ccEmail: d.ccEmail ?? "",
        subjectLine: d.subjectLine ?? "",
        sentDate: d.sentDate ?? "",
        deliveryStatus: d.deliveryStatus ?? "",
        errorMessage: d.errorMessage ?? "",
        sentBy: d.sentBy ?? "",
      };
    });
    return { success: true, data: normalized };
  });
}

  /* ============================================================
    BILLING FLOW — entity="Billing" (flow2). Note: flow2's CREATE
    branch hardcodes item/ApprovalStatusId to 0 on insert (ignores
    whatever approvalStatusId the caller sends) — every new Billing
    record starts at status 0 regardless. approvalStatusId only
    takes effect on EDIT.
    ============================================================ */
  export function callBillingFlow(action, item = {}) {
    const body = {
      entity: "Billing",
      guid: toGuidParam(item.guid),
      action,
      projectId: item.projectId ? Number(item.projectId) : null,
      billingPeriodId: item.billingPeriodId ? Number(item.billingPeriodId) : null,
      billingTypeId: item.billingTypeId ? Number(item.billingTypeId) : null,
      amount: item.amount !== undefined && item.amount !== "" ? Number(item.amount) : 0,
      currencyId: item.currencyId ? Number(item.currencyId) : null,
      milestoneName: item.milestoneName || "",
      submittedByUserId: item.submittedByUserId ? Number(item.submittedByUserId) : null,
      approvalStatusId: item.approvalStatusId ? Number(item.approvalStatusId) : null,
      approvedByUserId: item.approvedByUserId ? Number(item.approvedByUserId) : null,
      approvedOn: item.approvedOn || "",
      remarks: item.remarks || "",
      active: !!item.active,
    };

    return postFlow(body, "Billing", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectId: d.projectId ?? "",
          billingPeriodId: d.billingPeriodId ?? "",
          billingTypeId: d.billingTypeId ?? "",
          amount: d.amount ?? 0,
          currencyId: d.currencyId ?? "",
          milestoneName: d.milestoneName ?? "",
          submittedByUserId: d.submittedByUserId ?? "",
          approvalStatusId: d.approvalStatusId ?? "",
          approvedByUserId: d.approvedByUserId ?? "",
          approvedOn: d.approvedOn ?? "",
          remarks: d.remarks ?? "",
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    TIMESHEET FLOW — entity="Timesheet". Frontend wrapper only —
    TimesheetApprovalPage.jsx has imported callTimesheetFlow since
    it was written, but this function never actually existed in
    this file, so that whole screen has been dead on arrival (any
    call to it throws "callTimesheetFlow is not a function"). This
    fills that gap the same way callBillingFlow does, matching the
    dbo.Timesheet columns (EmployeeUserID, ProjectId, WeekEnding,
    Hours, Status, BillingPeriodId, ApprovalStatusId,
    ApprovedByUserId, ApprovedOn) and the trigger schema's existing
    employeeUserId/weekEnding/hours/status keys.

    NOTE: this assumes flow2 actually has a working "Timesheet"
    case (all four actions). If that case turns out to be missing
    or only partially built — same as the BillingPeriod LIST gap
    found earlier — LIST will just come back empty; every caller
    below already treats an empty/failed timesheet list as "no
    approved hours to show" rather than crashing, so nothing
    breaks either way. Verify against the real flow before relying
    on this for anything beyond the read-only display it's used
    for right now.
    ============================================================ */
  export function callTimesheetFlow(action, item = {}) {
    const body = {
      entity: "Timesheet",
      guid: toGuidParam(item.guid),
      action,
      employeeUserId: item.employeeUserId ? Number(item.employeeUserId) : null,
      projectId: item.projectId ? Number(item.projectId) : null,
      weekEnding: item.weekEnding || "",
      hours: item.hours !== undefined && item.hours !== "" ? Number(item.hours) : null,
      status: item.status || "",
      billingPeriodId: item.billingPeriodId ? Number(item.billingPeriodId) : null,
      approvalStatusId: item.approvalStatusId ? Number(item.approvalStatusId) : null,
      approvedByUserId: item.approvedByUserId ? Number(item.approvedByUserId) : null,
      approvedOn: item.approvedOn || null,
    };
    return postFlow(body, "Timesheet", NEW_FLOW_URL).then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          employeeUserId: d.employeeUserId ?? "",
          projectId: d.projectId ?? "",
          weekEnding: d.weekEnding ?? "",
          hours: d.hours ?? 0,
          status: d.status ?? "",
          billingPeriodId: d.billingPeriodId ?? "",
          approvalStatusId: d.approvalStatusId ?? "",
          approvedByUserId: d.approvedByUserId ?? "",
          approvedOn: d.approvedOn ?? "",
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    USER FLOW — entity="User". Own field set (EmpID, FirstName,
    LastName, Gender, JobTitle, DepartmentID, Email,
    ReportingManagerId, LocationId) instead of the generic
    code/name/active shape. Select keeps original PascalCase
    column names for the original fields.
    ============================================================ */
  export function callUserFlow(action, item = {}) {
    const body = {
      entity: "User",
      guid: toGuidParam(item.guid),
      action,
      empId: item.empId || "",
      firstName: item.firstName || "",
      lastName: item.lastName || "",
      gender: item.gender || "",
      jobTitle: item.jobTitle || "",
      departmentId: item.departmentId ? Number(item.departmentId) : null,
      active: !!item.active,
      email: item.email || "",
      reportingManagerId: item.reportingManagerId ? Number(item.reportingManagerId) : null,
      locationId: item.locationId ? Number(item.locationId) : null,
    };

    return postFlow(body, "User").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.UserID);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          empId: d.EmpID ?? "",
          firstName: d.FirstName ?? "",
          lastName: d.LastName ?? "",
          gender: d.Gender ?? "",
          jobTitle: d.JobTitle ?? "",
          departmentId: d.DepartmentID ?? "",
          active: !!(d.IsActive ?? false),
          email: d.Email ?? "",
          reportingManagerId: d.ReportingManagerId ?? "",
          locationId: d.LocationId ?? "",
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    CLIENT FLOW — entity="Client". Own field set (ClientCode,
    ClientName, CountryId, IsActive) — NOT the generic code/name
    shape, since the Select renames to clientCode/clientName
    (lowercase c) rather than the plain code/name used elsewhere.
    Normalized here to { id, guid, code, name, countryId, active }
    so ClientPage in App.jsx can treat it the same way as the
    other master screens.
    ============================================================ */
  export function callClientFlow(action, item = {}) {
    const body = {
      entity: "Client",
      guid: toGuidParam(item.guid),
      action,
      clientCode: item.code || "",
      clientName: item.name || "",
      countryId: item.countryId ? Number(item.countryId) : null,
      active: !!item.active,
    };

    return postFlow(body, "Client").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          code: d.clientCode ?? "",
          name: d.clientName ?? "",
          countryId: d.countryId ?? "",
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    CLIENT CONTACT FLOW — entity="ClientContacts" (plural — must
    match the flow's outer Switch case exactly). Own field set
    (ClientId, ContactName, Email, Phone, IsActive). Used together
    with callClientFlow to build the combined Client + Contact
    screen — save the Client first, then the Contact with the
    resulting ClientId (sequential Patch, same pattern as
    ScrClientMaster_1 in PowerApps).

    Request fields use contactEmail/contactPhone (per the flow's
    trigger schema); the normalized response is translated back
    to email/phone for convenience on the call site.
    ============================================================ */
  export function callClientContactFlow(action, item = {}) {
    const body = {
      entity: "ClientContacts",
      guid: toGuidParam(item.guid),
      action,
      clientId: item.clientId ? Number(item.clientId) : null,
      contactName: item.contactName || "",
      contactEmail: item.email || null,
      contactPhone: item.phone || null,
      active: !!item.active,
    };

    return postFlow(body, "ClientContacts").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          clientId: d.clientId ?? "",
          contactName: d.contactName ?? "",
          email: d.contactEmail ?? "",
          phone: d.contactPhone ?? "",
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PROJECT FLOW — entity="Project". Own field set. The flow's
    Select already returns camelCase keys (guid, projectCode,
    projectName, ...), so normalization here is a straight
    pass-through with type coercion, not a column-name translation.
    Now includes: zohoProjectId, projectManagerUserId,
    deliveryHeadUserId, projectDepartmentId (returned as
    departmentId), currencyId, projectValue, geography, poNumber,
    sowReference, remarks, projectStatusId, approvalStatusId.

    NOTE: this LISTs/CREATEs/EDITs/DELETEs the Project header row
    only. Resources for a project come back separately via
    callProjectResourceFlow("LIST") — merge client-side by
    projectId (see ProjectAllocation.jsx's useProjectsWithResources).
    ============================================================ */
  export function callProjectFlow(action, item = {}) {
    const body = {
      entity: "Project",
      guid: toGuidParam(item.guid),
      action,
      projectCode: item.projectCode || "",
      projectName: item.projectName || "",
      categoryId: item.categoryId ? Number(item.categoryId) : null,
      clientId: item.clientId ? Number(item.clientId) : null,
      billingTypeId: item.billingTypeId ? Number(item.billingTypeId) : null,
      dealStatusId: item.dealStatusId ? Number(item.dealStatusId) : null,
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      active: !!item.active,
      zohoProjectId: item.zohoProjectId || "",
      projectManagerUserId: item.projectManagerUserId ? Number(item.projectManagerUserId) : null,
      deliveryHeadUserId: item.deliveryHeadUserId ? Number(item.deliveryHeadUserId) : null,
      projectDepartmentId: item.departmentId ? Number(item.departmentId) : null,
      currencyId: item.currencyId ? Number(item.currencyId) : null,
      projectValue: item.projectValue !== undefined && item.projectValue !== "" ? Number(item.projectValue) : null,
      geography: item.geography || "",
      poNumber: item.poNumber || "",
      sowReference: item.sowReference || "",
      remarks: item.remarks || "",
      projectStatusId: item.projectStatusId ? Number(item.projectStatusId) : null,
    };

    return postFlow(body, "Project").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectCode: d.projectCode ?? "",
          projectName: d.projectName ?? "",
          categoryId: d.categoryId ?? "",
          clientId: d.clientId ?? "",
          billingTypeId: d.billingTypeId ?? "",
          dealStatusId: d.dealStatusId ?? "",
          startDate: d.startDate ?? "",
          endDate: d.endDate ?? "",
          active: !!(d.active ?? false),
          zohoProjectId: d.zohoProjectId ?? "",
          projectManagerUserId: d.projectManagerUserId ?? "",
          deliveryHeadUserId: d.deliveryHeadUserId ?? "",
          departmentId: d.projectDepartmentId ?? "",
          currencyId: d.currencyId ?? "",
          projectValue: d.projectValue ?? "",
          geography: d.geography ?? "",
          poNumber: d.poNumber ?? "",
          sowReference: d.sowReference ?? "",
          remarks: d.remarks ?? "",
          projectStatusId: d.projectStatusId ?? "",
          approvalStatusId: d.approvalStatusId ?? "",
          resources: [], // filled in by callProjectResourceFlow, merged client-side
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PIPELINE PROJECT FLOW — entity="PipelineProject". Pre-sales
    deal pipeline (Pipeline Project screen). Now includes:
    pipelineCode, opportunityName, projectManagerUserId,
    deliveryHeadUserId, pipelineDepartmentId (returned as
    departmentId), projectType, pipelineBillingTypeId (returned as
    billingTypeId), pipelineCurrencyId (returned as currencyId),
    expectedStartDate, durationMonths, probabilityPct, priority,
    pipelineGeography (returned as geography), pipelineRemarks
    (returned as remarks), convertedToProjectId.
    ============================================================ */
  export function callPipelineProjectFlow(action, item = {}) {
    const body = {
      entity: "PipelineProject",
      guid: toGuidParam(item.guid),
      action,
      projectName: item.projectName || "",
      clientId: item.clientId ? Number(item.clientId) : null,
      dealValue: item.dealValue !== undefined && item.dealValue !== "" ? Number(item.dealValue) : 0,
      dealStatusId: item.dealStatusId ? Number(item.dealStatusId) : null,
      expectedCloseDate: item.expectedCloseDate || "",
      ownerUserId: item.ownerUserId ? Number(item.ownerUserId) : null,
      active: !!item.active,
      pipelineCode: item.pipelineCode || "",
      opportunityName: item.opportunityName || "",
      projectManagerUserId: item.projectManagerUserId ? Number(item.projectManagerUserId) : null,
      deliveryHeadUserId: item.deliveryHeadUserId ? Number(item.deliveryHeadUserId) : null,
      pipelineDepartmentId: item.departmentId ? Number(item.departmentId) : null,
      projectType: item.projectType || "",
      pipelineBillingTypeId: item.billingTypeId ? Number(item.billingTypeId) : null,
      pipelineCurrencyId: item.currencyId ? Number(item.currencyId) : null,
      expectedStartDate: item.expectedStartDate || "",
      durationMonths: item.durationMonths ? Number(item.durationMonths) : null,
      probabilityPct: item.probabilityPct !== undefined && item.probabilityPct !== "" ? Number(item.probabilityPct) : null,
      priority: item.priority || "",
      pipelineGeography: item.geography || "",
      pipelineRemarks: item.remarks || "",
    };

    return postFlow(body, "PipelineProject").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectName: d.projectName ?? "",
          clientId: d.clientId ?? "",
          dealValue: d.dealValue ?? 0,
          dealStatusId: d.dealStatusId ?? "",
          expectedCloseDate: d.expectedCloseDate ?? "",
          ownerUserId: d.ownerUserId ?? "",
          active: !!(d.active ?? false),
          pipelineCode: d.pipelineCode ?? "",
          opportunityName: d.opportunityName ?? "",
          projectManagerUserId: d.projectManagerUserId ?? "",
          deliveryHeadUserId: d.deliveryHeadUserId ?? "",
          departmentId: d.pipelineDepartmentId ?? "",
          projectType: d.projectType ?? "",
          billingTypeId: d.pipelineBillingTypeId ?? "",
          currencyId: d.pipelineCurrencyId ?? "",
          expectedStartDate: d.expectedStartDate ?? "",
          durationMonths: d.durationMonths ?? "",
          probabilityPct: d.probabilityPct ?? "",
          priority: d.priority ?? "",
          geography: d.pipelineGeography ?? "",
          remarks: d.pipelineRemarks ?? "",
          convertedToProjectId: d.convertedToProjectId ?? "",
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    USER ROLES FLOW — entity="UserRoles". Junction table between
    Users and Roles (UserRoles.UserId, UserRoles.RoleId), plus
    IsActive. Own field set — not the generic code/name/active
    shape, since there's no code/name here, just two foreign keys.
    ============================================================ */
  export function callUserRolesFlow(action, item = {}) {
    const body = {
      entity: "UserRoles",
      guid: toGuidParam(item.guid),
      action,
      userId: item.userId ? Number(item.userId) : null,
      roleId: item.roleId ? Number(item.roleId) : null,
      active: !!item.active,
    };

    return postFlow(body, "UserRoles").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          userId: d.userId ?? "",
          roleId: d.roleId ?? "",
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PROJECT RESOURCE FLOW — entity="ProjectResource". The
    allocation/junction table. Now includes designationId and
    resourceDepartmentId (returned as departmentId).
    ============================================================ */
  export function callProjectResourceFlow(action, item = {}) {
    const body = {
      entity: "ProjectResource",
      guid: toGuidParam(item.guid),
      action,
      projectId: item.projectId ? Number(item.projectId) : null,
      userId: item.userId ? Number(item.userId) : null,
      roleId: item.roleId ? Number(item.roleId) : null,
      allocationPct: item.allocationPct !== undefined && item.allocationPct !== "" ? Number(item.allocationPct) : 0,
      weeklyHours: item.weeklyHours !== undefined && item.weeklyHours !== "" ? Number(item.weeklyHours) : 0,
      billable: !!item.billable,
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      designationId: item.designationId ? Number(item.designationId) : null,
      resourceDepartmentId: item.departmentId ? Number(item.departmentId) : null,
    };

    return postFlow(body, "ProjectResource").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectId: d.projectId ?? "",
          userId: d.userId ?? "",
          roleId: d.roleId ?? "",
          allocationPct: d.allocationPct ?? 0,
          weeklyHours: d.weeklyHours ?? 0,
          billable: !!(d.billable ?? false),
          startDate: d.startDate ?? "",
          endDate: d.endDate ?? "",
          designationId: d.designationId ?? "",
          departmentId: d.resourceDepartmentId ?? "",
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    PROJECT RESOURCE TRANSACTION FLOW — entity="ProjectResourceTxn".
    History/log table behind the "Project Resources" screen —
    distinct from ProjectResource (the live current-allocation
    table used by Resource Allocation / ProjectAllocation.jsx).
    Own field set: ProjectId, UserID, RoleId, StartDate, EndDate,
    AllocationPct, IsActive. Pass-through normalization.
    ============================================================ */
  export function callProjectResourceTxnFlow(action, item = {}) {
    const body = {
      entity: "ProjectResourceTxn",
      guid: toGuidParam(item.guid),
      action,
      projectId: item.projectId ? Number(item.projectId) : null,
      userId: item.userId ? Number(item.userId) : null,
      roleId: item.roleId ? Number(item.roleId) : null,
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      allocationPct: item.allocationPct !== undefined && item.allocationPct !== "" ? Number(item.allocationPct) : 0,
      active: !!item.active,
    };

    return postFlow(body, "ProjectResourceTxn").then((list) => {
      const normalized = list.map((d, i) => {
        const guid = normGuid(d.guid);
        return {
          id: guid !== "" ? guid : String(i),
          guid,
          projectId: d.projectId ?? "",
          userId: d.userId ?? "",
          roleId: d.roleId ?? "",
          startDate: d.startDate ?? "",
          endDate: d.endDate ?? "",
          allocationPct: d.allocationPct ?? 0,
          active: !!(d.active ?? false),
        };
      });
      return { success: true, data: normalized };
    });
  }

  /* ============================================================
    CACHE WARM-UP — call once right after login (see AppShell).
    Fires every commonly-used master-data LIST in parallel so the
    cache above is already populated by the time the user clicks
    into a screen, instead of paying the flow round-trip at that
    moment. Fire-and-forget: failures here are silent — the normal
    per-screen fetch/retry UI still runs if a screen is opened
    before its prefetch has landed.
    ============================================================ */
  export function warmFlowCache() {
    [
      callDepartmentFlow, callCountryFlow, callProjectCategoryFlow, callRoleFlow,
      callDealStatusFlow, callBillingTypeFlow, callApprovalStatusFlow, callProjectStatusFlow,
      callInvoiceStatusFlow, callClientFlow, callClientContactFlow, callUserFlow, callUserRolesFlow,
      callProjectFlow, callProjectResourceFlow, callPipelineProjectFlow, callProjectResourceTxnFlow,
    ].forEach((fn) => fn("LIST").catch(() => {}));
  }

  /* ============================================================
    PRE-DELETE REFERENCE CHECK — instead of letting a delete hit
    SQL and fail with a FK constraint error, check the already-
    cached LIST data for other screens up front and block the
    delete client-side with a clear message before it's even
    attempted.

    Deliberately cache-only: this NEVER triggers a new flow call.
    It only looks at whatever is already sitting in the LIST cache
    (almost always warm already — see warmFlowCache). If a
    referencing entity hasn't been cached yet for some reason, that
    one check is skipped rather than forcing a fetch — the SQL-side
    FK error (friendlyFlowError, above) is still there as a backstop
    for that edge case, so nothing can silently succeed and corrupt
    data either way.
    ============================================================ */
  const REFERENCE_RULES = {
    Department: [{ refEntity: "User", field: "departmentId", label: "users" }],
    Country: [{ refEntity: "Client", field: "countryId", label: "clients" }],
    ProjectCategory: [{ refEntity: "Project", field: "categoryId", label: "projects" }],
    BillingType: [{ refEntity: "Project", field: "billingTypeId", label: "projects" }],
    DealStatus: [
      { refEntity: "Project", field: "dealStatusId", label: "projects" },
      { refEntity: "PipelineProject", field: "dealStatusId", label: "pipeline projects" },
    ],
    Role: [
      { refEntity: "ProjectResource", field: "roleId", label: "project resource assignments" },
      { refEntity: "ProjectResourceTxn", field: "roleId", label: "project resource records" },
      { refEntity: "UserRoles", field: "roleId", label: "user role assignments" },
    ],
    User: [
      { refEntity: "ProjectResource", field: "userId", label: "project resource assignments" },
      { refEntity: "ProjectResourceTxn", field: "userId", label: "project resource records" },
      { refEntity: "PipelineProject", field: "ownerUserId", label: "pipeline projects" },
    ],
    Client: [
      // ClientContacts is deliberately excluded — every Client always has
      // exactly one contact (its own; Contact Name is mandatory at
      // creation), and that contact is auto-cascaded away with the Client
      // itself (see ClientPage.confirmDeleteRow). Checking it here would
      // make every Client appear "in use" by its own contact and block
      // every delete/edit unconditionally, which is exactly the bug this
      // note is here to prevent reintroducing.
      { refEntity: "Project", field: "clientId", label: "projects" },
      { refEntity: "PipelineProject", field: "clientId", label: "pipeline projects" },
    ],
    Project: [
      // ProjectResource is deliberately excluded here — the app already
      // cascades those away (deletes a project's own resources first, see
      // ProjectDashboardPage) as part of the same delete action, so
      // checking it would always report "still in use" by rows that are
      // about to be removed anyway. ProjectResourceTxn is a separate
      // history/log table that ISN'T auto-cleaned, so that one still guards.
      { refEntity: "ProjectResourceTxn", field: "projectId", label: "project resource records" },
    ],
  };

  // entity name -> its call*Flow wrapper, so a cached raw response can be
  // re-normalized (practically free — the underlying fetch is cached) without
  // this file having to know every entity's raw field-name quirks again.
  const FLOW_FN_BY_ENTITY = {
    Department: callDepartmentFlow, Country: callCountryFlow, ProjectCategory: callProjectCategoryFlow,
    Role: callRoleFlow, BillingType: callBillingTypeFlow, DealStatus: callDealStatusFlow,
    User: callUserFlow, Client: callClientFlow, ClientContacts: callClientContactFlow,
    Project: callProjectFlow, PipelineProject: callPipelineProjectFlow,
    ProjectResource: callProjectResourceFlow, ProjectResourceTxn: callProjectResourceTxnFlow,
    UserRoles: callUserRolesFlow,
  };

  /**
   * Checks whether `guid` on `entity` is still referenced somewhere else,
   * using only what's already cached. Returns { blocked, message }.
   * Never makes a network call.
   */
  export async function checkReferences(entity, guid) {
    const rules = REFERENCE_RULES[entity];
    if (!rules || guid === "" || guid == null) return { blocked: false };
    const guidStr = String(guid);

    for (const rule of rules) {
      if (!listCache.has(rule.refEntity)) continue; // not cached — skip, SQL FK error is the backstop
      const flowFn = FLOW_FN_BY_ENTITY[rule.refEntity];
      if (!flowFn) continue;
      let res;
      try {
        res = await flowFn("LIST"); // resolves from cache instantly — no new network call
      } catch {
        continue; // cached promise had failed/expired — skip this check, backstop still applies
      }
      const rows = res?.data || [];
      const isReferenced = rows.some((row) => String(row[rule.field] ?? "") === guidStr);
      if (isReferenced) {
        const entityLabel = ENTITY_LABELS[entity] || entity.toLowerCase();
        return {
          blocked: true,
          message: `This ${entityLabel} is being used by existing ${rule.label} and can't be edited or deleted. Remove or reassign those first.`,
        };
      }
    }
    return { blocked: false };
  }

  /* ============================================================
  ADD THIS TO src/api/flows.js — paste directly below callBillingFlow.

  callBillingPeriodFlow was referenced by the new BillingPage.jsx
  but was never built in flows.js (only callBillingFlow was — the
  Billing entity's periods are a separate BillingPeriod entity,
  already live on flow2 per your Sept 2026 export, just missing
  its frontend wrapper).
  ============================================================ */

export function callBillingPeriodFlow(action, item = {}) {
  const body = {
    entity: "BillingPeriod",
    guid: toGuidParam(item.guid),
    action,
    billingMonth: item.billingMonth ? Number(item.billingMonth) : null,
    billingYear: item.billingYear ? Number(item.billingYear) : null,
    periodName: item.periodName || "",
    periodStartDate: item.periodStartDate || "",
    periodEndDate: item.periodEndDate || "",
    isClosed: !!item.isClosed,
    active: !!item.active,
  };

  return postFlow(body, "BillingPeriod", NEW_FLOW_URL).then((list) => {
    const normalized = list.map((d, i) => {
      const guid = normGuid(d.guid);
      return {
        id: guid !== "" ? guid : String(i),
        guid,
        billingMonth: d.billingMonth ?? "",
        billingYear: d.billingYear ?? "",
        periodName: d.periodName ?? "",
        periodStartDate: d.periodStartDate ?? "",
        periodEndDate: d.periodEndDate ?? "",
        isClosed: !!(d.isClosed ?? false),
        active: !!(d.active ?? false),
      };
    });
    return { success: true, data: normalized };
  });
}

/* ============================================================
  HOLIDAY FLOW — entity="Holiday". Written ahead of the Flow Buddy case
  the same way callTimesheetFlow was (see the note on that function) —
  LIST/CREATE/EDIT/DELETE will just fail until the "Holiday" case exists
  on flow2. See flow_buddy_spec.md for the exact case to add.
  locationId is nullable: leave it unset for a company-wide holiday.
  ============================================================ */
export function callHolidayFlow(action, item = {}) {
  const body = {
    entity: "Holiday",
    guid: toGuidParam(item.guid),
    action,
    holidayDate: item.holidayDate || "",
    holidayName: item.holidayName || "",
    locationId: item.locationId ? Number(item.locationId) : null,
    active: item.active !== undefined ? !!item.active : true,
  };

  return postFlow(body, "Holiday", NEW_FLOW_URL).then((list) => {
    const normalized = list.map((d, i) => {
      const guid = normGuid(d.guid);
      return {
        id: guid !== "" ? guid : String(i),
        guid,
        holidayDate: d.holidayDate ? String(d.holidayDate).slice(0, 10) : "",
        holidayName: d.holidayName ?? "",
        locationId: d.locationId ?? "",
        active: !!(d.active ?? true),
      };
    });
    return { success: true, data: normalized };
  });
}

/* ============================================================
  BILLING RESOURCE FLOW — entity="BillingResource". Child of Billing:
  one row per resource on a Billing record, holding the capacity-rule
  snapshot (WorkingDays/PlannedHours calculated from BillingPeriod x
  Holiday at save time — never recalculated later, so editing the
  Holiday calendar afterwards never silently changes a submitted
  billing record's numbers). Written ahead of the Flow Buddy case —
  see flow_buddy_spec.md.
  ============================================================ */
export function callBillingResourceFlow(action, item = {}) {
  const body = {
    entity: "BillingResource",
    guid: toGuidParam(item.guid),
    action,
    billingId: item.billingId ? Number(item.billingId) : null,
    userId: item.userId ? Number(item.userId) : null,
    hoursPerDay: item.hoursPerDay !== undefined && item.hoursPerDay !== "" ? Number(item.hoursPerDay) : 8,
    workingDays: item.workingDays !== undefined && item.workingDays !== "" ? Number(item.workingDays) : 0,
    plannedHours: item.plannedHours !== undefined && item.plannedHours !== "" ? Number(item.plannedHours) : 0,
    actualHours: item.actualHours !== undefined && item.actualHours !== "" ? Number(item.actualHours) : 0,
    active: item.active !== undefined ? !!item.active : true,
  };

  return postFlow(body, "BillingResource", NEW_FLOW_URL).then((list) => {
    const normalized = list.map((d, i) => {
      const guid = normGuid(d.guid);
      return {
        id: guid !== "" ? guid : String(i),
        guid,
        billingId: d.billingId ?? "",
        userId: d.userId ?? "",
        hoursPerDay: d.hoursPerDay ?? 8,
        workingDays: d.workingDays ?? 0,
        plannedHours: d.plannedHours ?? 0,
        actualHours: d.actualHours ?? 0,
        active: !!(d.active ?? true),
      };
    });
    return { success: true, data: normalized };
  });
}

/* ============================================================
  AUTH FLOW — entity="Auth" on flow2 (NEW_FLOW_URL). New branch,
  additive only — does not touch any existing entity case.

  Actions:
    GET_CREDENTIAL   { username } -> the one matching UserCredential
                       row (if any), INCLUDING PasswordHash. The
                       hash never gets compared server-side because
                       Power Automate has no bcrypt action — it's
                       compared in the browser with bcryptjs
                       (see pages/auth/SignInPage.jsx). This means
                       a hash briefly crosses the network on every
                       login attempt; acceptable only because this
                       app sits behind your own auth wall/VPN — if
                       it's ever exposed publicly, move this check
                       into a real backend instead.
    CREATE_CREDENTIAL { userId, username, passwordHashB64 } -> inserts
                       a new UserCredential row. passwordHashB64 is
                       the bcrypt hash bytes, base64-encoded (Power
                       Automate's SQL connector expects base64 for
                       varbinary columns, not hex).
    REQUEST_RESET     { username } -> creates a PasswordResetToken
                       row (random token generated client-side,
                       expiring in 30 min) and returns it. No email
                       step is wired up (no email connector in this
                       flow) — the UI shows the reset link directly,
                       which only really works for an admin resetting
                       a colleague's password face-to-face/over chat;
                       wire in an email action on the flow's
                       REQUEST_RESET branch before relying on this
                       for real self-service resets.
    CONFIRM_RESET     { token, passwordHashB64 } -> flow's own SQL
                       validates the token (unused, unexpired) before
                       updating PasswordHash and marking the token
                       used — see the flow-design doc for the exact
                       WHERE clause; do not trust an unexpired flag
                       computed client-side for this step.
  ============================================================ */
export function callAuthFlow(action, payload = {}) {
  const body = {
    entity: "Auth",
    action,
    userId: payload.userId ? Number(payload.userId) : null,
    username: payload.username || "",
    email: payload.email || "", 
    passwordHashB64: payload.passwordHashB64 || "",
    token: payload.token || "",
    expiresOn: payload.expiresOn || "",
  };
  return postFlow(body, "Auth", NEW_FLOW_URL);
}

/* ============================================================
  PERMISSION FLOW — entity="Permission" on flow2. Covers Module,
  RolePermission, UserPermission, and the resolved
  vw_EffectiveUserPermission view. New branch, additive only.

  Actions:
    LIST_MODULES            -> every active row in dbo.Module
    LIST_ROLE_PERMISSIONS   { roleId } -> that role's RolePermission rows
    SAVE_ROLE_PERMISSION    { roleId, moduleId, canView, canCreate,
                               canEdit, canDelete, canApprove } ->
                               upsert (flow does INSERT ... ON
                               EXISTS UPDATE, or two branches keyed
                               off whether a row already exists —
                               see flow-design doc)
    LIST_USER_PERMISSIONS   { userId } -> that user's UserPermission
                               override rows
    SAVE_USER_PERMISSION    same shape as SAVE_ROLE_PERMISSION but
                               keyed by userId + isOverride
    CLEAR_USER_PERMISSION   { userId, moduleId } -> deletes the
                               override row so the user falls back
                               to their role's default again
    GET_EFFECTIVE           { userId } -> SELECT * FROM
                               dbo.vw_EffectiveUserPermission WHERE
                               UserId = @userId — this is what
                               PermissionContext calls right after
                               login/on refresh.
  ============================================================ */
export function callPermissionFlow(action, payload = {}) {
  const body = {
    entity: "Permission",
    action,
    userId: payload.userId ? Number(payload.userId) : null,
    roleId: payload.roleId ? Number(payload.roleId) : null,
    moduleId: payload.moduleId ? Number(payload.moduleId) : null,
    canView: payload.canView !== undefined ? !!payload.canView : null,
    canCreate: payload.canCreate !== undefined ? !!payload.canCreate : null,
    canEdit: payload.canEdit !== undefined ? !!payload.canEdit : null,
    canDelete: payload.canDelete !== undefined ? !!payload.canDelete : null,
    canApprove: payload.canApprove !== undefined ? !!payload.canApprove : null,
  };
  return postFlow(body, "Permission", NEW_FLOW_URL);
}

/* ============================================================
  INVOICE FLOW — entity="Invoice" on flow2. Replaces LinkInvoicePage's
  localStorage-only persistence (utils/seed.js / storage.js) with the
  real dbo.Invoice table — that table already existed in SQL and was
  simply never wired to the frontend. New branch, additive only;
  LinkInvoicePage.jsx is the only file that changes to use this.
  ============================================================ */
export function callInvoiceFlow(action, item = {}) {
  const body = {
    entity: "Invoice",
    guid: toGuidParam(item.guid),
    action,
    invoiceNumber: item.invoiceNumber || "",
    clientId: item.clientId ? Number(item.clientId) : null,
    projectId: item.projectId ? Number(item.projectId) : null,
    amount: item.amount !== undefined && item.amount !== "" ? Number(item.amount) : null,
    invoiceDate: item.invoiceDate || "",
    dueDate: item.dueDate || "",
    currencyId: item.currencyId ? Number(item.currencyId) : null,
    billingPeriodId: item.billingPeriodId ? Number(item.billingPeriodId) : null,
    totalBillableHours: item.totalBillableHours !== undefined && item.totalBillableHours !== "" ? Number(item.totalBillableHours) : null,
    invoiceStatusId: item.invoiceStatusId ? Number(item.invoiceStatusId) : null,
    paymentDate: item.paymentDate || "",
    paymentReference: item.paymentReference || "",
    financeRemarks: item.financeRemarks || "",
    billingId: item.billingId ? Number(item.billingId) : null,
    active: item.active !== undefined ? !!item.active : true,
  };

  return postFlow(body, "Invoice", NEW_FLOW_URL).then((list) => {
    const normalized = list.map((d, i) => {
      const guid = normGuid(d.guid);
      return {
        id: guid !== "" ? guid : String(i),
        guid,
        invoiceNumber: d.invoiceNumber ?? "",
        clientId: d.clientId ?? "",
        projectId: d.projectId ?? "",
        amount: d.amount ?? "",
        invoiceDate: d.invoiceDate ?? "",
        dueDate: d.dueDate ?? "",
        currencyId: d.currencyId ?? "",
        billingPeriodId: d.billingPeriodId ?? "",
        totalBillableHours: d.totalBillableHours ?? "",
        invoiceStatusId: d.invoiceStatusId ?? "",
        paymentDate: d.paymentDate ?? "",
        paymentReference: d.paymentReference ?? "",
        financeRemarks: d.financeRemarks ?? "",
        billingId: d.billingId ?? "",
        active: !!(d.active ?? false),
      };
    });
    return { success: true, data: normalized };
  });
}