<script>
  export let width = "100%";
  export let height = "16px";
  export let borderRadius = "6px";
  export let mb = "0";
</script>

<div
  class="skeleton-block"
  style="width:{width}; height:{height}; border-radius:{borderRadius}; margin-bottom:{mb};"
></div>

<style>
  .skeleton-block {
    background: linear-gradient(90deg, #f0f2f5 25%, #e4e7eb 50%, #f0f2f5 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite ease-in-out;
    display: block;
    flex-shrink: 0;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
