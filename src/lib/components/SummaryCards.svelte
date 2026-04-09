<script>
  export let dashboardData;
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
  <!-- Total Orders -->
  <div class="flex">
    <div class="card flex-fill mb-0 relative overflow-hidden">
      <div class="card-body relative z-1">
        <div class="flex items-start justify-between">
          <div>
            <p class="fs-14 mb-1">Total Orders</p>
            <h2 class="mb-1 fs-16">{dashboardData?.totalOrders}</h2>
          </div>
          <span
            class="avatar avatar-md rounded-circle bg-soft-primary border border-primary"
          >
            <i class="ti ti-building fs-16 text-primary"></i>
          </span>
        </div>
      </div>
      <img
        src="/assets/img/icons/elemnt-01.svg"
        alt="element-01"
        class="img-fluid position-absolute top-0 Start-0"
      />
    </div>
  </div>

  <!-- Completion Rate -->
  <div class="flex">
    <div class="card flex-fill mb-0 relative overflow-hidden">
      <div class="card-body relative z-1">
        <div class="flex items-start justify-between">
          <div>
            <p class="fs-14 mb-1">Completion Rate</p>
            <h2 class="mb-1 fs-16">{dashboardData?.completionRate}%</h2>
          </div>
          <span
            class="avatar avatar-md rounded-circle bg-soft-success border border-success"
          >
            <i class="ti ti-carousel-vertical fs-16 text-success"></i>
          </span>
        </div>
      </div>
      <img
        src="/assets/img/icons/elemnt-02.svg"
        alt="element-02"
        class="img-fluid position-absolute top-0 Start-0"
      />
    </div>
  </div>

  <!-- Success Rate -->
  <div class="flex">
    <div class="card flex-fill mb-0 relative overflow-hidden">
      <div class="card-body relative z-1">
        <div class="flex items-start justify-between">
          <div>
            <p class="fs-14 mb-1">Success Rate</p>
            <h2 class="mb-1 fs-16">{dashboardData?.successRate}%</h2>
          </div>
          <span
            class="avatar avatar-md rounded-circle bg-soft-info border border-info"
          >
            <i class="ti ti-chart-bar fs-16 text-info"></i>
          </span>
        </div>
      </div>
      <img
        src="/assets/img/icons/elemnt-03.svg"
        alt="element-03"
        class="img-fluid position-absolute top-0 Start-0"
      />
    </div>
  </div>

  <!-- Failure Rate -->
  <div class="flex">
    <div class="card flex-fill mb-0 relative overflow-hidden">
      <div class="card-body relative z-1">
        <div class="flex items-start justify-between">
          <div>
            <p class="fs-14 mb-1">Failure Rate</p>
            <h2 class="mb-1 fs-16">{dashboardData?.failureRate}%</h2>
          </div>
          <span
            class="avatar avatar-md rounded-circle bg-soft-danger border border-danger"
          >
            <i class="ti ti-chart-candle fs-16 text-danger"></i>
          </span>
        </div>
      </div>
      <img
        src="/assets/img/icons/elemnt-01.svg"
        alt="element-04"
        class="img-fluid position-absolute top-0 Start-0"
      />
    </div>
  </div>

  <!-- Active Deals -->
  <div class="flex">
    <div class="card flex-fill mb-0 relative overflow-hidden">
      <div class="card-body relative z-1">
        <div class="flex items-start justify-between">
          <div>
            <p class="fs-14 mb-1">Active Orders</p>
            <h2 class="mb-1 fs-16">{dashboardData?.activeDeals}</h2>
          </div>
          <span
            class="avatar avatar-md rounded-circle bg-soft-secondary border border-secondary"
          >
            <i class="ti ti-handshake fs-16 text-secondary"></i>
          </span>
        </div>
      </div>
      <img
        src="/assets/img/icons/elemnt-02.svg"
        alt="element-05"
        class="img-fluid position-absolute top-0 Start-0"
      />
    </div>
  </div>

  <!-- Avg Orders Per Day -->
  <div class="flex">
    <div class="card flex-fill mb-0 relative overflow-hidden">
      <div class="card-body relative z-1">
        <div class="flex items-start justify-between">
          <div>
            <p class="fs-14 mb-1">Avg Orders / Day</p>
            <h2 class="mb-1 fs-16">{dashboardData?.avgOrdersPerDay}</h2>
          </div>
          <span
            class="avatar avatar-md rounded-circle bg-soft-dark border border-dark"
          >
            <i class="ti ti-calendar-stats fs-16 text-dark"></i>
          </span>
        </div>
      </div>
      <img
        src="/assets/img/icons/elemnt-03.svg"
        alt="element-06"
        class="img-fluid position-absolute top-0 Start-0"
      />
    </div>
  </div>
</div>
