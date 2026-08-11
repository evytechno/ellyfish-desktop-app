/**
 * Secure storage utility
 *
 * In Tauri (desktop): uses OS keychain via Rust keyring crate
 *   → Windows Credential Manager
 *
 * In browser (dev/fallback): falls back to localStorage
 */

// __TAURI_INTERNALS__ is the Tauri v2 global injected into the webview.
// Check for it specifically — __TAURI__ alone doesn't guarantee invoke is ready.
const isTauri =
  typeof window !== 'undefined' &&
  typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';

async function invoke(cmd: string, args: object): Promise<any> {
  return (window as any).__TAURI_INTERNALS__.invoke(cmd, args);
}

export const secureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (isTauri) {
      try {
        await invoke('secure_set', { key, value });
        return;
      } catch {
        // Keychain unavailable — fall through to localStorage
      }
    }
    localStorage.setItem(key, value);
  },

  async get(key: string): Promise<string | null> {
    if (isTauri) {
      try {
        return await invoke('secure_get', { key });
      } catch {
        // Keychain unavailable — fall through to localStorage
      }
    }
    return localStorage.getItem(key);
  },

  async delete(key: string): Promise<void> {
    if (isTauri) {
      try {
        await invoke('secure_delete', { key });
      } catch {
        // Keychain unavailable — fall through to localStorage
      }
    }
    localStorage.removeItem(key);
  },

  async clear(keys: string[]): Promise<void> {
    await Promise.all(keys.map(k => this.delete(k)));
  },
};
