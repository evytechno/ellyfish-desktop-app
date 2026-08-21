<script>
  export let order;
  export let deleteClient;
  export let canMutateOrder = true;
  export let isOldAssignee = false;
</script>

<div class="tab-pane active show" id="tab_6">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3">
      <h5 class="fw-semibold mb-0">Clients</h5>
      <div class="d-inline-flex align-items-center"></div>
    </div>
    <div class="card-body">
      {#if isOldAssignee}
        <div class="text-center py-5 text-muted">
          <i class="ti ti-eye-off d-block mb-2" style="font-size:1.75rem;"></i>
          <p class="mb-0 fw-medium">Client details are hidden</p>
          <p class="mb-0 small">Only the Active assignee can view client information on this order.</p>
        </div>
      {:else if order?.orderClients?.length}
        {#each order.orderClients as orderClient}
          <div class="card mb-3 relative">
            {#if orderClient?.deletedAt}
              <div class="ribbon ribbon-top-left"><span class="bg-red-500">Deleted</span></div>
            {/if}
            <div class="card-body">
              {#if !orderClient?.deletedAt}
                <div class="absolute top-5 right-5">
                  {#if canMutateOrder}
                  <button on:click={deleteClient(orderClient?.id)} class="bg-red-500 text-white text-md px-1.5 py-1 rounded">
                    <i class="ti ti-trash"></i>
                  </button>
                  {/if}
                </div>
              {/if}
              <div class="d-sm-flex align-items-center justify-content-between">
                <div>
                  {#if orderClient?.name}
                    <div class="d-flex align-items-center mb-2">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-user fs-14"></i></span>
                      <p class="mb-0 capitalize">{orderClient?.name}</p>
                    </div>
                  {/if}
                  {#if orderClient?.designation}
                    <div class="d-flex align-items-center mb-2">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-id fs-14"></i></span>
                      <p class="mb-0 capitalize">{orderClient?.designation}</p>
                    </div>
                  {/if}
                  {#if orderClient?.email}
                    <div class="d-flex align-items-center mb-2">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-mail fs-14"></i></span>
                      <p class="mb-0"><a href="mailto:{orderClient?.email}">{orderClient?.email}</a></p>
                    </div>
                  {/if}
                  {#if orderClient?.mobile}
                    <div class="d-flex align-items-center mb-2">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-phone fs-14"></i></span>
                      <p class="mb-0">{orderClient?.mobile}</p>
                    </div>
                  {/if}
                  {#if orderClient?.alternateMobile}
                    <div class="d-flex align-items-center mb-2">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-device-mobile fs-14"></i></span>
                      <p class="mb-0">{orderClient?.alternateMobile}</p>
                    </div>
                  {/if}
                  {#if orderClient?.whatsapp}
                    <div class="d-flex align-items-center mb-2">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-brand-whatsapp fs-14"></i></span>
                      <p class="mb-0">{orderClient?.whatsapp}</p>
                    </div>
                  {/if}
                  {#if orderClient?.address}
                    <div class="d-flex align-items-center">
                      <span class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"><i class="ti ti-location-pin fs-14"></i></span>
                      <p class="mb-0 capitalize">{orderClient?.address}</p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      {:else}
        <div>No clients found.</div>
      {/if}
    </div>
  </div>
</div>
