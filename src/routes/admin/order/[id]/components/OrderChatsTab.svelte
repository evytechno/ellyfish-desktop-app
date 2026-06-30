<script>
  import { convertDate, normalizeTypes } from "./utils.js";

  export let order;
  export let currentUser;
  export let maskAuthorName;
  export let addChat;
  export let deleteChat;

  const CHAT_TYPES = ["Call", "WhatsApp", "Email"];
  let message = "";
  let selectedTypes = [];
  let chatTypeFilter = "All";
  let loading = false;
  let formErrors = {};

  $: filteredChats = chatTypeFilter === "All"
    ? (order?.orderChats ?? [])
    : (order?.orderChats ?? []).filter((c) => normalizeTypes(c.type).includes(chatTypeFilter));

  $: chatTypeCounts = CHAT_TYPES.reduce((acc, t) => {
    acc[t] = (order?.orderChats ?? []).filter((c) => normalizeTypes(c.type).includes(t)).length;
    return acc;
  }, {});

  $: allSelected = selectedTypes.length === CHAT_TYPES.length;

  function toggleChatType(t) {
    if (t === "All") {
      selectedTypes = selectedTypes.length === CHAT_TYPES.length ? [] : [...CHAT_TYPES];
    } else {
      selectedTypes = selectedTypes.includes(t)
        ? selectedTypes.filter((x) => x !== t)
        : [...selectedTypes, t];
    }
  }

  async function handleAddChat(e) {
    e.preventDefault();
    formErrors = {};
    if (!selectedTypes.length) { formErrors.type = ["Please select at least one type."]; return; }
    if (!message.trim()) { formErrors.message = ["Message is required."]; return; }
    loading = true;
    try {
      await addChat({ type: selectedTypes.join(","), message });
      message = "";
      selectedTypes = [];
      // close modal
      const $ = window.jQuery || window.$;
      if ($) { $("#create_call").modal("hide"); }
    } finally {
      loading = false;
    }
  }
</script>

<!-- Chats Tab -->
<div class="tab-pane active show" id="tab_3">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3">
      <h5 class="fw-semibold mb-0">Chats</h5>
      <div class="d-inline-flex align-items-center">
        <a href="#create_call" data-bs-toggle="modal" data-bs-target="#create_call" class="link-primary fw-medium">
          <i class="ti ti-circle-plus me-1"></i>Add New
        </a>
      </div>
    </div>
    <div class="card-body">
      <div class="d-flex gap-2 flex-wrap mb-3">
        <button type="button"
          class="btn btn-sm {chatTypeFilter === 'All' ? 'btn-dark' : 'btn-outline-secondary'}"
          on:click={() => (chatTypeFilter = 'All')}
        >All ({order?.orderChats?.length ?? 0})</button>
        {#each CHAT_TYPES as t}
          <button type="button"
            class="btn btn-sm {chatTypeFilter === t
              ? t === 'Call' ? 'btn-primary' : t === 'WhatsApp' ? 'btn-success' : 'btn-warning'
              : 'btn-outline-secondary'}"
            on:click={() => (chatTypeFilter = t)}
          >{t} ({chatTypeCounts[t]})</button>
        {/each}
      </div>
      {#if filteredChats.length}
        {#each filteredChats as chat}
          <div class="card mb-3 relative">
            {#if chat?.deletedAt}
              <div class="ribbon ribbon-top-left"><span class="bg-red-500">Deleted</span></div>
            {/if}
            <div class="card-body">
              {#if !chat?.deletedAt}
                <div class="absolute top-5 right-5">
                  <button on:click={deleteChat(chat?.id)} class="bg-red-500 text-white text-md px-1.5 py-1 rounded">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              {/if}
              <div class="d-sm-flex align-items-center justify-content-between pb-2">
                <div class="d-flex align-items-center mb-2">
                  <span class="avatar avatar-md me-2 flex-shrink-0">
                    <img src="/assets/img/profiles/user.png" alt="img" />
                  </span>
                  <p class="mb-0">
                    <span class="text-dark fw-medium">{maskAuthorName(chat?.user)}</span>
                    {#each normalizeTypes(chat?.type) as nt}
                      <span class="badge ms-1 {nt === 'Call' ? 'bg-primary' : nt === 'WhatsApp' ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:10px;">
                        {#if nt === 'Call'}<i class="ti ti-phone me-1"></i>{/if}
                        {#if nt === 'WhatsApp'}<i class="ti ti-brand-whatsapp me-1"></i>{/if}
                        {#if nt === 'Email'}<i class="ti ti-mail me-1"></i>{/if}
                        {nt}
                      </span>
                    {/each}
                    {#if chat?.user?.status === "banned"}
                      <span class="badge bg-danger ms-1" style="font-size:10px;">Banned</span>
                    {:else if chat?.user?.status === "inactive"}
                      <span class="badge bg-secondary ms-1" style="font-size:10px;">Inactive</span>
                    {/if}
                    ........ on
                    {chat?.createdAt && convertDate(chat?.createdAt, {
                      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: true,
                    })}
                  </p>
                </div>
              </div>
              <p class="mb-0">{chat?.message}</p>
            </div>
          </div>
        {/each}
      {:else}
        <div>No chats found.</div>
      {/if}
    </div>
  </div>
</div>

<!-- Create Chat Modal -->
<div class="modal fade" id="create_call" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Chat</h5>
        <button type="button" class="btn-close custom-btn-close border p-1 me-0 text-dark" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <form on:submit={handleAddChat} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label">Type <span class="text-danger">*</span></label>
              <div class="d-flex gap-2 flex-wrap">
                {#each CHAT_TYPES as t}
                  <button type="button"
                    class="btn btn-sm {selectedTypes.includes(t)
                      ? t === 'Call' ? 'btn-primary' : t === 'WhatsApp' ? 'btn-success' : 'btn-warning'
                      : 'btn-outline-secondary'}"
                    on:click|stopPropagation={() => toggleChatType(t)}
                  >
                    {#if t === 'Call'}<i class="ti ti-phone me-1"></i>{/if}
                    {#if t === 'WhatsApp'}<i class="ti ti-brand-whatsapp me-1"></i>{/if}
                    {#if t === 'Email'}<i class="ti ti-mail me-1"></i>{/if}
                    {t}
                  </button>
                {/each}
                <button type="button"
                  class="btn btn-sm {allSelected ? 'btn-dark' : 'btn-outline-secondary'}"
                  on:click|stopPropagation={() => toggleChatType('All')}
                >
                  <i class="ti ti-select-all me-1"></i>All
                </button>
              </div>
              {#if formErrors.type}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.type[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="chatMessage">Message <span class="text-danger">*</span></label>
              <textarea id="chatMessage" name="message" class="form-control" rows="4"
                bind:value={message} class:is-invalid={formErrors.message} required></textarea>
              {#if formErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.message[0]}</li></ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
