import { secureStorage } from './secureStorage';
import { setAuthUser } from '$lib/stores/auth';
import { resetUsersAllStore } from '$lib/stores/dataStores';

const TOKEN_KEYS = [
  'access_token', 'refresh_token', 'user', 'statusNames', 'device_name',
  'pending_user_id', 'available_roles', 'role_permissions',
  'impersonator_access_token', 'impersonator_refresh_token', 'impersonator_user',
  'impersonator_available_roles', 'impersonator_role_permissions',
];

const IMPERSONATOR_KEYS = [
  'impersonator_access_token',
  'impersonator_refresh_token',
  'impersonator_user',
  'impersonator_available_roles',
  'impersonator_role_permissions',
];

export function parseJwtPayload() {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    return JSON.parse(atob(base64 + "=".repeat(pad)));
  } catch {
    return null;
  }
}

/** Admin sales-user scope. JWT is source of truth after role switch. */
export function getAllowedSalesUserIds(user) {
  const payload = parseJwtPayload();
  const role = payload?.role ?? user?.role;
  if (role !== "admin") return null;
  const jwtIds = payload?.allowedSalesUserIds;
  const userIds = user?.allowedSalesUserIds;
  const raw = Array.isArray(jwtIds) && jwtIds.length
    ? jwtIds
    : (Array.isArray(userIds) && userIds.length ? userIds : null);
  if (!raw) return null;
  const ids = raw.map(Number).filter(Number.isFinite);
  return ids.length ? ids : null;
}

/** Real names: master always; admin only for ids in allowedSalesUserIds (or all if unrestricted). */
export function canSeeSalesUserName(user, targetUserId) {
  if (!user) return false;
  if (user.role === "master") return true;
  const role = parseJwtPayload()?.role ?? user.role;
  if (role !== "admin") return false;
  const allowed = getAllowedSalesUserIds(user);
  if (!allowed?.length) return true;
  return allowed.includes(Number(targetUserId));
}

export const checkAuth = () => {
  // Still read from localStorage for sync check (tokens mirrored there for quick access)
  const token = localStorage.getItem("access_token");
  if (!token) return false;

  const currentUser = JSON.parse(localStorage.getItem("user") || 'null');
  if (!currentUser) return false;
  currentUser.allowedSalesUserIds = getAllowedSalesUserIds(currentUser);
  const payload = parseJwtPayload();
  if (payload && Object.prototype.hasOwnProperty.call(payload, "modulePermissions")) {
    currentUser.modulePermissions = payload.modulePermissions ?? null;
  }
  currentUser.canViewAdmins = payload?.role === "admin" && payload?.canViewAdmins === true;
  return currentUser;
};

const PRESERVE_KEYS = ["device_name", "last_email", "last_password"];

export const logoutUser = async () => {
  resetUsersAllStore();
  setAuthUser(null);
  // Clear from secure storage (OS keychain)
  await secureStorage.clear(TOKEN_KEYS);

  // Clear all localStorage except preserved keys
  const preserved = {};
  PRESERVE_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) preserved[k] = v;
  });
  localStorage.clear();
  Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
};

/**
 * Save session tokens securely after login
 * Stores in OS keychain AND mirrors to localStorage for sync reads
 */
export const saveSession = async (data) => {
  // Save to OS keychain (secure)
  await secureStorage.set('access_token',  data.access_token);
  await secureStorage.set('refresh_token', data.refresh_token);
  await secureStorage.set('user',          JSON.stringify(data.user));

  // Mirror to localStorage for sync reads (non-sensitive display data)
  localStorage.setItem('access_token',  data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user',          JSON.stringify(data.user));

  // Keep the reactive store in sync so components update immediately
  setAuthUser(data.user);

  resetUsersAllStore();

  // Store available roles and permissions for Switch Role button / role picker
  const userRoles = data.user?.roles?.length ? data.user.roles : [data.user?.role];
  localStorage.setItem('available_roles', JSON.stringify(userRoles));
  if (data.user?.rolePermissions) {
    localStorage.setItem('role_permissions', JSON.stringify(data.user.rolePermissions));
  }
};

/**
 * Save pending role selection state (between login and role picker)
 */
export const savePendingRoleSelection = (userId, roles, rolePermissions) => {
  localStorage.setItem('pending_user_id',  String(userId));
  localStorage.setItem('available_roles',  JSON.stringify(roles));
  if (rolePermissions) {
    localStorage.setItem('role_permissions', JSON.stringify(rolePermissions));
  }
};

/**
 * Clear pending role selection state
 */
export const clearPendingRoleSelection = () => {
  localStorage.removeItem('pending_user_id');
};

/**
 * Get available roles for the current session (for Switch Role button)
 */
export const getAvailableRoles = () => {
  try { return JSON.parse(localStorage.getItem('available_roles') || '[]'); }
  catch { return []; }
};

export const getRolePermissions = () => {
  try { return JSON.parse(localStorage.getItem('role_permissions') || 'null'); }
  catch { return null; }
};

/**
 * Check if the current user can access a module.
 * - master/manager/user: always true (role-based guards)
 * - admin: default none; only keys set to view/full are allowed
 * @param {string} moduleKey
 * @param {'view'|'full'} level
 * @param {object|null} user
 */
export const canAccess = (moduleKey, level = 'view', user = null) => {
  const u = user ?? checkAuth();
  if (!u) return false;
  if (u.role !== 'admin') return true;
  if (moduleKey === 'group_chat') return true;

  const payload = parseJwtPayload();
  const perms = payload?.modulePermissions ?? u.modulePermissions;
  if (!perms || typeof perms !== 'object') return false;

  const access = perms[moduleKey];
  if (!access || access === 'none') return false;
  if (level === 'full') return access === 'full';
  return access === 'view' || access === 'full';
};

/**
 * Media library: master/admin/manager and query sub-roles (telecaller, tech, tech helper).
 * Plain `user` with no subRole has no query/media access.
 */
export const canUseMediaLibrary = (user = null) => {
  const u = user ?? checkAuth();
  if (!u) return false;
  if (u.role === "user" && !u.subRole) return false;
  if (["master", "admin", "manager"].includes(u.role)) return true;
  return ["telecaller", "tech", "tech_helper"].includes(u.subRole);
};

/**
 * Queue a welcome toast to show after login (consumed by admin layout).
 */
export const setLoginWelcome = (message) => {
  try {
    sessionStorage.setItem("login_welcome", message);
  } catch (_) {}
};

/**
 * Read and clear the pending login welcome message.
 */
export const consumeLoginWelcome = () => {
  try {
    const msg = sessionStorage.getItem("login_welcome");
    if (msg) sessionStorage.removeItem("login_welcome");
    return msg || "";
  } catch (_) {
    return "";
  }
};

export function isImpersonating() {
  try {
    return !!localStorage.getItem('impersonator_user');
  } catch {
    return false;
  }
}

export function getImpersonatorUser() {
  try {
    const raw = localStorage.getItem('impersonator_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function canSwitchUser(user = null) {
  const u = user ?? checkAuth();
  if (isImpersonating()) return true;
  return u?.role === 'master';
}

async function persistImpersonatorSession() {
  if (isImpersonating()) return;
  const access = localStorage.getItem('access_token') || '';
  const refresh = localStorage.getItem('refresh_token') || '';
  const user = localStorage.getItem('user') || '';
  const roles = localStorage.getItem('available_roles') || '';
  const perms = localStorage.getItem('role_permissions') || '';
  if (!access || !refresh || !user) return;

  await secureStorage.set('impersonator_access_token', access);
  await secureStorage.set('impersonator_refresh_token', refresh);
  await secureStorage.set('impersonator_user', user);
  if (roles) await secureStorage.set('impersonator_available_roles', roles);
  if (perms) await secureStorage.set('impersonator_role_permissions', perms);

  localStorage.setItem('impersonator_access_token', access);
  localStorage.setItem('impersonator_refresh_token', refresh);
  localStorage.setItem('impersonator_user', user);
  if (roles) localStorage.setItem('impersonator_available_roles', roles);
  if (perms) localStorage.setItem('impersonator_role_permissions', perms);
}

async function clearImpersonatorSession() {
  await secureStorage.clear(IMPERSONATOR_KEYS);
  IMPERSONATOR_KEYS.forEach((k) => localStorage.removeItem(k));
}

/** Replace the current session with the target user, keeping master tokens for switch-back. */
export async function beginImpersonation(data) {
  await persistImpersonatorSession();
  await saveSession(data);
}

/** Restore the original master session. */
export async function endImpersonation() {
  let access = localStorage.getItem('impersonator_access_token');
  let refresh = localStorage.getItem('impersonator_refresh_token');
  let userRaw = localStorage.getItem('impersonator_user');
  let roles = localStorage.getItem('impersonator_available_roles');
  let perms = localStorage.getItem('impersonator_role_permissions');

  if (!access) access = await secureStorage.get('impersonator_access_token').catch(() => null);
  if (!refresh) refresh = await secureStorage.get('impersonator_refresh_token').catch(() => null);
  if (!userRaw) userRaw = await secureStorage.get('impersonator_user').catch(() => null);
  if (!roles) roles = await secureStorage.get('impersonator_available_roles').catch(() => null);
  if (!perms) perms = await secureStorage.get('impersonator_role_permissions').catch(() => null);

  if (!access || !refresh || !userRaw) {
    throw new Error('Original master session is missing. Please sign in again.');
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error('Original master session is invalid. Please sign in again.');
  }

  await saveSession({ access_token: access, refresh_token: refresh, user });
  if (roles) localStorage.setItem('available_roles', roles);
  else localStorage.removeItem('available_roles');
  if (perms) localStorage.setItem('role_permissions', perms);
  else localStorage.removeItem('role_permissions');

  await clearImpersonatorSession();
  return user;
}

/**
 * Load tokens from secure storage into localStorage on app start
 * Call this once on app mount to restore session
 */
export const restoreSession = async () => {
  try {
    const accessToken  = await secureStorage.get('access_token');
    const refreshToken = await secureStorage.get('refresh_token');
    const user         = await secureStorage.get('user');

    if (accessToken)  localStorage.setItem('access_token',  accessToken);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (user)         localStorage.setItem('user',          user);

    for (const key of IMPERSONATOR_KEYS) {
      const value = await secureStorage.get(key).catch(() => null);
      if (value) localStorage.setItem(key, value);
    }

    // Populate the reactive store so components that subscribe to authUser
    // get the correct value immediately after session restore
    if (user) {
      try { setAuthUser(JSON.parse(user)); } catch (_) {}
    }

    return !!accessToken;
  } catch {
    // Keychain unavailable — fall back to localStorage
    const user = localStorage.getItem('user');
    if (user) {
      try { setAuthUser(JSON.parse(user)); } catch (_) {}
    }
    return !!localStorage.getItem('access_token');
  }
};
