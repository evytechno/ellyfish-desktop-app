/**
 * Secure storage utility
 *
 * In Tauri (desktop): uses the session file via Rust commands
 * In browser (dev/fallback): uses localStorage
 *
 * Tauri availability is checked at call time — the webview may inject
 * __TAURI_INTERNALS__ after this module first loads.
 */

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function'
  );
}

async function invoke(cmd: string, args: object): Promise<any> {
  return (window as any).__TAURI_INTERNALS__.invoke(cmd, args);
}

export const secureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (isTauri()) {
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
    if (isTauri()) {
      try {
        const value = await invoke('secure_get', { key });
        if (value != null && value !== '') return value;
      } catch {
        // Keychain unavailable — fall through to localStorage
      }
    }
    return localStorage.getItem(key);
  },

  async delete(key: string): Promise<void> {
    if (isTauri()) {
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
