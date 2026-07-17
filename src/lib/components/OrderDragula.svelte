<script>
  import { onMount } from "svelte";
  import OrderCard from "./OrderCard.svelte";
  import OrderListTitle from "./OrderListTitle.svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { statusNamesStore } from "$lib/stores/statusNames";

  export let filterParams = {};
  export let updateOrderStatus;

  const COLUMN_LIMIT = 20;
  const STATUSES = [
    "New Lead",
    "Contacted",
    "Quotation Sent",
    "Follow Up",
    "Needs Assessment",
    "Qualified",
    "Negotiation In Progress",
    "Deal Won",
    "Unqualified",
    "Deal Lost",
    "Reference",
  ];

  const READ_ONLY_STATUSES = new Set([]);

  function initColumn() {
    return { orders: [], page: 1, total: 0, loading: true, hasMore: false };
  }

  let columnState = Object.fromEntries(STATUSES.map((s) => [s, initColumn()]));
  let columnRefs = {};
  let kanbanContainer;

  // Generation counter — discard responses from stale fetches
  let currentFetchGen = 0;

  function buildColumnQuery(status, page) {
    const query = new URLSearchParams();
    if (filterParams.search) query.set("search", filterParams.search);
    if (filterParams.startDate) query.set("startDate", filterParams.startDate);
    if (filterParams.endDate) query.set("endDate", filterParams.endDate);
    if (filterParams.byUserId) query.set("byUserId", String(filterParams.byUserId));
    if (filterParams.byCompanyId) query.set("byCompanyId", String(filterParams.byCompanyId));
    if (filterParams.orderBy) query.set("orderBy", filterParams.orderBy);
    if (filterParams.withDeleted) query.set("withDeleted", "true");
    if (filterParams.filterCategory) query.set("category", filterParams.filterCategory);
    if (filterParams.filterSource) query.set("source", filterParams.filterSource);
    query.set("status", status);
    query.set("page", String(page));
    query.set("limit", String(COLUMN_LIMIT));
    return query;
  }

  async function fetchColumn(status, page = 1, append = false, gen) {
    // If a specific status filter is active and it doesn't match this column, skip the API call
    if (filterParams.filterStatus && filterParams.filterStatus !== status) {
      columnState[status] = { orders: [], page: 1, total: 0, loading: false, hasMore: false };
      columnState = { ...columnState };
      return;
    }

    columnState[status] = { ...columnState[status], loading: true };
    columnState = { ...columnState };
    try {
      const data = await authApiFetch(
        `${API_ROUTES.ORDER}?${buildColumnQuery(status, page).toString()}`,
        { method: "GET" },
      );
      if (gen !== currentFetchGen) {
        // Stale response — a newer fetch is in charge; just clear loading so the
        // column is never left permanently stuck if the newer fetch also fails.
        columnState[status] = { ...columnState[status], loading: false };
        columnState = { ...columnState };
        return;
      }
      const newOrders = data.data || [];
      const totalLoaded = append
        ? columnState[status].orders.length + newOrders.length
        : newOrders.length;
      columnState[status] = {
        orders: append ? [...columnState[status].orders, ...newOrders] : newOrders,
        page,
        total: data.total,
        loading: false,
        hasMore: totalLoaded < data.total,
      };
    } catch (e) {
      // Always clear loading on error, regardless of gen, so we never get stuck.
      columnState[status] = { ...columnState[status], loading: false };
    }
    columnState = { ...columnState };
  }

  async function fetchAllColumns() {
    const gen = ++currentFetchGen;
    await Promise.all(STATUSES.map((s) => fetchColumn(s, 1, false, gen)));
  }

  async function loadMore(status) {
    const col = columnState[status];
    if (!col.hasMore || col.loading) return;
    const gen = currentFetchGen; // load more uses current gen (not a new filter change)
    await fetchColumn(status, col.page + 1, true, gen);
  }

  // Watch filterParams — reset and refetch all columns on any filter change
  let lastFilterKey = "";
  $: {
    const key = JSON.stringify(filterParams);
    if (key !== lastFilterKey) {
      lastFilterKey = key;
      columnState = Object.fromEntries(STATUSES.map((s) => [s, initColumn()]));
      fetchAllColumns();
    }
  }

  function getStatusSummary(status) {
    const col = columnState[status];
    if (!col) return "0 Orders";
    const loaded = col.orders.filter((o) => !o.deletedAt);
    let totalINR = 0;
    let totalUSD = 0;
    loaded.forEach((o) => {
      if (o.currency === "INR") totalINR += o.price || 0;
      else if (o.currency === "USD") totalUSD += o.price || 0;
    });
    const inrStr = `₹ ${totalINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const usdStr = `$ ${totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    return `${col.total} Orders - ${inrStr} | ${usdStr}`;
  }

  function setupAutoScroll() {
    const scrollSpeed = 15;
    const edgePadding = 100;
    function onMouseMove(e) {
      if (!kanbanContainer) return;
      const rect = kanbanContainer.getBoundingClientRect();
      if (e.clientX < rect.left + edgePadding) kanbanContainer.scrollLeft -= scrollSpeed;
      else if (e.clientX > rect.right - edgePadding) kanbanContainer.scrollLeft += scrollSpeed;
    }
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }

  let isMouseDown = false;
  let startX;
  let scrollLeft;

  function handleMouseDown(e) {
    isMouseDown = true;
    startX = e.pageX - kanbanContainer.offsetLeft;
    scrollLeft = kanbanContainer.scrollLeft;
  }
  function handleMouseUp() { isMouseDown = false; }
  function handleMouseLeave() { isMouseDown = false; }
  function handleMouseMove(e) {
    if (!isMouseDown) return;
    e.preventDefault();
    const x = e.pageX - kanbanContainer.offsetLeft;
    kanbanContainer.scrollLeft = scrollLeft - (x - startX);
  }

  onMount(async () => {
    // Restore scroll positions
    const pageY = sessionStorage.getItem("pageScrollY");
    if (pageY) window.scrollTo(0, parseInt(pageY));
    const kanbanLeft = sessionStorage.getItem("kanbanScrollLeft");
    if (kanbanContainer && kanbanLeft) kanbanContainer.scrollLeft = parseInt(kanbanLeft);
    setTimeout(() => {
      document.querySelectorAll(".kanban-drag-wrap").forEach((col, i) => {
        const pos = sessionStorage.getItem(`columnScroll_${i}`);
        if (pos) col.scrollTop = parseInt(pos);
      });
    }, 50);

    function saveScrollPositions() {
      sessionStorage.setItem("pageScrollY", window.scrollY);
      if (kanbanContainer) sessionStorage.setItem("kanbanScrollLeft", kanbanContainer.scrollLeft);
      document.querySelectorAll(".kanban-drag-wrap").forEach((col, i) => {
        sessionStorage.setItem(`columnScroll_${i}`, col.scrollTop);
      });
    }
    window.addEventListener("beforeunload", saveScrollPositions);
    window.addEventListener("scroll", saveScrollPositions);
    kanbanContainer?.addEventListener("scroll", saveScrollPositions);
    document.querySelectorAll(".kanban-drag-wrap").forEach((col) => {
      col.addEventListener("scroll", saveScrollPositions);
    });

    // Handle status change from card dropdown
    async function handleStatusChanged(e) {
      const { orderId, oldStatus, newStatus } = e.detail;
      const order = columnState[oldStatus]?.orders.find(o => o.id === orderId);
      if (!order) return;

      // Optimistic update — move card between columns
      columnState[oldStatus] = {
        ...columnState[oldStatus],
        orders: columnState[oldStatus].orders.filter(o => o.id !== orderId),
        total: Math.max(0, columnState[oldStatus].total - 1),
      };
      columnState[newStatus] = {
        ...columnState[newStatus],
        orders: [{ ...order, status: newStatus }, ...columnState[newStatus].orders],
        total: columnState[newStatus].total + 1,
      };
      columnState = { ...columnState };

      const success = await updateOrderStatus(order, newStatus);
      if (!success) {
        // Revert on failure
        columnState[newStatus] = {
          ...columnState[newStatus],
          orders: columnState[newStatus].orders.filter(o => o.id !== orderId),
          total: Math.max(0, columnState[newStatus].total - 1),
        };
        columnState[oldStatus] = {
          ...columnState[oldStatus],
          orders: [order, ...columnState[oldStatus].orders],
          total: columnState[oldStatus].total + 1,
        };
        columnState = { ...columnState };
      }
    }
    document.addEventListener("orderStatusChanged", handleStatusChanged);

    // Refresh a single card after PI/WO/TI creation from OrderCard
    async function handleRefreshOrder(e) {
      const { orderId } = e.detail;
      try {
        const updated = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
        const status = updated.status;
        if (!columnState[status]) return;
        columnState[status] = {
          ...columnState[status],
          orders: columnState[status].orders.map(o => o.id === updated.id ? updated : o),
        };
        columnState = { ...columnState };
      } catch {}
    }
    document.addEventListener("refreshOrder", handleRefreshOrder);

    // Dragula setup
    if (typeof window !== "undefined") {
      globalThis.global = globalThis;
      const dragula = (await import("dragula")).default;
      let originalContainer = null;
      let originalNextSibling = null;

      const containers = STATUSES.map((s) => columnRefs[s]).filter(Boolean);
      const drake = dragula(containers, {
        removeOnSpill: false,
        revertOnSpill: false,
        moves: (_el, source, handle) => {
          if (READ_ONLY_STATUSES.has(source?.getAttribute("data-status"))) return false;
          return !handle.closest('input, textarea, select, .fixed, [data-no-drag]');
        },
        accepts: (_el, target) => {
          return !READ_ONLY_STATUSES.has(target?.getAttribute("data-status"));
        },
      });

      let removeAutoScroll = null;

      drake.on("drag", (el, target, source) => {
        originalContainer = source;
        originalNextSibling = el.nextSibling;
        removeAutoScroll = setupAutoScroll();
      });

      drake.on("dragend", () => {
        if (removeAutoScroll) removeAutoScroll();
      });

      drake.on("drop", async (el, target, source) => {
        if (removeAutoScroll) removeAutoScroll();
        const newStatus = target?.getAttribute("data-status");
        const oldStatus = source?.getAttribute("data-status");
        const orderId = parseInt(el.dataset.orderId);

        if (!newStatus || !orderId || newStatus === oldStatus) return;

        const order = columnState[oldStatus]?.orders.find((o) => o.id === orderId);
        if (!order) return;

        // Optimistic update
        columnState[oldStatus] = {
          ...columnState[oldStatus],
          orders: columnState[oldStatus].orders.filter((o) => o.id !== orderId),
          total: Math.max(0, columnState[oldStatus].total - 1),
        };
        columnState[newStatus] = {
          ...columnState[newStatus],
          orders: [{ ...order, status: newStatus }, ...columnState[newStatus].orders],
          total: columnState[newStatus].total + 1,
        };
        columnState = { ...columnState };

        const success = await updateOrderStatus(order, newStatus);

        if (!success) {
          // Revert DOM position
          if (originalContainer && el) {
            if (originalNextSibling && originalContainer.contains(originalNextSibling)) {
              originalContainer.insertBefore(el, originalNextSibling);
            } else {
              originalContainer.appendChild(el);
            }
          }
          // Revert state
          columnState[newStatus] = {
            ...columnState[newStatus],
            orders: columnState[newStatus].orders.filter((o) => o.id !== orderId),
            total: Math.max(0, columnState[newStatus].total - 1),
          };
          columnState[oldStatus] = {
            ...columnState[oldStatus],
            orders: [order, ...columnState[oldStatus].orders],
            total: columnState[oldStatus].total + 1,
          };
          columnState = { ...columnState };
        }
      });

      originalContainer = null;
      originalNextSibling = null;

      return () => {
        drake.destroy();
        if (removeAutoScroll) removeAutoScroll();
        window.removeEventListener("beforeunload", saveScrollPositions);
        window.removeEventListener("scroll", saveScrollPositions);
        document.removeEventListener("orderStatusChanged", handleStatusChanged);
      };
    }
  });
</script>

<!-- Orders Kanban -->
<div
  class="flex overflow-x-auto grow items-start whitespace-nowrap mb-0 pb-2 gap-3 scroll-container"
  bind:this={kanbanContainer}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:mousemove={handleMouseMove}
>
  {#each STATUSES as status}
    {@const col = columnState[status]}
    <div
      class="kanban-list-items p-2 rounded border"
      class:hidden={!col.loading && col.total === 0 && !$statusNamesStore[status]?.visible}
    >
      <div class="card mb-0 border-0 shadow">
        <div class="card-body p-2">
          <OrderListTitle statusKey={status} />
          <span class="text-[10px]">{getStatusSummary(status)}</span>
        </div>
      </div>
      <div
        class="kanban-drag-wrap"
        bind:this={columnRefs[status]}
        data-status={status}
      >
        {#each col.orders as order (order.id)}
          <div data-order-id={order.id} data-order-status={order.status}>
            <OrderCard {order} />
          </div>
        {/each}
        {#if col.loading}
          <div class="text-center py-3 text-xs text-gray-400">
            <i class="ti ti-loader animate-spin me-1"></i>Loading...
          </div>
        {:else if col.hasMore}
          <button
            class="w-full text-xs text-center py-2 text-primary hover:underline border-t mt-1"
            on:click={() => loadMore(status)}
          >
            Load more ({col.total - col.orders.length} remaining)
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>
<!-- /Orders Kanban -->

<style>
  .kanban-drag-wrap {
    max-height: calc(100vh - 240px);
    overflow-y: auto;
    padding: 6px;
    scrollbar-color: #ddd transparent;
    scrollbar-width: thin;
  }
  .kanban-drag-wrap::-webkit-scrollbar { width: 2px; }
  .kanban-drag-wrap::-webkit-scrollbar-track { background: transparent; }
  .kanban-drag-wrap::-webkit-scrollbar-thumb { background-color: #ccc; border-radius: 3px; }
  .scroll-container:active { cursor: grabbing; }
</style>
