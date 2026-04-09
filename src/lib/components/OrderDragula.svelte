<script>
  import { onMount } from "svelte";
  import OrderCard from "./OrderCard.svelte";
  import OrderListTitle from "./OrderListTitle.svelte";

  let NewLead;
  let Contacted;
  let FollowUp;
  let Qualified;
  let Unqualified;
  let NeedsAssessment;
  let QuotationSent;
  let NegotiationInProgress;
  let DealWon;
  let DealLost;

  let statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
    Dispatched: "bg-blue",
  };

  export let accordingToStatusOrders;
  export let updateOrderStatus;

  let kanbanContainer;

  function setupAutoScroll() {
    const scrollSpeed = 15;
    const edgePadding = 100;

    function handleMouseMove(e) {
      if (!kanbanContainer) return;

      const rect = kanbanContainer.getBoundingClientRect();

      // Scroll Left
      if (e.clientX < rect.left + edgePadding) {
        kanbanContainer.scrollLeft -= scrollSpeed;
      }

      // Scroll Right
      else if (e.clientX > rect.right - edgePadding) {
        kanbanContainer.scrollLeft += scrollSpeed;
      }
    }

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }

  onMount(async () => {
    if (typeof window !== "undefined") {
      // Shim `global` in the browser environment
      globalThis.global = globalThis;

      const dragula = (await import("dragula")).default;
      let originalContainer = null;
      let originalNextSibling = null;
      const drake = dragula(
        [
          NewLead,
          Contacted,
          FollowUp,
          Qualified,
          Unqualified,
          NeedsAssessment,
          QuotationSent,
          NegotiationInProgress,
          DealWon,
          DealLost,
        ],
        {
          removeOnSpill: false,
          revertOnSpill: false,
          accepts: (el, target, source, sibling) => {
            return true;
          },
        },
      );
      let removeAutoScroll = null;

      drake.on("drag", (el, target, source, sibling) => {
        originalContainer = source;
        originalNextSibling = el.nextSibling;
        removeAutoScroll = setupAutoScroll();
      });

      drake.on("dragend", () => {
        if (removeAutoScroll) removeAutoScroll();
      });

      drake.on("drop", async (el, target, source, sibling) => {
        if (removeAutoScroll) removeAutoScroll();
        const newStatus = target.getAttribute("data-status");

        if (newStatus) {
          const orderId = el.dataset.orderId;
          const orderStatus = el.dataset.orderStatus;
          if (!orderId) {
            return;
          }
          if (orderId && newStatus) {
            let updateStatus = await updateOrderStatus(orderId, newStatus);
            if (updateStatus) {
              const key = orderStatus.replace(/\s+/g, "");
              accordingToStatusOrders[key] = accordingToStatusOrders[key].map(
                (order) => {
                  if (order.id === orderId) {
                    return { ...order, status: newStatus };
                  }
                  return order;
                },
              );
              accordingToStatusOrders = { ...accordingToStatusOrders };
            } else {
              if (originalContainer && el) {
                if (
                  originalNextSibling &&
                  originalContainer.contains(originalNextSibling)
                ) {
                  originalContainer.insertBefore(el, originalNextSibling);
                } else {
                  originalContainer.appendChild(el);
                }
              }
            }
          }
        }
      });

      originalContainer = null;
      originalNextSibling = null;
      return () => {
        drake.destroy();
        if (removeAutoScroll) removeAutoScroll();
      };
    }
  });

  function getAvatarText(title) {
    if (!title) return "";
    const words = title.trim().split(" ");
    if (words.length === 1) {
      return words[0][0].toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function formatCurrency(value, currency) {
    return currency === "INR"
      ? `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      : `$ ${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }

  function getStatusSummary(orders) {
    let totalINR = 0;
    let totalUSD = 0;

    orders
      .filter((order) => order.deletedAt == null)
      .forEach((order) => {
        if (order.currency === "INR") totalINR += order.price ? order.price : 0;
        else if (order.currency === "USD")
          totalUSD += order.price ? order.price : 0;
      });

    const orderCount = orders.filter((order) => order.deletedAt == null).length;
    const formattedINR = formatCurrency(totalINR, "INR");
    const formattedUSD = formatCurrency(totalUSD, "USD");

    return `${orderCount} Orders - ${formattedINR} | ${formattedUSD}`;
  }

  let isMouseDown = false;
  let startX;
  let scrollLeft;
  // let scrollContainer;

  function handleMouseDown(e) {
    isMouseDown = true;
    startX = e.pageX - kanbanContainer.offsetLeft;
    scrollLeft = kanbanContainer.scrollLeft;
  }

  function handleMouseUp() {
    isMouseDown = false;
  }

  function handleMouseMove(e) {
    if (!isMouseDown) return;
    e.preventDefault();
    const x = e.pageX - kanbanContainer.offsetLeft;
    const scroll = x - startX;
    kanbanContainer.scrollLeft = scrollLeft - scroll;
  }

  function handleMouseLeave() {
    isMouseDown = false;
  }

  let statusesName = {
    "New Lead": "New Lead",
    Contacted: "Contacted",
    "Follow Up": "Follow Up",
    Qualified: "Qualified",
    Unqualified: "Unqualified",
    "Needs Assessment": "Needs Assessment",
    "Quotation Sent": "Quotation Sent",
    "Negotiation In Progress": "Negotiation In Progress",
    "Deal Won": "Deal Won",
    "Deal Lost": "Deal Lost",
  };

  function updateStatus(key, newValue) {
    statusesName = { ...statusesName, [key]: newValue };
  }
  import { statusNamesStore } from "../stores/statusNames";

  onMount(() => {
    function saveScrollPositions() {
      sessionStorage.setItem("pageScrollY", window.scrollY);

      if (kanbanContainer) {
        sessionStorage.setItem("kanbanScrollLeft", kanbanContainer.scrollLeft);
      }

      document.querySelectorAll(".kanban-drag-wrap").forEach((col, i) => {
        sessionStorage.setItem(`columnScroll_${i}`, col.scrollTop);
      });
    }

    // restore scroll
    const pageY = sessionStorage.getItem("pageScrollY");
    if (pageY) window.scrollTo(0, parseInt(pageY));

    const kanbanLeft = sessionStorage.getItem("kanbanScrollLeft");
    if (kanbanContainer && kanbanLeft) {
      kanbanContainer.scrollLeft = parseInt(kanbanLeft);
    }

    setTimeout(() => {
      document.querySelectorAll(".kanban-drag-wrap").forEach((col, i) => {
        const pos = sessionStorage.getItem(`columnScroll_${i}`);
        if (pos) col.scrollTop = parseInt(pos);
      });
    }, 50);

    // save listeners
    window.addEventListener("beforeunload", saveScrollPositions);
    window.addEventListener("scroll", saveScrollPositions);
    kanbanContainer?.addEventListener("scroll", saveScrollPositions);

    document.querySelectorAll(".kanban-drag-wrap").forEach((col) => {
      col.addEventListener("scroll", saveScrollPositions);
    });
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
  <!-- New Lead -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.NewLead?.length === 0 &&
      !$statusNamesStore["New Lead"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <!-- <h6 class="flex items-center mb-1">
              <i class="ti ti-circle-filled fs-10 text-info me-1"></i>
              <span>{statusesName["New Lead"]}</span>
            </h6> -->
          <OrderListTitle statusKey="New Lead" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.NewLead)}
          </span>
        </div>
      </div>
    </div>
    <div class="kanban-drag-wrap" bind:this={NewLead} data-status="New Lead">
      {#if accordingToStatusOrders?.NewLead?.length}
        {#each accordingToStatusOrders?.NewLead as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Contacted -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.Contacted?.length === 0 &&
      !$statusNamesStore["Contacted"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Contacted" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.Contacted)}
          </span>
        </div>
      </div>
    </div>
    <div class="kanban-drag-wrap" bind:this={Contacted} data-status="Contacted">
      {#if accordingToStatusOrders?.Contacted.length}
        {#each accordingToStatusOrders?.Contacted as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Follow-Up -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.FollowUp?.length === 0 &&
      !$statusNamesStore["Follow Up"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Follow Up" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.FollowUp)}
          </span>
        </div>
      </div>
    </div>
    <div class="kanban-drag-wrap" bind:this={FollowUp} data-status="Follow Up">
      {#if accordingToStatusOrders?.FollowUp.length}
        {#each accordingToStatusOrders?.FollowUp as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Qualified -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.Qualified?.length === 0 &&
      !$statusNamesStore["Qualified"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Qualified" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.Qualified)}
          </span>
        </div>
      </div>
    </div>
    <div class="kanban-drag-wrap" bind:this={Qualified} data-status="Qualified">
      {#if accordingToStatusOrders?.Qualified.length}
        {#each accordingToStatusOrders?.Qualified as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Unqualified -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.Unqualified?.length === 0 &&
      !$statusNamesStore["Unqualified"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Unqualified" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.Unqualified)}
          </span>
        </div>
      </div>
    </div>
    <div
      class="kanban-drag-wrap"
      bind:this={Unqualified}
      data-status="Unqualified"
    >
      {#if accordingToStatusOrders?.Unqualified.length}
        {#each accordingToStatusOrders?.Unqualified as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Needs Assessment -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.NeedsAssessment?.length === 0 &&
      !$statusNamesStore["Needs Assessment"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Needs Assessment" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.NeedsAssessment)}
          </span>
        </div>
      </div>
    </div>
    <div
      class="kanban-drag-wrap"
      bind:this={NeedsAssessment}
      data-status="Needs Assessment"
    >
      {#if accordingToStatusOrders?.NeedsAssessment.length}
        {#each accordingToStatusOrders?.NeedsAssessment as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Quotation Sent -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.QuotationSent?.length === 0 &&
      !$statusNamesStore["Quotation Sent"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Quotation Sent" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.QuotationSent)}
          </span>
        </div>
      </div>
    </div>
    <div
      class="kanban-drag-wrap"
      bind:this={QuotationSent}
      data-status="Quotation Sent"
    >
      {#if accordingToStatusOrders?.QuotationSent.length}
        {#each accordingToStatusOrders?.QuotationSent as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Negotiation in Progress -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.NegotiationInProgress?.length ===
      0 && !$statusNamesStore["Negotiation In Progress"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Negotiation In Progress" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.NegotiationInProgress)}
          </span>
        </div>
      </div>
    </div>
    <div
      class="kanban-drag-wrap"
      bind:this={NegotiationInProgress}
      data-status="Negotiation In Progress"
    >
      {#if accordingToStatusOrders?.NegotiationInProgress.length}
        {#each accordingToStatusOrders?.NegotiationInProgress as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Deal Won -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.DealWon?.length === 0 &&
      !$statusNamesStore["Deal Won"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Deal Won" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.DealWon)}
          </span>
        </div>
      </div>
    </div>
    <div class="kanban-drag-wrap" bind:this={DealWon} data-status="Deal Won">
      {#if accordingToStatusOrders?.DealWon.length}
        {#each accordingToStatusOrders?.DealWon as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <!-- Deal Lost -->
  <div
    class="kanban-list-items p-2 rounded border"
    class:hidden={accordingToStatusOrders?.DealLost?.length === 0 &&
      !$statusNamesStore["Deal Lost"]?.visible}
  >
    <div class="card mb-0 border-0 shadow">
      <div class="card-body p-2">
        <div>
          <OrderListTitle statusKey="Deal Lost" />
          <span class="text-[10px]">
            {getStatusSummary(accordingToStatusOrders?.DealLost)}
          </span>
        </div>
      </div>
    </div>
    <div class="kanban-drag-wrap" bind:this={DealLost} data-status="Deal Lost">
      {#if accordingToStatusOrders?.DealLost.length}
        {#each accordingToStatusOrders?.DealLost as order}
          <div data-order-id={order?.id} data-order-status={order?.status}>
            <OrderCard {order} />
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<!-- /Orders Kanban -->

<style>
  .kanban-drag-wrap {
    max-height: calc(100vh - 240px);
    overflow-y: auto;
    padding: 6px;
    scrollbar-color: #ddd transparent; /* Firefox */
    scrollbar-width: thin;
  }

  /* Chrome, Edge, Safari */
  .kanban-drag-wrap::-webkit-scrollbar {
    width: 2px;
  }

  .kanban-drag-wrap::-webkit-scrollbar-track {
    background: transparent;
  }

  .kanban-drag-wrap::-webkit-scrollbar-thumb {
    background-color: #ccc;
    border-radius: 3px;
  }
  .scroll-container:active {
    cursor: grabbing;
  }
</style>
