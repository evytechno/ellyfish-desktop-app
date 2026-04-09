import { secureStorage } from './secureStorage';

const TOKEN_KEYS = ['access_token', 'refresh_token', 'user', 'statusNames', 'device_name'];

export const checkAuth = () => {
  // Still read from localStorage for sync check (tokens mirrored there for quick access)
  const token = localStorage.getItem("access_token");
  if (!token) return false;

  const currentUser = JSON.parse(localStorage.getItem("user") || 'null');
  return currentUser ? currentUser : false;
};

export const logoutUser = async () => {
  // Clear from secure storage (OS keychain)
  await secureStorage.clear(TOKEN_KEYS);

  // Also clear localStorage mirror
  TOKEN_KEYS.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('last_location');
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
};

/**
 * Load tokens from secure storage into localStorage on app start
 * Call this once on app mount to restore session
 */
export const restoreSession = async () => {
  const accessToken  = await secureStorage.get('access_token');
  const refreshToken = await secureStorage.get('refresh_token');
  const user         = await secureStorage.get('user');

  if (accessToken)  localStorage.setItem('access_token',  accessToken);
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
  if (user)         localStorage.setItem('user',          user);

  return !!accessToken;
};
