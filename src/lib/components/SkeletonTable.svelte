<script>
  import Skeleton from "./Skeleton.svelte";
  export let rows = 8;
  export let cols = 5;
</script>

<div class="card" style="border:none; box-shadow:0 1px 4px rgba(15,23,42,0.08);">
  <div class="card-body p-0">
    <div class="table-responsive">
      <table class="table table-hover mb-0">
        <!-- Header -->
        <thead style="border-bottom:2px solid #eef1f4;">
          <tr>
            {#each Array(cols) as _, i}
              <th style="padding:12px 16px;">
                <Skeleton width="{i === 0 ? '120px' : '80px'}" height="13px" borderRadius="4px" />
              </th>
            {/each}
          </tr>
        </thead>

        <!-- Rows -->
        <tbody>
          {#each Array(rows) as _, r}
            <tr style="border-bottom:1px solid #f5f6f8;">
              {#each Array(cols) as _, c}
                <td style="padding:14px 16px;">
                  {#if c === 0}
                    <!-- First col: looks like a link -->
                    <Skeleton
                      width="{60 + Math.floor((r * 13 + c * 7) % 40)}px"
                      height="14px"
                      borderRadius="4px"
                    />
                  {:else if c === 1}
                    <!-- Status badge -->
                    <Skeleton width="70px" height="22px" borderRadius="999px" />
                  {:else}
                    <Skeleton
                      width="{50 + Math.floor((r * 7 + c * 11) % 50)}px"
                      height="13px"
                      borderRadius="4px"
                    />
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
