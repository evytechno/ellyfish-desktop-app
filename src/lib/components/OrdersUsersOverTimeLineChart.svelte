<script>
  import { onMount, tick } from "svelte";
  import Chart from "chart.js/auto";
  export let dashboardData = [];
  export let chartMetric = "count";

  let canvas;
  let chart;
  let chartMetric1 = "totalValue"; // "count" or "totalValue"

  async function buildChart() {
    // Wait for DOM to be updated
    await tick();

    if (!canvas) return; // Ensure canvas is available
    const ctx = canvas.getContext("2d");

    if (chart) chart.destroy(); // Clean up old chart

    // Step 1: Collect all unique ISO dates
    const allDatesSet = new Set();
    dashboardData.forEach((user) => {
      user.ordersOverTime.forEach((order) => {
        const isoDate = new Date(order.date).toISOString().split("T")[0];
        allDatesSet.add(isoDate);
      });
    });
    const allDates = Array.from(allDatesSet).sort();
    const labels = allDates.map((dateStr) =>
      new Date(dateStr).toLocaleDateString()
    );

    // Step 2: Create datasets for each user
    const datasets = dashboardData.map((user, index) => {
      const dateToMetric = {};
      user.ordersOverTime.forEach((order) => {
        const isoDate = new Date(order.date).toISOString().split("T")[0];
        dateToMetric[isoDate] = Number(order[chartMetric]) || 0;
      });

      const data = allDates.map((date) => dateToMetric[date] || 0);
      const color = `hsl(${(index * 80) % 360}, 70%, 50%)`;

      return {
        label: user.userName,
        data,
        fill: false,
        borderColor: color,
        backgroundColor: color,
        tension: 0.2,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              // stepSize: 1,
              // precision: chartMetric === "count" ? 0 : undefined,
            },
            title: {
              display: true,
              text:
                chartMetric === "count"
                  ? "Number of Orders"
                  : "Order Value (₹)",
            },
          },
          x: {
            title: {
              display: true,
              text: "Date",
            },
          },
        },
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.parsed.y;
                return chartMetric === "count"
                  ? `${ctx.dataset.label}: ${value} orders`
                  : `${ctx.dataset.label}: ₹${value.toLocaleString()}`;
              },
            },
          },
        },
      },
    });
  }

  // Only run after DOM is ready
  onMount(buildChart);

  // Reactively rebuild when chartMetric changes
  $: if (canvas) {
    buildChart();
  }
</script>

<!-- <style>
  .chart-controls {
    margin-bottom: 1rem;
  }
</style> -->

<!-- <div class="chart-controls">
  <label>
    <input type="radio" bind:group={chartMetric} value="count" />
    Number of Orders
  </label>
  <label>
    <input type="radio" bind:group={chartMetric} value="totalValue" />
    Total Order Value
  </label>
</div> -->

<div>
  <canvas bind:this={canvas}></canvas>
</div>
