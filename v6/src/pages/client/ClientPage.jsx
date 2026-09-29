import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Briefcase,
  Contact,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { callClientContactFlow, callClientFlow, callCountryFlow, checkReferences } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle } from "../../constants/theme";
import { ClientPanel } from "./ClientPanel";
import { logAudit } from "../../utils/audit";
import { findDuplicateCode, findDuplicateName } from "../../utils/validation";

export function ClientPage() {
  const [rows, setRows] = useState([]); // each row = { ...client, contact: {...} | null }
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [listError, setListError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    Promise.all([callClientFlow("LIST"), callClientContactFlow("LIST")])
      .then(([clientsRes, contactsRes]) => {
        const merged = clientsRes.data.map((c) => ({
          ...c,
          contact: contactsRes.data.find((ct) => String(ct.clientId) === String(c.guid)) || null,
        }));
        setRows(merged);
        setLoading(false);
      })
      .catch((e) => {
        setListError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { callCountryFlow("LIST").then((res) => setCountries(res.data)); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const countryName = (id) => countries.find((c) => String(c.id) === String(id))?.name || "—";

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (r.code || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q) || (r.contact?.contactName || "").toLowerCase().includes(q);
  });
  const activeCount = rows.filter((r) => r.active).length;

  const kpis = [
    { label: "Clients", value: String(rows.length), icon: Briefcase, color: "#EAB308" },
    { label: "Active Clients", value: String(activeCount), icon: CheckCircle2, color: COLORS.success },
    { label: "Inactive Clients", value: String(rows.length - activeCount), icon: AlertCircle, color: COLORS.danger },
  ];

  const openAdd = () => setPanel({
    mode: "add",
    data: { guid: "", code: "", name: "", countryId: "", active: true, contactGuid: "", contactName: "", email: "", phone: "" },
  });
  const openEdit = async (r) => {
    const guard = await checkReferences("Client", r.guid);
    if (guard.blocked) {
      setToast(guard.message);
      return;
    }
    setPanel({
      mode: "edit",
      data: {
        guid: r.guid, code: r.code, name: r.name, countryId: r.countryId || "", active: r.active,
        contactGuid: r.contact?.guid || "", contactName: r.contact?.contactName || "", email: r.contact?.email || "", phone: r.contact?.phone || "",
      },
    });
  };

  const toggleActive = (r0) => {
    setRows((prev) => prev.map((r) => (r.guid === r0.guid ? { ...r, _toggling: true } : r)));
    callClientFlow("EDIT", { guid: r0.guid, code: r0.code, name: r0.name, countryId: r0.countryId, defaultCurrencyCode: r0.defaultCurrencyCode, active: !r0.active })
      .then(() => refresh())
      .then(() => {
        logAudit("Client", "Update", r0.name || r0.code || "record");
        setToast(`Marked ${!r0.active ? "Active" : "Inactive"}.`);
      })
      .catch((e) => {
        setRows((prev) => prev.map((r) => (r.guid === r0.guid ? { ...r, _toggling: false } : r)));
        setToast(`Update failed: ${e.message}`);
      });
  };

  const submitPanel = (form) => {
    if (!form.code?.trim() || !form.name?.trim() || !form.contactName?.trim()) {
      setErr("Client Code, Client Name and Contact Name are required.");
      return;
    }
    if (findDuplicateCode(rows, form.code, form.guid)) {
      setErr("Client Code already exists. Please enter a unique Client Code.");
      return;
    }
    if (findDuplicateName(rows, form.name, form.guid)) {
      setErr("Client Name already exists. Duplicate Customer Names are not allowed.");
      return;
    }
    const dupContact = rows.find((r) =>
      String(r.guid) !== String(form.guid) &&
      r.contact &&
      (
        (form.email?.trim() && (r.contact.email || "").trim().toLowerCase() === form.email.trim().toLowerCase()) ||
        (form.phone?.trim() && (r.contact.phone || "").trim() === form.phone.trim())
      )
    );
    if (dupContact) {
      setErr(`This contact email/phone is already used by another client ("${dupContact.name}"). Please enter unique contact details.`);
      return;
    }
    setSaving(true);
    setErr("");
    const clientAction = form.guid ? "EDIT" : "CREATE";
    // Sequential Patch: save the Client first, then the Contact
    // using the resulting ClientId (same pattern as ScrClientMaster_1).
    callClientFlow(clientAction, { guid: form.guid, code: form.code, name: form.name, countryId: form.countryId, defaultCurrencyCode: form.defaultCurrencyCode, active: form.active })
      .then((clientRes) => {
        let clientGuid = form.guid;
        if (!clientGuid) {
          const match = clientRes.data.find((c) => c.code === form.code.trim());
          clientGuid = match ? match.guid : "";
        }
        const contactAction = form.contactGuid ? "EDIT" : "CREATE";
        return callClientContactFlow(contactAction, {
          guid: form.contactGuid, clientId: clientGuid,
          contactName: form.contactName, email: form.email, phone: form.phone, active: form.active,
        });
      })
      .then(() => refresh())
      .then(() => {
        setSaving(false);
        setPanel(null);
        logAudit("Client", form.guid ? "Update" : "Create", form.name || form.code || form.empId || form.contactName || "record");
        setToast(form.guid ? "Client updated." : "Client added.");
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  const confirmDeleteRow = async () => {
    if (!confirmDelete) return;
    const guard = await checkReferences("Client", confirmDelete.guid);
    if (guard.blocked) {
      setToast(guard.message);
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    // Contact carries the FK to Client, so it must be deleted first.
    // If the contact is already gone (stale guid, deleted out-of-band, etc.)
    // the flow's Delete action fails the whole run — swallow that specific
    // case so it doesn't block deleting the Client itself.
    const contactGuid = confirmDelete.contact?.guid;
    const deleteContact = contactGuid
      ? callClientContactFlow("DELETE", { guid: contactGuid }).catch((e) => {
          console.warn("Contact delete failed (continuing to delete client):", e.message);
        })
      : Promise.resolve();
    deleteContact
      .then(() => callClientFlow("DELETE", { guid: confirmDelete.guid }))
      .then(() => refresh())
      .then(() => {
        setDeleting(false);
        setConfirmDelete(null);
        logAudit("Client", "Delete", confirmDelete.name || confirmDelete.code || confirmDelete.empId || confirmDelete.contactName || "record");
        setToast("Client deleted.");
      })
      .catch((e) => {
        setDeleting(false);
        setToast(`Delete failed: ${e.message}`);
      });
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Client</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Client and primary contact, managed together</div>
          </div>
          <button
            onClick={openAdd}
            style={{
              display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none",
              borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add Client
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>{k.label}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}1F`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={15} />
                  </span>
                </div>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 26, fontWeight: 700, color: COLORS.text, marginTop: 10 }}>{k.value}</div>
              </div>
            );
          })}
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Clients <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by client, code or contact"
                  style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }}
                />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Client Code", "Client Name", "Contact Name", "Email", "Phone", "Status","Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading clients…
                </td></tr>
              ) : listError ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>No data available.</div>
                    <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                      <RefreshCw size={13} /> Retry
                    </button>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No data available.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.code}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.name}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.contact?.contactName || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted }}>{r.contact?.email || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted }}>{r.contact?.phone || "—"}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={r.active} busy={r._toggling} onToggle={() => toggleActive(r)} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => openEdit(r)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => setConfirmDelete(r)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {panel && (
        <ClientPanel
          mode={panel.mode}
          data={panel.data}
          countries={countries}
          saving={saving}
          error={err}
          onCancel={() => {
            if (panel.mode === "add") {
              openAdd();
            } else {
              setPanel(null);
            }
            setErr("");
          }}
          onClose={() => setPanel(null)}
          onSubmit={submitPanel}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this client?"
          message={`"${confirmDelete.name}" (${confirmDelete.code}) and its contact will be permanently removed. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteRow}
        />
      )}

      {toast && (
        <div style={{
          position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
          background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
        }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}