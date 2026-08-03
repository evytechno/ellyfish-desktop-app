<script>
  import { page } from "$app/stores";
  import { OrderDetailView } from "$lib/features/orders/detail";
</script>

<OrderDetailView orderId={$page.params.id} />
