// Invoice is the only module left with no SQL flow case (Flow1 was never
// extended with an "Invoice" entity case), so this is the only seed
// function still in use — see LinkInvoicePage and DashboardHome. The
// Timesheet/ProjectApproval/ProjectDocument seed generators that used to
// live here have been removed now that those modules read real SQL data
// through src/api/flows.js.
export function seedLinkInvoices() {
  const clients = ["Acme Corp", "Globex Ltd", "Initech", "Umbrella Inc", "Wayne Enterprises", "Stark Industries", "Northwind", "Contoso", "Fabrikam", "Cyberdyne Systems"];
  const projects = ["Devoir Portal Revamp", "Client Onboarding Tool", "HR Self-Service Portal", "Retail Analytics Suite", "Inventory Sync Engine", "Mobile Banking App", "E-Commerce Migration", "Data Warehouse Build"];
  return Array.from({ length: 20 }, (_, i) => ({
    guid: `li-${i + 1}`,
    invoiceNumber: `INV-${1001 + i}`,
    clientName: clients[i % clients.length],
    projectName: projects[i % projects.length],
    amount: `₹${(1 + (i % 9)) * 50000}`.replace(/(\d)(?=(\d{2})+\d$)/g, "$1,"),
    dueDate: `2026-${String(9 + (i % 3)).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
    status: i % 3 === 0 ? "Unlinked" : "Linked",
  }));
}