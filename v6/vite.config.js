import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Your real Power Automate HTTP trigger URL — master data flow
const FLOW_URL =
  "https://93cd50265ecdea7aa4fd295cb67b42.d4.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/22/workflows/fa6a24a2ca4b4db498b9eb939349553a/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=YBkFBfYF1FPY_DHWRI0JSpXmHw0ST46XX93XUHeXvwc";

// Your real Power Automate HTTP trigger URL — audit email flow
const AUDIT_FLOW_URL =
  "https://93cd50265ecdea7aa4fd295cb67b42.d4.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/18/workflows/c7212c437f6d41948d051538730ea7d2/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=R9u4HkZeRsU2g0mvWkuc3POFQHqzMAa3uEnRbgDzT6E";

// Your real Power Automate HTTP trigger URL — new-entities flow (Location,
// Designation, Currency, BillingPeriod, Billing, ProjectApproval,
// ProjectDocument, Timesheet, AuditLog, ProjectDocumentFile). Was a
// placeholder ("/flow2" with no target) — now live.
const NEW_FLOW_URL =
  "https://93cd50265ecdea7aa4fd295cb67b42.d4.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/15/workflows/833d9b835a9e45b498ab64f8727f3a00/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=uvFYMoIkNTOuf2X6Rm-_vTS7KSPXwHgXyT206r7OsCE";

const flowUrlObj = new URL(FLOW_URL);
const flowOrigin = flowUrlObj.origin;
const flowPathAndQuery = flowUrlObj.pathname + flowUrlObj.search;

const auditFlowUrlObj = new URL(AUDIT_FLOW_URL);
const auditFlowOrigin = auditFlowUrlObj.origin;
const auditFlowPathAndQuery = auditFlowUrlObj.pathname + auditFlowUrlObj.search;

const newFlowUrlObj = new URL(NEW_FLOW_URL);
const newFlowOrigin = newFlowUrlObj.origin;
const newFlowPathAndQuery = newFlowUrlObj.pathname + newFlowUrlObj.search;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // '/flow2' MUST be registered before '/flow' — Vite's proxy matches
      // by prefix in declaration order, and '/flow2' starts with '/flow',
      // so if '/flow' came first every /flow2 request would silently match
      // the /flow rule instead and get routed to the wrong Power Automate
      // flow (one with no Switch case for these entities — causing a
      // 502 NoResponse that looked exactly like a flow-side problem).
      '/flow2': {
        target: newFlowOrigin,
        changeOrigin: true,
        secure: false,
        rewrite: () => newFlowPathAndQuery,
      },
      // The app calls fetch("/auditflow") to fire the audit-log
      // notification email. Same proxy pattern as /flow above.
      '/auditflow': {
        target: auditFlowOrigin,
        changeOrigin: true,
        secure: false,
        rewrite: () => auditFlowPathAndQuery,
      },
      // The app calls fetch("/flow") in dev; this forwards that
      // request server-side to the real Power Automate URL,
      // avoiding the browser's CORS restriction entirely.
      '/flow': {
        target: flowOrigin,
        changeOrigin: true,
        secure: false,
        rewrite: () => flowPathAndQuery,
      },
    },
  },
})