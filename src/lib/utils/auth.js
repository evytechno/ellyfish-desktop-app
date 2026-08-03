import { secureStorage } from './secureStorage';

const TOKEN_KEYS = ['access_token', 'refresh_token', 'user', 'statusNames', 'device_name', 'pending_user_id', 'available_roles', 'role_permissions'];

export const checkAuth = () => {
  // Still read from localStorage for sync check (tokens mirrored there for quick access)
  const token = localStorage.getItem("access_token");
  if (!token) return false;

  const currentUser = JSON.parse(localStorage.getItem("user") || 'null');
  return currentUser ? currentUser : false;
};

const PRESERVE_KEYS = ["device_name", "last_email", "last_password"];

export const logoutUser = async () => {
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

  // Store available roles and permissions for Switch Role button / role picker
  const userRoles = data.user?.roles ?? [data.user?.role];
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
 * - master/manager/user roles: always true (they use role-based guards)
 * - admin with null modulePermissions: full access
 * - admin with modulePermissions: check the key for 'view' or 'full'
 * @param {string} moduleKey - e.g. 'orders', 'clients', 'queries'
 * @param {'view'|'full'} level - minimum required level (default 'view')
 * @param {object|null} user - pass explicitly or leave null to read from localStorage
 */
export const canAccess = (moduleKey, level = 'view', user = null) => {
  const u = user ?? checkAuth();
  if (!u) return false;
  if (u.role !== 'admin') return true;
  if (!u.modulePermissions) return true; // null = full access

  const access = u.modulePermissions[moduleKey];
  if (!access || access === 'none') return false;
  if (level === 'full') return access === 'full';
  return true; // 'view' or 'full' satisfies 'view'
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

    return !!accessToken;
  } catch {
    // Keychain unavailable (app just updated, OS locked, etc.) — fall back to
    // whatever is already in localStorage so the session survives if possible.
    return !!localStorage.getItem('access_token');
  }
};
