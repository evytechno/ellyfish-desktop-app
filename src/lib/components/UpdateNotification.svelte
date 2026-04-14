<script>
  import { onMount } from 'svelte';
  import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
  import { relaunch } from '@tauri-apps/api/process';

  let updateAvailable = false;
  let updateManifest = null;
  let installing = false;
  let checking = false;
  let statusMsg = '';   // 'up-to-date' | 'error' | ''
  let errorDetail = '';

  async function doCheckUpdate(manual = false) {
    if (!window.__TAURI__) return;
    if (import.meta.env.DEV) return;

    if (manual) {
      checking = true;
      statusMsg = '';
      errorDetail = '';
    }

    try {
      const { shouldUpdate, manifest } = await checkUpdate();
      if (shouldUpdate) {
        updateAvailable = true;
        updateManifest = manifest;
        statusMsg = '';
      } else if (manual) {
        statusMsg = 'up-to-date';
      }
    } catch (e) {
      if (manual) {
        statusMsg = 'error';
        errorDetail = typeof e === 'string' ? e : (e?.message || 'Could not reach update server');
      }
    } finally {
      if (manual) checking = false;
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
    } catch (e) {
      installing = false;
    }
  }

  function dismiss() {
    updateAvailable = false;
  }

  function dismissStatus() {
    statusMsg = '';
    errorDetail = '';
  }
</script>

<!-- Manual check button — fixed bottom-left -->
<div class="fixed bottom-5 left-5 z-[9997]">
  <button
    on:click={() => doCheckUpdate(true)}
    disabled={checking}
    title="Check for updates"
    class="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-800 disabled:bg-gray-400 text-white text-xs font-medium rounded-lg shadow transition-colors"
  >
    <i class="ti ti-refresh {checking ? 'animate-spin' : ''}"></i>
    {checking ? 'Checking...' : 'Check for Updates'}
  </button>

  <!-- Status feedback -->
  {#if statusMsg === 'up-to-date'}
    <div class="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-lg shadow">
      <i class="ti ti-circle-check"></i>
      <span>You are on the latest version</span>
      <button on:click={dismissStatus} class="ml-auto text-green-500 hover:text-green-700">
        <i class="ti ti-x text-xs"></i>
      </button>
    </div>
  {/if}

  {#if statusMsg === 'error'}
    <div class="mt-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg shadow max-w-xs">
      <div class="flex items-center gap-2">
        <i class="ti ti-alert-circle"></i>
        <span class="font-semibold">Update check failed</span>
        <button on:click={dismissStatus} class="ml-auto text-red-400 hover:text-red-600">
          <i class="ti ti-x text-xs"></i>
        </button>
      </div>
      {#if errorDetail}
        <p class="mt-1 text-red-600 break-words">{errorDetail}</p>
      {/if}
    </div>
  {/if}
</div>

<!-- Update available popup — fixed bottom-right -->
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
        <p class="text-sm font-semibold text-gray-700">Version {updateManifest.version}</p>
        {#if updateManifest.body}
          <p class="text-xs text-gray-500 mt-1 max-h-20 overflow-y-auto">{updateManifest.body}</p>
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
