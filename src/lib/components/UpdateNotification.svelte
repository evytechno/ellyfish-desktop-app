<script>
  import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
  import { relaunch } from '@tauri-apps/api/process';

  // states: idle | checking | available | installing | latest | error
  let state = 'idle';
  let manifest = null;
  let errorMsg = '';

  async function handleCheck() {
    if (!window.__TAURI__) return;
    if (import.meta.env.DEV) { state = 'latest'; autoReset(); return; }

    state = 'checking';
    errorMsg = '';
    manifest = null;

    try {
      const result = await checkUpdate();
      if (result.shouldUpdate) {
        state = 'available';
        manifest = result.manifest;
      } else {
        state = 'latest';
        autoReset();
      }
    } catch (e) {
      state = 'error';
      errorMsg = typeof e === 'string' ? e : (e?.message || 'Could not reach update server');
      autoReset(5000);
    }
  }

  async function handleInstall() {
    state = 'installing';
    try {
      await installUpdate();
      await relaunch();
    } catch (e) {
      state = 'error';
      errorMsg = typeof e === 'string' ? e : (e?.message || 'Installation failed. Try again.');
      autoReset(5000);
    }
  }

  function autoReset(ms = 3000) {
    setTimeout(() => { state = 'idle'; errorMsg = ''; manifest = null; }, ms);
  }
</script>

<!-- Trigger button -->
<button
  on:click={state === 'available' ? handleInstall : handleCheck}
  disabled={state === 'checking' || state === 'installing'}
  title="Check for updates"
  class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200
    {state === 'available'  ? 'bg-blue-500 border-blue-500 text-white hover:bg-blue-600 animate-pulse' :
     state === 'installing' ? 'bg-blue-100 border-blue-300 text-blue-700 cursor-not-allowed' :
     state === 'checking'   ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' :
     state === 'latest'     ? 'bg-green-50 border-green-300 text-green-700' :
     state === 'error'      ? 'bg-red-50 border-red-300 text-red-600' :
                              'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}"
>
  {#if state === 'checking'}
    <i class="ti ti-loader-2 animate-spin text-sm"></i>
    <span>Checking...</span>

  {:else if state === 'available'}
    <i class="ti ti-download text-sm"></i>
    <span>Install v{manifest?.version} & Restart</span>

  {:else if state === 'installing'}
    <i class="ti ti-loader-2 animate-spin text-sm"></i>
    <span>Installing...</span>

  {:else if state === 'latest'}
    <i class="ti ti-circle-check text-sm"></i>
    <span>Up to date</span>

  {:else if state === 'error'}
    <i class="ti ti-alert-circle text-sm"></i>
    <span title={errorMsg}>Update failed</span>

  {:else}
    <i class="ti ti-refresh text-sm"></i>
    <span>Check for Updates</span>
  {/if}
</button>

<!-- Error detail tooltip shown below button -->
{#if state === 'error' && errorMsg}
  <p class="mt-1 text-xs text-red-500 max-w-xs break-words">{errorMsg}</p>
{/if}
