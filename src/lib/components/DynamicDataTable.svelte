<script>
  import { createEventDispatcher } from "svelte";
  import Pagination from "./Pagination.svelte";
  import Skeleton from "./Skeleton.svelte";

  export let columns = [];
  export let data = [];
  export let actions = [];
  export let search = "";
  export let currentPage = 1;
  export let rowsPerPage = 10;
  export let totalItems = 0;
  export let totalPages = 1;
  export let serverMode = false;
  export let loading;
  export let headersItemShow = true;
  export let selectable = false;      // show checkboxes in S.N. column
  export let selectedIds = new Set(); // Set<number> of selected row ids

  const dispatch = createEventDispatcher();

  let sortColumn = "";
  let sortAsc = true;

  $: filtered = serverMode
    ? data
    : data.filter((row) =>
        columns.some((col) =>
          String(row[col.key] ?? "")
            .toLowerCase()
            .includes(search.toLowerCase())
        )
      );

  $: sorted = serverMode
    ? filtered
    : [...filtered].sort((a, b) => {
        if (!sortColumn) return 0;
        const valA = a[sortColumn];
        const valB = b[sortColumn];
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });

  $: paginated = serverMode
    ? data
    : sorted.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  $: totalPages = serverMode
    ? totalPages
    : Math.ceil(sorted.length / rowsPerPage);

  function sortBy(key) {
    if (sortColumn === key) sortAsc = !sortAsc;
    else {
      sortColumn = key;
      sortAsc = true;
    }
    if (serverMode)
      dispatch("sortChange", { key, order: sortAsc ? "asc" : "desc" });
  }

  function goToPage(page) {
    if (page >= 1 && page <= totalPages) {
      dispatch("pageChange", page);
    }
  }

  let debounceTimeout;
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      dispatch("search", value);
    }, 300);
  }

  function handleRowsPerPageChange(value) {
    dispatch("rowsPerPageChange", +value);
  }
  $: [totalItems];
</script>

<div
  class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3"
>
  {#if headersItemShow}
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <div class="dropdown">
        <a
          href="#dropdown"
          class="dropdown-toggle btn btn-outline-light px-2 shadow"
          data-bs-toggle="dropdown"
          aria-expanded="false"
        >
          <i class="ti ti-sort-ascending-2 me-2"></i>Sort By
        </a>
        <div class="dropdown-menu">
          <ul class="list-unstyled m-0 p-2">
            <li>
              <a
                href="#Newest"
                class="dropdown-item"
                on:click={() => {
                  sortBy("created_at");
                  sortAsc = false;
                }}
              >
                Newest
              </a>
            </li>
            <li>
              <a
                href="#Oldest"
                class="dropdown-item"
                on:click={() => {
                  sortBy("created_at");
                  sortAsc = true;
                }}
              >
                Oldest
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
    {#if search !== undefined && search !== null}
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          on:input={(e) => handleSearchChange(e.target.value)}
          placeholder="Search..."
          class="w-full p-2 border border-gray-300 rounded shadow-sm focus:outline-none focus:ring focus:border-blue-300"
        />
      </div>
    {/if}
  {/if}
</div>

<!-- Table -->
<div class="overflow-x-auto">
  <table
    class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm"
  >
    <thead>
      <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
        <th class="px-4 py-2 cursor-pointer whitespace-nowrap">
          {#if selectable}
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                class="form-check-input mt-0"
                checked={paginated.length > 0 && paginated.every(r => selectedIds.has(r.id))}
                on:change={() => dispatch('selectAll', { rows: paginated })}
              />
              S.N.
            </div>
          {:else}
            S.N.
          {/if}
        </th>
        {#each columns as col}
          <th
            class="px-4 py-2 cursor-pointer whitespace-nowrap"
            on:click={() => sortBy(col.key)}
          >
            {@html col.label}
            {#if sortColumn === col.key}
              {sortAsc ? " ▲" : " ▼"}
            {/if}
          </th>
        {/each}
        {#if actions.length > 0}
          <th class="px-4 py-2 cursor-pointer whitespace-nowrap">Actions </th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if paginated.length > 0}
        {#each paginated as row, i (row.id ?? i)}
          <tr
            class="border-t hover:bg-gray-50"
            class:bg-red-100={row.deletedAt}
            class:hover:bg-red-100={row.deletedAt}
          >
            <td
              class="px-4 py-2 border-red-500"
              class:border-l-4={row.deletedAt}
            >
              {#if selectable}
                <div class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="form-check-input mt-0"
                    checked={selectedIds.has(row.id)}
                    on:change={() => dispatch('selectRow', { id: row.id })}
                  />
                  {i + 1 + (currentPage - 1) * rowsPerPage}.
                </div>
              {:else}
                {i + 1 + (currentPage - 1) * rowsPerPage}.
              {/if}
              {#if row.deletedAt}
                <span class="badge badge-outline-danger">
                  <i class="ti ti-trash"></i>
                </span>
              {/if}
            </td>
            {#each columns as col}
              <td class="px-4 py-2" class:max-w-sm={col.key === "description"}>
                {#if col.render}
                  {@html col.render(row[col.key], row)}
                {:else}
                  {row[col.key] ?? "-"}
                {/if}
              </td>
            {/each}
            {#if actions.length > 0}
              <td class="px-4 py-2">
                <div class="d-inline-flex gap-2">
                  {#if !row.deletedAt}
                    {#each actions as action}
                      <button
                        on:click={() => action.onClick(row.id)}
                        class={`btn btn-icon btn-sm rounded-pill ${action.color}`}
                      >
                        <i class={`${action.icon}`}></i>
                      </button>
                    {/each}
                  {:else}
                    {#each actions as action}
                      {#if action.label === "Delete"}
                        <button
                          on:click={() => action.onClick(row.id)}
                          class={`btn btn-icon btn-sm rounded-pill ${action.color}`}
                        >
                          <i class={`${action.icon}`}></i>
                        </button>
                      {/if}
                    {/each}
                  {/if}
                </div>
              </td>
            {/if}
          </tr>
        {/each}
      {:else if loading}
        {#each Array(8) as _, r}
          <tr class="border-t">
            <td class="px-4 py-2">
              <Skeleton width="28px" height="13px" borderRadius="4px" />
            </td>
            {#each columns as col, c}
              <td class="px-4 py-2">
                {#if c === 0}
                  <Skeleton width="{60 + Math.floor((r * 13 + c * 7) % 40)}px" height="14px" borderRadius="4px" />
                {:else if col.key === 'status' || col.key === 'type'}
                  <Skeleton width="72px" height="22px" borderRadius="999px" />
                {:else}
                  <Skeleton width="{50 + Math.floor((r * 7 + c * 11) % 50)}px" height="13px" borderRadius="4px" />
                {/if}
              </td>
            {/each}
            {#if actions.length > 0}
              <td class="px-4 py-2">
                <div class="d-inline-flex gap-2">
                  <Skeleton width="28px" height="28px" borderRadius="50%" />
                </div>
              </td>
            {/if}
          </tr>
        {/each}
      {:else}
        <tr>
          <td
            colspan={columns.length + 1 + (actions.length > 0 ? 1 : 0)}
            class="px-4 py-2 text-center text-gray-500"
          >
            <span>No matching results</span>
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

<!-- Pagination & Rows Per Page -->
<Pagination
  {currentPage}
  {totalPages}
  {rowsPerPage}
  on:pageChange={(e) => goToPage(e.detail)}
  on:rowsPerPageChange={(e) => handleRowsPerPageChange(e.detail)}
/>
