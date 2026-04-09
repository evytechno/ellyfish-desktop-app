/**
 * Secure storage utility
 *
 * In Tauri (desktop): uses OS keychain via Rust keyring crate
 *   → Windows Credential Manager
 *
 * In browser (dev/fallback): falls back to localStorage
 */

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;

async function invoke(cmd: string, args: object): Promise<any> {
  const { invoke } = await import('@tauri-apps/api/tauri');
  return invoke(cmd, args);
}

export const secureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (isTauri) {
      await invoke('secure_set', { key, value });
    } else {
      localStorage.setItem(key, value);
    }
  },

  async get(key: string): Promise<string | null> {
    if (isTauri) {
      return await invoke('secure_get', { key });
    }
    return localStorage.getItem(key);
  },

  async delete(key: string): Promise<void> {
    if (isTauri) {
      await invoke('secure_delete', { key });
    } else {
      localStorage.removeItem(key);
    }
  },

  async clear(keys: string[]): Promise<void> {
    await Promise.all(keys.map(k => this.delete(k)));
  },
};
