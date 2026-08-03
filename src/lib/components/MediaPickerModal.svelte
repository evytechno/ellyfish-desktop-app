<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  /** Max items user can select (remaining slots) */
  export let maxSelect = 5;
  /** Whether the modal is open */
  export let open = false;

  const dispatch = createEventDispatcher();

  let items = [];
  let loading = false;
  let search = "";
  let typeFilter = "all";
  let page = 1;
  let total = 0;
  let limit = 24;
  let selected = new Map(); // id -> { url, name, mime }
  let searchTimeout;
  let wasOpen = false;

  $: totalPages = Math.max(1, Math.ceil(total / limit));
  $: selectedCount = selected.size;

  $: if (open && !wasOpen) {
    wasOpen = true;
    selected = new Map();
    search = "";
    typeFilter = "all";
    page = 1;
    loadMedia();
  } else if (!open && wasOpen) {
    wasOpen = false;
  }

  async function loadMedia() {
    loading = true;
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: search || "",
        type: typeFilter || "all",
        sort: "createdAt",
        sortDir: "desc",
      });
      const data = await authApiFetch(`${API_ROUTES.MEDIA}?${q}`);
      items = data?.data ?? [];
      total = data?.total ?? 0;
    } catch (_) {
      items = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  function onSearchInput(e) {
    clearTimeout(searchTimeout);
    const v = e.target.value;
    searchTimeout = setTimeout(() => {
      search = v;
      page = 1;
      loadMedia();
    }, 300);
  }

  function onTypeChange() {
    page = 1;
    loadMedia();
  }

  function fileUrl(item) {
    if (!item?.url) return "";
    if (item.url.startsWith("http")) return item.url;
    return `${ATTACHMENT_BASE_URL}${item.url}`;
  }

  function isSelected(id) {
    return selected.has(id);
  }

  function toggle(item) {
    if (selected.has(item.id)) {
      selected.delete(item.id);
      selected = selected;
      return;
    }
    if (selected.size >= maxSelect) return;
    selected.set(item.id, {
      url: item.url,
      name: item.name,
      mime: item.mimeType || (item.type === "pdf" ? "application/pdf" : "image/jpeg"),
    });
    selected = selected;
  }

  function confirm() {
    dispatch("confirm", Array.from(selected.values()));
    close();
  }

  function close() {
    open = false;
    selected = new Map();
    dispatch("close");
  }

  function shortName(name) {
    if (!name) return "";
    if (name.length <= 22) return name;
    return name.slice(0, 10) + "…" + name.slice(-8);
  }
</script>

{#if open}
  <div class="mpm-backdrop" on:click|self={close} role="presentation">
    <div class="mpm-modal" role="dialog" aria-modal="true" aria-label="Select from Media">
      <div class="mpm-head">
        <div>
          <div class="mpm-title">Media Library</div>
          <div class="mpm-sub">Select up to {maxSelect} file{maxSelect === 1 ? "" : "s"}</div>
        </div>
        <button type="button" class="mpm-close" on:click={close} title="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="mpm-tools">
        <div class="input-icon input-icon-start position-relative mpm-search">
          <span class="input-icon-addon"><i class="ti ti-search"></i></span>
          <input
            type="text"
            class="form-control form-control-sm"
            placeholder="Search media…"
            value={search}
            on:input={onSearchInput}
          />
        </div>
        <select class="form-select form-select-sm mpm-type" bind:value={typeFilter} on:change={onTypeChange}>
          <option value="all">All</option>
          <option value="image">Images</option>
          <option value="pdf">PDFs</option>
        </select>
        <span class="mpm-count">{selectedCount}/{maxSelect} selected</span>
      </div>

      <div class="mpm-body">
        {#if loading}
          <div class="mpm-empty"><span class="spinner-border spinner-border-sm text-primary"></span></div>
        {:else if items.length === 0}
          <div class="mpm-empty"><i class="ti ti-photo-off"></i><span>No media found</span></div>
        {:else}
          <div class="mpm-grid">
            {#each items as item (item.id)}
              {@const on = isSelected(item.id)}
              <button
                type="button"
                class="mpm-tile {on ? 'is-on' : ''} {!on && selectedCount >= maxSelect ? 'is-disabled' : ''}"
                on:click={() => toggle(item)}
                disabled={!on && selectedCount >= maxSelect}
              >
                <div class="mpm-thumb">
                  {#if item.type === "image"}
                    <img src={fileUrl(item)} alt={item.name} loading="lazy" />
                  {:else}
                    <i class="ti ti-file-type-pdf"></i>
                  {/if}
                  {#if on}
                    <span class="mpm-check"><i class="ti ti-check"></i></span>
                  {/if}
                </div>
                <div class="mpm-name" title={item.name}>{shortName(item.name)}</div>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="mpm-foot">
        <div class="mpm-pager">
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled={page <= 1 || loading} on:click={() => { page -= 1; loadMedia(); }}>
            <i class="ti ti-chevron-left"></i>
          </button>
          <span>Page {page}/{totalPages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" disabled={page >= totalPages || loading} on:click={() => { page += 1; loadMedia(); }}>
            <i class="ti ti-chevron-right"></i>
          </button>
        </div>
        <div class="mpm-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary" on:click={close}>Cancel</button>
          <button type="button" class="btn btn-sm btn-primary" disabled={selectedCount === 0} on:click={confirm}>
            Add {selectedCount || ""} file{selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .mpm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1080;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .mpm-modal {
    width: min(720px, 100%);
    max-height: min(82vh, 640px);
    background: #fff;
    border-radius: 10px;
    border: 1px solid #e9ecef;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.45;
  }
  .mpm-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid #f1f3f5;
  }
  .mpm-title { font-size: 14px; font-weight: 600; color: #212529; }
  .mpm-sub { font-size: 11px; color: #868e96; margin-top: 2px; }
  .mpm-close {
    width: 28px; height: 28px; padding: 0;
    border: 1px solid #dee2e6; border-radius: 6px; background: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    color: #868e96; cursor: pointer;
  }
  .mpm-tools {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 10px 14px; border-bottom: 1px solid #f1f3f5;
  }
  .mpm-search { flex: 1; min-width: 160px; }
  .mpm-search :global(.form-control) {
    height: 28px !important; min-height: 28px !important;
    font-size: 11.5px !important; padding-left: 30px !important;
  }
  .mpm-type { width: 110px; height: 28px !important; font-size: 11.5px !important; }
  .mpm-count { font-size: 11px; color: #868e96; margin-left: auto; }
  .mpm-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px; }
  .mpm-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px; padding: 40px 12px; color: #adb5bd;
  }
  .mpm-empty i { font-size: 22px; }
  .mpm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .mpm-tile {
    border: 1px solid #e9ecef;
    border-radius: 8px;
    background: #fff;
    padding: 0;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .mpm-tile:hover { border-color: #adb5bd; }
  .mpm-tile.is-on { border-color: #3b5bdb; box-shadow: 0 0 0 1px #3b5bdb; }
  .mpm-tile.is-disabled { opacity: 0.45; cursor: not-allowed; }
  .mpm-thumb {
    position: relative;
    height: 78px;
    background: #f8f9fa;
    display: flex; align-items: center; justify-content: center;
    color: #c92a2a; font-size: 28px;
  }
  .mpm-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .mpm-check {
    position: absolute; top: 6px; right: 6px;
    width: 18px; height: 18px; border-radius: 99px;
    background: #3b5bdb; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px;
  }
  .mpm-name {
    padding: 6px 8px;
    font-size: 10.5px;
    color: #495057;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mpm-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    padding: 10px 14px; border-top: 1px solid #f1f3f5; background: #fafafa;
  }
  .mpm-pager {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: #868e96;
  }
  .mpm-pager :global(.btn) {
    width: 28px; height: 28px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .mpm-actions { display: flex; gap: 6px; }
  .mpm-actions :global(.btn) {
    height: 28px; font-size: 11.5px !important; padding: 0 12px;
  }
</style>
