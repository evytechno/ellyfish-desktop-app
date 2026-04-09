<script>
  export let isModalOpen = false;
  export let type = "info"; // default type
  export let title = "";
  export let message = "";
  export let confirmText = "";
  export let cancelText = "";
  export let onConfirm = () => {};
  export let onCancel = () => {};

  const handleConfirm = () => {
    onConfirm();
    isModalOpen = false;
  };

  const handleCancel = () => {
    onCancel();
    isModalOpen = false;
  };

  // Icon and styles per type
  const modalIcons = {
    deleteConfirm: "ti ti-trash",
    multipleDeleteConfirm: "ti ti-trash",
    success: "ti ti-check",
    error: "ti ti-x",
    warning: "ti ti-alert-triangle",
    info: "ti ti-info-circle",
  };

  const iconClass = modalIcons[type] || modalIcons["info"];
</script>

{#if isModalOpen}
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show d-block">
    <div class="modal-dialog modal-dialog-centered modal-sm rounded-0">
      <div class="modal-content rounded-0">
        <div class="modal-body p-4 text-center position-relative">
          <div class="mb-3 position-relative z-1">
            <span
              class="avatar avatar-xl badge-soft-{type} border-0 text-{type} rounded-circle"
            >
              <i class="{iconClass} fs-24"></i>
            </span>
          </div>
          <h5 class="mb-1">{title}</h5>
          <p class="mb-3">{message}</p>

          <div class="d-flex justify-content-center">
            {#if cancelText}
              <button class="btn btn-light me-2 w-100" on:click={handleCancel}
                >{cancelText}</button
              >
            {/if}
            {#if confirmText}
              <button class="btn btn-primary w-100" on:click={handleConfirm}
                >{confirmText}</button
              >
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
