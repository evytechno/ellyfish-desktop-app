<script>
  export let showQueryModal = false;
  export let showEditQueryModal = false;
  export let querySubject = "";
  export let queryDescription = "";
  export let queryError = "";
  export let raisingQuery = false;
  export let editQuerySubject = "";
  export let editQueryDescription = "";
  export let editQueryError = "";
  export let editingQueryLoading = false;
  export let submitOrderQuery;
  export let submitEditQuery;
</script>

<!-- Raise Query Modal -->
{#if showQueryModal}
  <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
    on:click|self={() => (showQueryModal = false)}>
    <div class="card shadow-lg p-4" style="max-width:520px;width:100%;">
      <h5 class="fw-bold mb-3">Raise Query for This Order</h5>
      {#if queryError}
        <div class="alert alert-danger py-2">{queryError}</div>
      {/if}
      <div class="mb-3">
        <label class="form-label">Subject <span class="text-danger">*</span></label>
        <input type="text" class="form-control" bind:value={querySubject} placeholder="Brief subject..." maxlength="150" />
      </div>
      <div class="mb-3">
        <label class="form-label">Requirement <span class="text-muted">(optional)</span></label>
        <textarea class="form-control" rows="4" bind:value={queryDescription}
          placeholder="Describe your requirement in detail..." style="resize:vertical;"></textarea>
      </div>
      <div class="d-flex gap-2 justify-content-end">
        <button class="btn btn-secondary btn-sm" on:click={() => (showQueryModal = false)}>Cancel</button>
        <button class="btn btn-primary btn-sm" on:click={submitOrderQuery} disabled={raisingQuery}>
          {raisingQuery ? "Submitting..." : "Submit Query"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Query Modal -->
{#if showEditQueryModal}
  <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1055;display:flex;align-items:center;justify-content:center;padding:1rem;"
    on:click|self={() => (showEditQueryModal = false)}>
    <div class="card shadow-lg p-4" style="max-width:520px;width:100%;">
      <h5 class="fw-bold mb-3">Edit Query</h5>
      {#if editQueryError}
        <div class="alert alert-danger py-2">{editQueryError}</div>
      {/if}
      <div class="mb-3">
        <label class="form-label">Subject <span class="text-danger">*</span></label>
        <input type="text" class="form-control" bind:value={editQuerySubject} placeholder="Brief subject..." maxlength="150" />
      </div>
      <div class="mb-3">
        <label class="form-label">Requirement <span class="text-muted">(optional)</span></label>
        <textarea class="form-control" rows="4" bind:value={editQueryDescription}
          placeholder="Describe your requirement in detail..." style="resize:vertical;"></textarea>
      </div>
      <div class="d-flex gap-2 justify-content-end">
        <button class="btn btn-secondary btn-sm" on:click={() => (showEditQueryModal = false)}>Cancel</button>
        <button class="btn btn-primary btn-sm" on:click={submitEditQuery} disabled={editingQueryLoading}>
          {editingQueryLoading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  </div>
{/if}
