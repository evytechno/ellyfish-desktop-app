/** Admin module keys. Default for every key is `none` — only explicit view/full grants access. */
export const MODULE_GROUPS = [
  {
    label: "Orders",
    modules: [
      { key: "orders", label: "Orders" },
      { key: "invoices", label: "Invoices (PI + TAX)" },
      { key: "work_order", label: "Work Order (WO)" },
      { key: "order_payments", label: "Order Payments" },
      { key: "transfer_orders", label: "Transfer Orders" },
    ],
  },
  {
    label: "Clients",
    modules: [
      { key: "clients", label: "Clients" },
      { key: "client_visits", label: "Client Visits" },
    ],
  },
  {
    label: "Queries",
    modules: [{ key: "queries", label: "Queries" }],
  },
  {
    label: "Finance",
    modules: [{ key: "user_payments", label: "Employee Payments" }],
  },
  {
    label: "Inventory",
    modules: [
      { key: "stock", label: "Stock" },
      { key: "category", label: "Category" },
    ],
  },
  {
    label: "Reports",
    modules: [
      { key: "reports", label: "Reports" },
      { key: "pi_sales", label: "PI Sales" },
    ],
  },
  {
    label: "System",
    modules: [
      { key: "users", label: "Users" },
      { key: "history", label: "History" },
    ],
  },
];

export function allNoneModulePermissions() {
  const perms = {};
  for (const group of MODULE_GROUPS) {
    for (const mod of group.modules) perms[mod.key] = "none";
  }
  return perms;
}

/** Merge saved map onto all-none defaults. Missing keys stay none (never inherit full). */
export function normalizeModulePermissions(saved) {
  const next = allNoneModulePermissions();
  if (!saved || typeof saved !== "object") return next;
  for (const key of Object.keys(next)) {
    const val = saved[key];
    if (val === "view" || val === "full" || val === "none") next[key] = val;
  }
  return next;
}
