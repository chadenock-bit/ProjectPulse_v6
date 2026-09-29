export function parseCurrency(str) {
  return Number((str || "").replace(/[^0-9]/g, "")) || 0;
}

export function formatINR(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

// App-wide date standard: yyyy-MM-dd everywhere. <input type="date"> only
// accepts an exact 10-char yyyy-MM-dd value — SQL rows often come back as a
// full ISO timestamp ("2026-01-15T00:00:00.000Z"), which the input silently
// rejects and renders BLANK, even though the value is actually there. That
// mismatch is what makes Edit screens look like they "cleared" a populated
// date field. Always run a date value through this before handing it to a
// date input or a form's local state on Edit.
export function toDateInput(v) {
  return v ? String(v).slice(0, 10) : "";
}
