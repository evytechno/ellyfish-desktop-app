<script>
  import { onMount } from "svelte";
  import Chart from "chart.js/auto";

  export let users;

  let canvas;
  let chartInstance;

  const statusOrder = [
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
    "Dispatched",
    "Completed",
  ];

  const statusColors = {
    "New Lead": "#3b82f6",
    Contacted: "#8b5cf6",
    "Follow Up": "#f59e0b",
    Qualified: "#2ecc71",
    Unqualified: "#e74c3c",
    "Needs Assessment": "#fb923c",
    "Quotation Sent": "#14b8a6",
    "Negotiation In Progress": "#fbbf24",
    "Deal Won": "#10b981",
    "Deal Lost": "#ef4444",
    Dispatched: "#3b82f6",
    Completed: "#10b981",
  };

  const userColors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // yellow
    "#ef4444", // red
    "#8b5cf6", // purple
    "#14b8a6", // teal
    "#fb923c", // orange
    "#6366f1", // indigo
    "#f43f5e", // rose
    "#84cc16", // lime
    "#fbbf24", // amber
    "#2ecc71", // green
  ];

  function getDatasets(users) {
    return users.map((user, index) => {
      const statusMap = {};

      for (const entry of user.statusBreakdown || []) {
        statusMap[entry.status] = entry.count;
      }

      const data = statusOrder.map((status) => statusMap[status] || 0);

      return {
        label: user.userName,
        data,
        backgroundColor: userColors[index % userColors.length],
        stack: "users",
      };
    });
  }

  function renderChart() {
    if (!canvas || !users) return;

    const ctx = canvas.getContext("2d");

    if (chartInstance) {
      chartInstance.destroy();
    }

    const datasets = getDatasets(users);

    chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: statusOrder,
        datasets,
      },
      options: {
        responsive: true,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          x: {
            stacked: true,
            title: {
              display: true,
              text: "Status",
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Orders",
            },
            ticks: {
              stepSize: 1,
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.y} orders`,
            },
          },
        },
      },
    });
  }

  onMount(() => {
    renderChart();
  });

  $: if (canvas && users) {
    renderChart();
  }
</script>

<canvas bind:this={canvas}></canvas>
