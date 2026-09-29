// Shared building blocks for the Report Analysis modules.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, SearchX, X } from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";

export const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, boxShadow: SHADOWS.sm };
export const ymd = (d) => (d ? String(d).slice(0, 10) : "");
export const byId = (list) => Object.fromEntries((list || []).map((x) => [String(x.id), x]));
// App-wide date display standard: yyyy-MM-dd everywhere.
export const fmtDate = (d) => (d ? ymd(d) : "—");
export const money = (n) => (n || n === 0 ? Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—");
export const compact = (n) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n) || 0);
export const initials = (n) => String(n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

// Excel-friendly CSV (UTF-8 BOM so Excel opens it with correct characters).
export function downloadExcelCsv(filename, rows) {
  const csv = rows.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Panel({ title, sub, action, children, style }) {
  return (
    <div style={{ ...card, padding: 20, minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Kpi({ icon: Icon, color, label, value, sub }) {
  return (
    <div style={{ ...card, padding: 16, display: "flex", gap: 14, alignItems: "center", position: "relative", overflow: "hidden" }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <span style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={20} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 23, fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: COLORS.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
    </div>
  );
}

export function Empty({ text = "No data matches the selected filters." }) {
  return (
    <div style={{ padding: "40px 0", textAlign: "center", color: COLORS.textMuted, fontSize: 13 }}>
      <SearchX size={22} /><div style={{ marginTop: 6 }}>{text}</div>
    </div>
  );
}

export function Badge({ color, children }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: `${color}1f`, color, whiteSpace: "nowrap" }}>{children}</span>;
}

// Searchable multi-select dropdown. value = array of string ids.
export function MultiSelect({ label, options, value, onChange, allText = "All" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const sel = new Set(value);
  const shown = options.filter((o) => String(o.name).toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => onChange(sel.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const text = value.length === 0 ? allText : value.length === 1 ? (options.find((o) => o.id === value[0])?.name || "1 selected") : `${value.length} selected`;
  const on = value.length > 0;

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left", borderColor: on ? COLORS.accent : COLORS.border, background: on ? COLORS.accentSoft : "#fff" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: on ? COLORS.accent : COLORS.text, fontWeight: on ? 600 : 400 }}>{text}</span>
        {on && (
          <span role="button" tabIndex={-1} title="Clear" onClick={(e) => { e.stopPropagation(); onChange([]); }} style={{ display: "flex", color: COLORS.accent }}><X size={14} /></span>
        )}
        <ChevronDown size={15} color={COLORS.textMuted} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "max(100%, 260px)", zIndex: 60, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: SHADOWS.lg, overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: 12, borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.textMuted }}>{value.length} of {options.length} selected</span>
            <span style={{ display: "flex", gap: 12 }}>
              <span onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.id)])])} style={{ color: COLORS.accent, fontWeight: 700, cursor: "pointer" }}>Select all</span>
              <span onClick={() => onChange([])} style={{ color: COLORS.textMuted, fontWeight: 700, cursor: "pointer" }}>Clear</span>
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", padding: 4 }}>
            {shown.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: COLORS.textMuted, textAlign: "center" }}>No matches</div>}
            {shown.map((o) => {
              const checked = sel.has(o.id);
              return (
                <div key={o.id} onClick={() => toggle(o.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: COLORS.text, background: checked ? COLORS.accentSoft : "transparent" }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${checked ? COLORS.accent : COLORS.borderStrong}`, background: checked ? COLORS.accent : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {checked && <Check size={12} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}