<script>
  import { onMount } from "svelte";
  import Chart from "chart.js/auto";
  import { statusNamesStore } from "../stores/statusNames";

  // Props passed into this component
  export let dashboardData;

  let canvas;

  // Define the fixed order of statuses
  const statusOrder = [
    "New Lead",
    "Contacted",
    "Follow Up",
    "Qualified",
    "Unqualified",
    "Needs Assessment",
    "Quotation Sent",
    "Negotiation In Progress",
    "Deal Won",
    "Deal Lost",
    "Dispatched",
    "Completed",
  ];
  let labelsStatus = [];
  statusOrder.forEach((sn) => {
    let n_name = $statusNamesStore[sn]?.name ? $statusNamesStore[sn]?.name : sn;
    labelsStatus.push(n_name);
  });

  // Define a color for each status
  const statusColors = {
    "New Lead": "#3b82f6", // blue
    Contacted: "#8b5cf6", // purple
    "Follow Up": "#f59e0b", // yellow
    Qualified: "#2ecc71", // green
    Unqualified: "#e74c3c", // red
    "Needs Assessment": "#fb923c", // orange
    "Quotation Sent": "#14b8a6", // teal
    "Negotiation In Progress": "#fbbf24", // amber
    "Deal Won": "#10b981", // emerald
    "Deal Lost": "#ef4444", // red
    Dispatched: "#3b82f6", // blue
    Completed: "#10b981", // emerald
  };

  onMount(() => {
    const ctx = canvas.getContext("2d");

    // Map the statuses from the data into a lookup
    const statusMap = {};
    dashboardData.ordersByStatus.forEach((s) => {
      statusMap[s.status] = parseInt(s.count) || 0;
    });

    // Prepare data for the chart
    const labels = labelsStatus;
    const data = statusOrder.map((status) => statusMap[status] || 0);
    const backgroundColors = statusOrder.map(
      (status) => statusColors[status] || "#cccccc",
    );

    // Create the bar chart
    new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Orders by Status",
            data,
            backgroundColor: backgroundColors,
          },
        ],
      },
      options: {
        responsive: true,
        animation: {
          duration: 1000,
          easing: "easeOutQuart",
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              callback: (value) => (Number.isInteger(value) ? value : null),
            },
            title: {
              display: true,
              text: "Number of Orders",
            },
          },
          x: {
            title: {
              display: true,
              text: "Status",
            },
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Sales Pipeline Overview",
            font: {
              size: 16,
              weight: "bold",
            },
          },
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.y} orders`,
            },
          },
        },
      },
    });
  });
</script>

<canvas bind:this={canvas}></canvas>
