<script>
  export let dashboardData;

  $: stats = [
    {
      label: "Total Orders",
      value: dashboardData?.totalOrders ?? 0,
      icon: "ti-shopping-cart",
      tone: "blue",
    },
    {
      label: "Completion",
      value: `${dashboardData?.completionRate ?? 0}%`,
      icon: "ti-circle-check",
      tone: "green",
    },
    {
      label: "Success",
      value: `${dashboardData?.successRate ?? 0}%`,
      icon: "ti-trending-up",
      tone: "teal",
    },
    {
      label: "Failure",
      value: `${dashboardData?.failureRate ?? 0}%`,
      icon: "ti-trending-down",
      tone: "red",
    },
    {
      label: "Active",
      value: dashboardData?.activeDeals ?? 0,
      icon: "ti-activity",
      tone: "purple",
    },
    {
      label: "Avg / Day",
      value: dashboardData?.avgOrdersPerDay ?? 0,
      icon: "ti-calendar-stats",
      tone: "gray",
    },
  ];
</script>

<div class="sc-strip mb-3" role="list">
  {#each stats as s}
    <div class="sc-cell sc-cell--{s.tone}" role="listitem">
      <div class="sc-cell-top">
        <i class="ti {s.icon}"></i>
        <span class="sc-label">{s.label}</span>
      </div>
      <div class="sc-value">{s.value}</div>
    </div>
  {/each}
</div>

<style>
  .sc-strip {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    overflow: hidden;
  }

  .sc-cell {
    padding: 10px 12px;
    border-right: 1px solid #f1f3f5;
    min-width: 0;
  }
  .sc-cell:last-child { border-right: none; }

  .sc-cell-top {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
    min-width: 0;
  }
  .sc-cell-top i {
    font-size: 13px;
    flex-shrink: 0;
    opacity: 0.9;
  }
  .sc-label {
    font-size: 10.5px;
    font-weight: 500;
    color: #868e96;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sc-value {
    font-size: 16px;
    font-weight: 700;
    color: #212529;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .sc-cell--blue .sc-cell-top i,
  .sc-cell--blue .sc-value { color: #364fc7; }
  .sc-cell--green .sc-cell-top i,
  .sc-cell--green .sc-value { color: #2b8a3e; }
  .sc-cell--teal .sc-cell-top i,
  .sc-cell--teal .sc-value { color: #087f5b; }
  .sc-cell--red .sc-cell-top i,
  .sc-cell--red .sc-value { color: #c92a2a; }
  .sc-cell--purple .sc-cell-top i,
  .sc-cell--purple .sc-value { color: #5f3dc4; }
  .sc-cell--gray .sc-cell-top i,
  .sc-cell--gray .sc-value { color: #495057; }

  @media (max-width: 1100px) {
    .sc-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .sc-cell:nth-child(3n) { border-right: none; }
    .sc-cell:nth-child(n+4) { border-top: 1px solid #f1f3f5; }
  }

  @media (max-width: 560px) {
    .sc-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .sc-cell { border-right: 1px solid #f1f3f5; }
    .sc-cell:nth-child(2n) { border-right: none; }
    .sc-cell:nth-child(n+3) { border-top: 1px solid #f1f3f5; }
  }
</style>
