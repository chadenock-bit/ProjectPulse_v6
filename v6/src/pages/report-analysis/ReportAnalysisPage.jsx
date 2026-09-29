import { useState, useEffect, useCallback } from "react";
import { Users2, FolderKanban, Timer, Loader2, RefreshCw } from "lucide-react";
import { COLORS, SHADOWS } from "../../constants/theme";
import { callProjectFlow, callProjectResourceFlow, callDesignationFlow, callCurrencyFlow, callBillingFlow, callBillingPeriodFlow, callProjectDocumentFlow } from "../../api/flows";
import { useLookups } from "../project-allocation/hooks";
import { ResourceUtilization } from "./ResourceUtilization";
import { ProjectDetails } from "./ProjectDetails";
import { TimesheetSummary } from "./TimesheetSummary";

const TABS = [
  { key: "utilization", label: "Resource Utilization", icon: Users2 },
  { key: "projects", label: "Project Details", icon: FolderKanban },
  { key: "timesheet", label: "Timesheet Summary", icon: Timer },
];

export function ReportAnalysisPage() {
  const [tab, setTab] = useState("utilization");
  const lookups = useLookups();
  const [projects, setProjects] = useState([]);
  const [resources, setResources] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [billings, setBillings] = useState([]);
  const [billingPeriods, setBillingPeriods] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    // Designations / currencies / billing data are optional extras — a failure
    // in any of them must not break the rest of the report. The Timesheet
    // Summary tab reads the resource timesheet hours from Billing (same data
    // the Billing screen shows) — this tab only reads, never writes.
    callDesignationFlow("LIST").then((x) => setDesignations(x.data || [])).catch(() => {});
    callCurrencyFlow("LIST").then((x) => setCurrencies(x.data || [])).catch(() => {});
    callBillingFlow("LIST").then((x) => setBillings(x.data || [])).catch(() => {});
    callBillingPeriodFlow("LIST").then((x) => setBillingPeriods(x.data || [])).catch(() => {});
    callProjectDocumentFlow("LIST").then((x) => setDocuments(x.data || [])).catch(() => {});
    Promise.all([callProjectFlow("LIST"), callProjectResourceFlow("LIST")])
      .then(([p, r]) => { setProjects(p.data || []); setResources(r.data || []); })
      .catch((e) => setError(e.message || "Couldn't load report data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const busy = loading || lookups.loading;
  const err = error || lookups.error;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, minWidth: 0, padding: 26, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Report Analysis</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Utilization, project and timesheet insights in one place</div>
          </div>
          <button onClick={load} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: 5, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: SHADOWS.sm, marginBottom: 18, overflowX: "auto" }}>
          {TABS.map((t) => {
            const on = tab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: "1 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", background: on ? COLORS.accent : "transparent", color: on ? "#fff" : COLORS.textSoft, transition: "background .15s" }}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {busy ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 80, color: COLORS.textMuted, fontSize: 14 }}>
            <Loader2 size={18} className="spin" /> Loading report data…
          </div>
        ) : err ? (
          <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 18, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {err}
            <button onClick={load} style={{ border: `1px solid ${COLORS.danger}`, background: "#fff", color: COLORS.danger, borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
          </div>
        ) : (
          <>
            {tab === "utilization" && <ResourceUtilization projects={projects} resources={resources} lookups={lookups} />}
            {tab === "projects" && <ProjectDetails projects={projects} resources={resources} lookups={lookups} designations={designations} currencies={currencies} />}
            {tab === "timesheet" && <TimesheetSummary projects={projects} resources={resources} lookups={lookups} designations={designations} billings={billings} billingPeriods={billingPeriods} documents={documents} />}
          </>
        )}
      </div>
    </div>
  );
}
