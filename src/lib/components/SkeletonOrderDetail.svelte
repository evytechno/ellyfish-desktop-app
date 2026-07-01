<script>
  import Skeleton from "./Skeleton.svelte";
</script>

<div class="row">
  <!-- Left column: header + tabs -->
  <div class="col-xl-8">
    <!-- Header card skeleton -->
    <div class="card mb-3" style="border:none; box-shadow:0 1px 4px rgba(15,23,42,0.08);">
      <div class="card-body">
        <!-- Top row: avatar + title + status -->
        <div class="d-flex align-items-start gap-3 mb-3">
          <Skeleton width="64px" height="64px" borderRadius="12px" />
          <div class="flex-grow-1">
            <Skeleton width="55%" height="20px" borderRadius="6px" mb="10px" />
            <div class="d-flex gap-2 flex-wrap">
              <Skeleton width="110px" height="22px" borderRadius="999px" />
              <Skeleton width="80px" height="22px" borderRadius="999px" />
              <Skeleton width="90px" height="22px" borderRadius="999px" />
            </div>
          </div>
          <div class="d-flex gap-2 flex-shrink-0">
            <Skeleton width="60px" height="30px" borderRadius="6px" />
            <Skeleton width="100px" height="30px" borderRadius="6px" />
          </div>
        </div>

        <!-- Linked documents row -->
        <div style="border-top:1px solid #eef1f4; padding-top:0.875rem;">
          <Skeleton width="120px" height="12px" borderRadius="4px" mb="10px" />
          <div class="d-flex align-items-center gap-3 flex-wrap">
            <div class="d-flex align-items-center gap-2">
              <Skeleton width="28px" height="28px" borderRadius="6px" />
              <Skeleton width="90px" height="22px" borderRadius="6px" />
            </div>
            <div style="width:1px;height:20px;background:#dee2e6;"></div>
            <div class="d-flex align-items-center gap-2">
              <Skeleton width="28px" height="28px" borderRadius="6px" />
              <Skeleton width="70px" height="22px" borderRadius="6px" />
            </div>
            <div style="width:1px;height:20px;background:#dee2e6;"></div>
            <div class="d-flex align-items-center gap-2">
              <Skeleton width="28px" height="28px" borderRadius="6px" />
              <Skeleton width="80px" height="22px" borderRadius="6px" />
            </div>
            <div class="ms-auto">
              <Skeleton width="110px" height="32px" borderRadius="6px" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs skeleton -->
    <div class="card" style="border:none; box-shadow:0 1px 4px rgba(15,23,42,0.08);">
      <div class="card-body pb-0 pt-2 px-2">
        <!-- Tab headers -->
        <div class="d-flex gap-3 pb-2 border-bottom mb-3">
          {#each [80, 60, 65, 70, 90, 70] as w}
            <Skeleton width="{w}px" height="14px" borderRadius="4px" />
          {/each}
        </div>
        <!-- Tab content rows -->
        {#each [1, 2, 3] as _}
          <div class="d-flex align-items-start gap-3 mb-4">
            <Skeleton width="36px" height="36px" borderRadius="50%" />
            <div class="flex-grow-1">
              <Skeleton width="40%" height="13px" borderRadius="4px" mb="8px" />
              <Skeleton width="90%" height="13px" borderRadius="4px" mb="6px" />
              <Skeleton width="75%" height="13px" borderRadius="4px" />
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Right column: sidebar -->
  <div class="col-xl-4">
    <div class="card" style="border:none; box-shadow:0 1px 4px rgba(15,23,42,0.08);">
      <div class="card-body p-0">

        <!-- Order Information section -->
        <div style="padding:1rem 1.125rem; border-bottom:1px solid #eef1f4;">
          <Skeleton width="130px" height="13px" borderRadius="4px" mb="14px" />
          {#each [1, 2, 3, 4] as _}
            <div class="d-flex justify-content-between align-items-center mb-2">
              <Skeleton width="38%" height="12px" borderRadius="4px" />
              <Skeleton width="48%" height="12px" borderRadius="4px" />
            </div>
          {/each}
          <div class="text-end mt-3">
            <Skeleton width="90px" height="26px" borderRadius="6px" />
          </div>
        </div>

        <!-- Client section -->
        <div style="padding:1rem 1.125rem; border-bottom:1px solid #eef1f4;">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <Skeleton width="60px" height="13px" borderRadius="4px" />
            <div class="d-flex gap-2">
              <Skeleton width="70px" height="26px" borderRadius="6px" />
              <Skeleton width="80px" height="26px" borderRadius="6px" />
            </div>
          </div>
          <div class="p-2 rounded mb-2" style="background:#f8fafc; border:1px solid #e8edf2;">
            <Skeleton width="60%" height="14px" borderRadius="4px" mb="6px" />
            <Skeleton width="40%" height="11px" borderRadius="4px" />
          </div>
          {#each [1, 2] as _}
            <div class="d-flex align-items-center gap-2 p-2 rounded mb-2" style="border:1px solid #e8edf2;">
              <Skeleton width="28px" height="28px" borderRadius="50%" />
              <div class="flex-grow-1">
                <Skeleton width="55%" height="12px" borderRadius="4px" mb="5px" />
                <Skeleton width="40%" height="10px" borderRadius="4px" />
              </div>
              <div class="d-flex gap-1">
                <Skeleton width="26px" height="26px" borderRadius="6px" />
                <Skeleton width="26px" height="26px" borderRadius="6px" />
              </div>
            </div>
          {/each}
        </div>

        <!-- Assigned Users section -->
        <div style="padding:1rem 1.125rem;">
          <Skeleton width="120px" height="13px" borderRadius="4px" mb="14px" />
          {#each [1, 2] as _}
            <div class="d-flex align-items-center gap-2 mb-2">
              <Skeleton width="28px" height="28px" borderRadius="50%" />
              <Skeleton width="50%" height="12px" borderRadius="4px" />
            </div>
          {/each}
        </div>

      </div>
    </div>
  </div>
</div>
