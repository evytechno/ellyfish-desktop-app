<!-- PaginationControls.svelte -->
<script>
  import { createEventDispatcher } from "svelte";

  export let currentPage = 1;
  export let totalPages = 1;
  export let rowsPerPage = 10;

  const dispatch = createEventDispatcher();

  function goToPage(page) {
    if (page >= 1 && page <= totalPages) {
      dispatch("pageChange", page);
    }
  }

  function handleRowsPerPageChange(event) {
    dispatch("rowsPerPageChange", +event.target.value);
  }
</script>

<div class="row align-items-center mt-4">
  <!-- Rows Per Page -->
  <div class="col-md-6">
    <div class="dataTables_length">
      <label>
        Rows Per Page:
        <select
          class="form-select form-select-sm"
          bind:value={rowsPerPage}
          on:change={handleRowsPerPageChange}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
    </div>
  </div>

  <!-- Pagination -->
  <div class="col-md-6">
    <div class="dataTables_paginate paging_simple_numbers">
      <ul class="pagination justify-content-end d-flex flex-wrap">
        <!-- Previous Button -->
        <li class="page-item {currentPage === 1 ? 'disabled' : ''}">
          <a
            class="page-link"
            href="#prev"
            on:click|preventDefault={() => goToPage(currentPage - 1)}
          >
            <i class="ti ti-arrow-left"></i>
          </a>
        </li>

        <!-- Page Numbers -->
        {#if totalPages > 5}
          <li class="page-item {currentPage === 1 ? 'active' : ''}">
            <a
              href="#page1"
              class="page-link"
              on:click|preventDefault={() => goToPage(1)}>1</a
            >
          </li>

          {#if currentPage > 3}
            <li class="page-item disabled">
              <span class="page-link">...</span>
            </li>
          {/if}

          {#each Array(5) as _, i}
            {#if currentPage - 2 + i > 1 && currentPage - 2 + i < totalPages}
              <li
                class="page-item {currentPage === currentPage - 2 + i
                  ? 'active'
                  : ''}"
              >
                <a
                  href="#page{currentPage - 2 + i}"
                  class="page-link"
                  on:click|preventDefault={() => goToPage(currentPage - 2 + i)}
                >
                  {currentPage - 2 + i}
                </a>
              </li>
            {/if}
          {/each}

          {#if currentPage < totalPages - 2}
            <li class="page-item disabled">
              <span class="page-link">...</span>
            </li>
          {/if}

          <li class="page-item {currentPage === totalPages ? 'active' : ''}">
            <a
              href="#page{totalPages}"
              class="page-link"
              on:click|preventDefault={() => goToPage(totalPages)}
            >
              {totalPages}
            </a>
          </li>
        {:else}
          {#each Array(totalPages) as _, i}
            <li class="page-item {currentPage === i + 1 ? 'active' : ''}">
              <a
                href="#page{i + 1}"
                class="page-link"
                on:click|preventDefault={() => goToPage(i + 1)}
              >
                {i + 1}
              </a>
            </li>
          {/each}
        {/if}

        <!-- Next Button -->
        <li class="page-item {currentPage === totalPages ? 'disabled' : ''}">
          <a
            class="page-link"
            href="#next"
            on:click|preventDefault={() => goToPage(currentPage + 1)}
          >
            <i class="ti ti-arrow-right"></i>
          </a>
        </li>
      </ul>
    </div>
  </div>
</div>
