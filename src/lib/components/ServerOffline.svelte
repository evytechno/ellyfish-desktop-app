<script>
  import { isOnline, isServerReachable, startNetworkMonitor } from '$lib/stores/network';
  import { onMount } from 'svelte';

  let retrying = false;

  onMount(() => startNetworkMonitor());

  async function retry() {
    retrying = true;
    // Force a re-check
    const { checkServer } = await import('$lib/stores/network');
    await new Promise(r => setTimeout(r, 1000));
    retrying = false;
  }

  $: show = !$isOnline || !$isServerReachable;
</script>

{#if show}
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
      <!-- Icon -->
      <div class="flex justify-center mb-4">
        <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          {#if !$isOnline}
            <i class="ti ti-wifi-off text-3xl text-red-500"></i>
          {:else}
            <i class="ti ti-server-off text-3xl text-red-500"></i>
          {/if}
        </div>
      </div>

      <!-- Title -->
      <h2 class="text-xl font-bold text-gray-800 mb-2">
        {#if !$isOnline}
          No Internet Connection
        {:else}
          Server Unreachable
        {/if}
      </h2>

      <!-- Message -->
      <p class="text-gray-500 text-sm mb-6">
        {#if !$isOnline}
          Please check your network connection and try again.
        {:else}
          Cannot connect to the server at <br />
          <span class="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
            {import.meta.env.VITE_PUBLIC_API_URL}
          </span>
          <br /><br />
          Please ensure the server is running.
        {/if}
      </p>

      <!-- Retry Button -->
      <button
        on:click={retry}
        disabled={retrying}
        class="w-full py-2.5 px-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {#if retrying}
          <i class="ti ti-loader-2 animate-spin"></i> Checking...
        {:else}
          <i class="ti ti-refresh"></i> Retry Connection
        {/if}
      </button>
    </div>
  </div>
{/if}
