/**
 * App User job-role → ShipMate permission / notification presets.
 * Used by CRM add/edit when role changes.
 */

/** @typedef {'factory' | 'office' | 'sales' | 'installation' | 'manager' | 'admin'} AppUserRole */

/**
 * @param {string} role
 * @returns {Record<string, boolean>}
 */
export function permissionsForAppRole(role) {
  const r = String(role || "office").toLowerCase();
  const off = {
    sample_view: false,
    sample_update: false,
    sample_hold: false,
    work_order_view: false,
    work_order_update: false,
    work_order_hold: false,
    installation_view: false,
    installation_update: false,
  };
  if (r === "admin") {
    return {
      sample_view: true,
      sample_update: true,
      sample_hold: true,
      work_order_view: true,
      work_order_update: true,
      work_order_hold: true,
      installation_view: true,
      installation_update: true,
    };
  }
  if (r === "installation" || r === "manager") {
    return {
      ...off,
      installation_view: true,
      installation_update: true,
    };
  }
  if (r === "factory") {
    return {
      ...off,
      sample_view: true,
      sample_update: true,
      sample_hold: true,
      work_order_view: true,
      work_order_update: true,
      work_order_hold: true,
    };
  }
  if (r === "sales") {
    return {
      ...off,
      sample_view: true,
      work_order_view: true,
    };
  }
  // office — samples + work orders (installation owned by Manager)
  return {
    sample_view: true,
    sample_update: true,
    sample_hold: true,
    work_order_view: true,
    work_order_update: true,
    work_order_hold: true,
    installation_view: false,
    installation_update: false,
  };
}

/**
 * @param {string} role
 */
export function notificationPrefsForAppRole(role) {
  const r = String(role || "office").toLowerCase();
  if (r === "admin") {
    return {
      enabled: true,
      sample: true,
      workOrder: true,
      installation: true,
    };
  }
  if (r === "manager") {
    return {
      enabled: true,
      sample: false,
      workOrder: false,
      installation: true,
    };
  }
  if (r === "installation") {
    return {
      enabled: true,
      sample: false,
      workOrder: true,
      installation: true,
    };
  }
  if (r === "factory") {
    return {
      enabled: true,
      sample: true,
      workOrder: true,
      installation: false,
    };
  }
  if (r === "sales") {
    return {
      enabled: true,
      sample: true,
      workOrder: true,
      installation: false,
    };
  }
  return {
    enabled: true,
    sample: true,
    workOrder: true,
    installation: false,
  };
}

export const APP_ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
    hint: "Full access — all modules & all notifications",
  },
  {
    value: "office",
    label: "Office",
    hint: "Samples & work orders",
  },
  {
    value: "factory",
    label: "Factory",
    hint: "Samples & work orders",
  },
  {
    value: "sales",
    label: "Sales",
    hint: "View samples & work orders",
  },
  {
    value: "manager",
    label: "Manager",
    hint: "Installation only — receives install notifications",
  },
  {
    value: "installation",
    label: "Installation",
    hint: "Installation Head — link a workshop employee",
  },
];
