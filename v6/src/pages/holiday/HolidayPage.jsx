// HolidayPage.jsx — yearly holiday calendar, not a plain CRUD table (per
// explicit request). Weekends get their own fixed visual treatment and are
// never editable as a holiday. Clicking any other day opens a small
// Add/Edit Holiday form for that date. This calendar (+ getWorkingDays in
// utils/capacity.js) is the single source of truth Billing's capacity
// calculation reads from — nothing else recomputes "working days"
// independently, per the explicit "don't store working days manually" rule.
import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, X, Loader2, AlertCircle, CalendarDays, Trash2 } from "lucide-react";
import { COLORS, SHADOWS, cardStyle, inputStyle, labelStyle } from "../../constants/theme";
import { callHolidayFlow, callLocationFlow } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { logAudit } from "../../utils/audit";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n) { return String(n).padStart(2, "0"); }
function isoOf(year, month, day) { return `${year}-${pad(month)}-${pad(day)}`; }

// Mon-first 6x7 grid for a given month/year, including the lead/trail days
// from neighboring months (rendered dimmed, not clickable).
function buildGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function HolidayPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [holidays, setHolidays] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [form, setForm] = useState(null); // { guid, holidayDate, holidayName, locationId }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");

  const load = () => {
    setLoading(true);
    setListError("");
    Promise.all([callHolidayFlow("LIST"), callLocationFlow("LIST")])
      .then(([h, l]) => { setHolidays(h.data || []); setLocations(l.data || []); setLoading(false); })
      .catch((e) => { setListError(e.message); setLoading(false); });
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }, [toast]);

  const holidaysByDate = useMemo(() => {
    const m = {};
    (holidays || []).forEach((h) => {
      if (!m[h.holidayDate]) m[h.holidayDate] = [];
      m[h.holidayDate].push(h);
    });
    return m;
  }, [holidays]);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const openDay = (day) => {
    if (!day) return;
    const iso = isoOf(year, month, day);
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0 || dow === 6) return; // weekends can't be turned into a "holiday" row
    const existing = (holidaysByDate[iso] || [])[0];
    setErr("");
    setForm(existing
      ? { guid: existing.guid, holidayDate: iso, holidayName: existing.holidayName, locationId: existing.locationId || "" }
      : { guid: "", holidayDate: iso, holidayName: "", locationId: "" });
  };

  const save = () => {
    if (!form.holidayName.trim()) { setErr("Holiday name is required."); return; }
    setSaving(true);
    setErr("");
    callHolidayFlow(form.guid ? "EDIT" : "CREATE", {
      guid: form.guid,
      holidayDate: form.holidayDate,
      holidayName: form.holidayName.trim(),
      locationId: form.locationId || null,
      active: true,
    })
      .then((res) => {
        setHolidays(res.data);
        setSaving(false);
        setForm(null);
        logAudit("Holiday", form.guid ? "Update" : "Create", form.holidayName.trim());
        setToast(form.guid ? "Holiday updated." : "Holiday added.");
      })
      .catch((e) => { setSaving(false); setErr(e.message); });
  };

  const confirmDeleteHoliday = () => {
    if (!confirmDelete) return;
    callHolidayFlow("DELETE", { guid: confirmDelete.guid })
      .then((res) => {
        setHolidays(res.data);
        setConfirmDelete(null);
        setForm(null);
        // Deliberately NOT touching any past Billing/BillingResource row —
        // those keep the WorkingDays/PlannedHours snapshot calculated at the
        // time they were submitted. Only future calculations are affected.
        logAudit("Holiday", "Delete", confirmDelete.holidayName);
        setToast("Holiday removed. Already-submitted billing records are unaffected.");
      })
      .catch((e) => setErr(e.message));
  };

  const goMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.text }}>Holiday Calendar</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 3 }}>
              This calendar is what Billing's Working Days / capacity calculation reads from — click any weekday to add or edit a holiday.
            </div>
          </div>
        </div>

        {listError && (
          <div style={{ ...cardStyle, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: COLORS.danger, fontSize: 13 }}>
            <AlertCircle size={15} /> Couldn't load holidays: {listError}
          </div>
        )}

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => goMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
              <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text, minWidth: 170, textAlign: "center" }}>{MONTHS[month - 1]} {year}</div>
              <button onClick={() => goMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 150 }}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} style={{ ...inputStyle, width: 90 }} />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: COLORS.textMuted }}><Loader2 className="spin" size={20} /></div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${COLORS.border}` }}>
                {DOW.map((d, i) => (
                  <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i >= 5 ? COLORS.textMuted : COLORS.textSoft, letterSpacing: "0.03em" }}>
                    {d.toUpperCase()}
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {grid.map((day, i) => {
                  const col = i % 7;
                  const isWeekend = col >= 5;
                  const iso = day ? isoOf(year, month, day) : null;
                  const dayHolidays = day ? (holidaysByDate[iso] || []) : [];
                  const isHoliday = dayHolidays.length > 0;
                  return (
                    <div
                      key={i}
                      onClick={() => !isWeekend && openDay(day)}
                      style={{
                        minHeight: 78, borderRight: col < 6 ? `1px solid ${COLORS.border}` : "none",
                        borderTop: `1px solid ${COLORS.border}`, padding: "8px 9px",
                        background: !day ? COLORS.surface : isHoliday ? COLORS.dangerSoft : isWeekend ? COLORS.bg : "#fff",
                        cursor: day && !isWeekend ? "pointer" : "default",
                        transition: "background .12s",
                      }}
                    >
                      {day && (
                        <>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: isHoliday ? COLORS.danger : isWeekend ? COLORS.textMuted : COLORS.text }}>{day}</div>
                          {isWeekend && <div style={{ fontSize: 10.5, color: COLORS.textMuted, marginTop: 4 }}>Weekend</div>}
                          {dayHolidays.map((h) => (
                            <div key={h.guid} style={{ fontSize: 10.5, color: COLORS.danger, fontWeight: 600, marginTop: 4, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {h.holidayName}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12.5, color: COLORS.textMuted }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "#fff", border: `1px solid ${COLORS.border}` }} /> Working Day</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.bg, border: `1px solid ${COLORS.border}` }} /> Weekend</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.dangerSoft, border: `1px solid ${COLORS.border}` }} /> Holiday</span>
        </div>
      </div>

      {form && (
        <div className="pp-panel" style={{ width: 340, background: COLORS.card, borderLeft: `1px solid ${COLORS.border}`, flexShrink: 0, display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(15,20,40,0.06)" }}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{form.guid ? "Edit Holiday" : "Add Holiday"}</div>
              <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                <CalendarDays size={12} /> {new Date(form.holidayDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
            <button onClick={() => setForm(null)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
          </div>
          <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
            <label style={labelStyle}>Holiday Name*</label>
            <input value={form.holidayName} onChange={(e) => setForm({ ...form, holidayName: e.target.value })} placeholder="e.g. Diwali" style={inputStyle} autoFocus />

            <label style={{ ...labelStyle, marginTop: 16 }}>Location</label>
            <select value={form.locationId || ""} onChange={(e) => setForm({ ...form, locationId: e.target.value })} style={inputStyle}>
              <option value="">All locations (company-wide)</option>
              {(locations || []).filter((l) => l.active !== false).map((l) => (
                <option key={l.id ?? l.guid} value={l.id ?? l.guid}>{l.name}</option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 5 }}>Leave blank for a holiday that applies everywhere.</div>

            {err && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 12.5, marginTop: 16 }}>
                <AlertCircle size={14} /> {err}
              </div>
            )}
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 10, justifyContent: "space-between" }}>
            {form.guid ? (
              <button onClick={() => setConfirmDelete(form)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: `1px solid ${COLORS.dangerSoft}`, background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Trash2 size={13} /> Delete
              </button>
            ) : <span />}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setForm(null)} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", gap: 7 }}>
                {saving && <Loader2 size={13} className="spin" />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete holiday?"
          message={`"${confirmDelete.holidayName}" will be permanently removed. Already-submitted billing records that used this holiday in their calculation keep their original numbers.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteHoliday}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8, boxShadow: SHADOWS.lg, zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const navBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text };
