<script>
  import { onMount } from 'svelte';
  import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
  import { relaunch } from '@tauri-apps/api/process';

  let updateAvailable = false;
  let updateManifest = null;
  let installing = false;

  async function doCheckUpdate() {
    if (!window.__TAURI__) return;
    if (import.meta.env.DEV) return;
    try {
      const { shouldUpdate, manifest } = await checkUpdate();
      if (shouldUpdate) {
        updateAvailable = true;
        updateManifest = manifest;
      }
    } catch (_) {
      // silently ignore — network unavailable, no release found, endpoint unreachable
    }
  }

  onMount(() => {
    doCheckUpdate();
    const retryTimer = setTimeout(doCheckUpdate, 30000);
    return () => clearTimeout(retryTimer);
  });

  async function install() {
    installing = true;
    try {
      await installUpdate();
      await relaunch();
    } catch (_) {
      installing = false;
    }
  }

  function dismiss() {
    updateAvailable = false;
  }
</script>

{#if updateAvailable}
  <div class="fixed bottom-5 right-5 z-[9998] w-80 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
    <!-- Header -->
    <div class="bg-blue-500 px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i class="ti ti-refresh text-white text-lg"></i>
        <span class="text-white font-semibold text-sm">Update Available</span>
      </div>
      <button on:click={dismiss} class="text-white/80 hover:text-white">
        <i class="ti ti-x text-sm"></i>
      </button>
    </div>

    <!-- Body -->
    <div class="px-4 py-3">
      {#if updateManifest}
        <p class="text-sm font-semibold text-gray-700">
          Version {updateManifest.version}
        </p>
        {#if updateManifest.body}
          <p class="text-xs text-gray-500 mt-1 max-h-20 overflow-y-auto">
            {updateManifest.body}
          </p>
        {/if}
      {/if}
    </div>

    <!-- Actions -->
    <div class="px-4 pb-4 flex gap-2">
      <button
        on:click={install}
        disabled={installing}
        class="flex-1 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-1"
      >
        {#if installing}
          <i class="ti ti-loader-2 animate-spin text-sm"></i> Installing...
        {:else}
          <i class="ti ti-download text-sm"></i> Install & Restart
        {/if}
      </button>
      <button
        on:click={dismiss}
        class="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        Later
      </button>
    </div>
  </div>
{/if}
