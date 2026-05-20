<script>
  export let order;

  function getAvatarText(title) {
    if (!title) return "";
    const words = title.trim().split(" ");
    if (words.length === 1) {
      return words[0][0].toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

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
  };
  import { statusNamesStore } from "../stores/statusNames";
</script>

<div class="card kanban-card border mb-0 mt-3 shadow relative">
  {#if order?.deletedAt}
    <div class="ribbon ribbon-top-right">
      <span class="bg-red-500">Deleted</span>
    </div>
  {/if}
  {#if order?.pinStatus === "true"}
    <div class="pin-icon absolute -top-0.5 right-0.5 text-primary text-lg">
      <i class="ti ti-pin-filled"></i>
    </div>
  {/if}
  <div class="card-body">
    <div class="d-block">
      <div class="flex items-center mb-3">
        <a
          href={`/admin/order/${order?.id}`}
          class="avatar bg-soft-success text-success rounded-circle flex-shrink-0 me-2"
        >
          <span class="avatar-title text-success"
            >{getAvatarText(order?.title)}</span
          >
        </a>
        <h6 class="fw-medium fs-14 mb-0 truncate space-y-1.5">
          <a
            href={`/admin/order/${order?.id}`}
            title={order?.title}
            class="capitalize">{order?.title}</a
          >
          <div class="text-[8px] text-[#e41f07]">
            #{order?.pId?.toString().padStart(6, "0")} ({order?.workOrderNumber}){order?.inqCode ? ` · ${order.inqCode}` : ""}
          </div>
        </h6>
      </div>
    </div>
    <div class="flex justify-between items-center">
      <div class="flex items-center max-w-[60%]">
        <a href="#user" class="avatar avatar-xs flex-shrink-0 me-2">
          <img
            src="/assets/img/profiles/user.png"
            alt="Img"
            class="rounded-circle"
          />
        </a>
        <a href="#user" class="text-xs truncate capitalize">
          {order?.orderClients[0]?.name}
        </a>
      </div>
      <span
        class={`badge max-w-[40%] truncate ${statusesColors[order?.status] || "bg-gray"}`}
      >
        {$statusNamesStore[order?.status]?.name
          ? $statusNamesStore[order?.status]?.name
          : order?.status}
      </span>
    </div>
    <div class="flex items-center justify-between border-top pt-3 mt-3 text-xs">
      <span>
        <i class="ti ti-calendar-due"></i>
        {order?.orderDate &&
          new Date(order.orderDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
      </span>
      <div class="icons-social flex items-center gap-1">
        <a href="#phone" class="flex items-center justify-center me-1">
          <i class="ti ti-phone-check"></i>
        </a>
        <a href="#message" class="flex items-center justify-center me-1">
          <i class="ti ti-message-circle-2"></i>
        </a>
        <a href="#label" class="flex items-center justify-center">
          <i class="ti ti-color-swatch"></i>
        </a>
      </div>
    </div>
  </div>
</div>

<style>
  .ribbon {
    position: absolute;
    overflow: hidden;
    width: 75px;
    height: 75px;
  }

  .ribbon-top-right {
    top: -3px;
    right: -3px;
  }

  .ribbon span {
    position: absolute;
    display: block;
    width: 100px;
    padding: 4px 0;
    color: #fff;
    font-size: 8px;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  }

  .ribbon-top-right span {
    right: -25px;
    top: 15px;
    transform: rotate(45deg);
  }
</style>
