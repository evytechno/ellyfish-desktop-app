/**
 * App User job-role → ShipMate permission / notification presets.
 * Used by CRM add/edit when role changes.
 */

/** @typedef {'factory' | 'office' | 'sales' | 'installation'} AppUserRole */

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
  if (r === "installation") {
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
  // office — full app access by default
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

/**
 * @param {string} role
 */
export function notificationPrefsForAppRole(role) {
  const r = String(role || "office").toLowerCase();
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
    installation: true,
  };
}

export const APP_ROLE_OPTIONS = [
  {
    value: "office",
    label: "Office",
    hint: "Samples, work orders & installation",
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
    value: "installation",
    label: "Installation",
    hint: "Installation only — link a workshop employee",
  },
];
