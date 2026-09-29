// hooks.js (full file)
import React, { useState, useEffect, useCallback } from "react";
import { callApprovalStatusFlow, callBillingTypeFlow, callClientFlow, callDepartmentFlow, callProjectApprovalFlow, callProjectCategoryFlow, callProjectDocumentFlow, callProjectFlow, callProjectResourceFlow, callProjectStatusFlow, callRoleFlow, callUserFlow } from "../../api/flows";

export function useProjectsWithResources() {
  const [projects, setProjects] = useState([]);
  const [allResources, setAllResources] = useState([]); // flat, unfiltered — needed for cross-project 100% allocation check
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // opts.skipDocuments: true avoids re-hitting flow2's document LIST — use this
  // right after a project/resource save, since documents sync independently
  // via each DocumentRow and aren't touched by that save. Prevents the doc
  // LIST call from landing while a just-completed document upload's SQL
  // transaction is still settling (was causing 502 NoResponse).
  const refresh = React.useCallback((opts = {}) => {
    const { skipDocuments = false } = opts;
    setLoading(true);
    setError("");
    const calls = [callProjectFlow("LIST"), callProjectResourceFlow("LIST"), callProjectApprovalFlow("LIST")];
    if (!skipDocuments) calls.push(callProjectDocumentFlow("LIST"));

    return Promise.all(calls)
      .then(([projRes, resRes, apprRes, docRes]) => {
        setAllResources(resRes.data);
        setProjects((prev) => {
          const merged = projRes.data.map((p) => {
            const existing = prev.find((x) => String(x.guid) === String(p.guid));
            return {
              ...p,
              resources: resRes.data.filter((r) => String(r.projectId) === String(p.guid)),
              approvals: apprRes.data.filter((a) => String(a.projectId) === String(p.guid)),
              // No fresh docRes this call — keep whatever was already known for this project.
              documents: docRes ? docRes.data.filter((d) => String(d.projectId) === String(p.guid)) : (existing?.documents || []),
            };
          });
          return merged;
        });
        setLoading(false);
        return projRes.data;
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
        throw e;
      });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { projects, setProjects, loading, error, refresh, allResources };
}

export function useLookups() {
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [billingTypes, setBillingTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projectStatuses, setProjectStatuses] = useState([]);
  const [approvalStatuses, setApprovalStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      callProjectCategoryFlow("LIST"),
      callClientFlow("LIST"),
      callBillingTypeFlow("LIST"),
      callUserFlow("LIST"),
      callRoleFlow("LIST"),
      callDepartmentFlow("LIST"),
      callProjectStatusFlow("LIST"),
      callApprovalStatusFlow("LIST"),
    ])
      .then(([cat, cli, bill, usr, rol, dept, pstat, astat]) => {
        if (cancelled) return;
        setCategories(cat.data);
        setClients(cli.data);
        setBillingTypes(bill.data);
        setUsers(usr.data.map((u) => ({ ...u, name: `${u.firstName} ${u.lastName}`.trim() })));
        setRoles(rol.data);
        setDepartments(dept.data);
        setProjectStatuses(pstat.data);
        setApprovalStatuses(astat.data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { categories, clients, billingTypes, users, roles, departments, projectStatuses, approvalStatuses, loading, error };
}

export const findName = (list, id) => list.find((x) => x.id === Number(id))?.name || "—";

export const userLabel = (users, id) => {
  const u = users.find((x) => x.id === Number(id));
  return u ? `${u.firstName} ${u.lastName}` : "—";
};

// App-wide date display standard: yyyy-MM-dd everywhere (Add/Edit forms,
// View screens, API payloads, validation messages) — no locale-formatted
// "15 Jan 2026" style dates anywhere in the UI.
export const fmtDate = (d) => (d ? String(d).slice(0, 10) : "—");