<script>
  import { onMount } from "svelte";
  import Chart from "chart.js/auto";
  export let dashboardData;

  let canvas;

  onMount(() => {
    const ctx = canvas.getContext("2d");

    // Convert counts to numbers
    const counts = dashboardData.ordersOverTime.map((d) => Number(d.count));
    // Format dates as local strings
    const labels = dashboardData.ordersOverTime.map((d) =>
      new Date(d.date).toLocaleDateString()
    );

    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Orders Over Time",
            data: counts,
            fill: false,
            borderColor: "#3b82f6",
            backgroundColor: "#3b82f6",
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0,
            },
            title: {
              display: true,
              text: "Number of Orders",
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
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} orders`,
            },
          },
        },
      },
    });
  });
</script>

<div>
  <canvas bind:this={canvas}></canvas>
</div>
