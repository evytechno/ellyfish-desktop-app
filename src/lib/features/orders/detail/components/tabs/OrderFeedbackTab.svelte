<script>
  import { createEventDispatcher } from "svelte";
  export let order;
  export let feedbacks = [];
  export let loadingFeedbacks = false;
  export let currentUser = null;
  export let canMutateOrder = true;

  const dispatch = createEventDispatcher();

  const REASON_LABELS = {
    CALL_NOT_PICKED:               "Call Not Pick",
    TRANSPORTATION_ISSUE:          "Transportation Issue",
    DAMAGED_POOR_QUALITY_MATERIAL: "Damaged / Poor Quality Material Rcv",
    DELAY_MACHINE_MATERIAL:        "Delay Machine / Material",
    SATISFIED:                     "Satisfied",
    DOCUMENTATION_ISSUE:           "Documentation Issue",
    WRONG_MATERIAL_DISPATCH:       "Wrong Material Dispatch",
    TIMELY_INSTALLATION_PENDING:   "Timely Installation Pending",
    OTHER:                         "Other",
  };

  const SATISFACTION_CONFIG = {
    SATISFIED:    { cls: "badge bg-success",  icon: "ti-mood-smile",  label: "Satisfied"    },
    NEUTRAL:      { cls: "badge bg-warning",  icon: "ti-mood-empty",  label: "Neutral"       },
    DISSATISFIED: { cls: "badge bg-danger",   icon: "ti-mood-sad",    label: "Dissatisfied"  },
  };

  function formatDate(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }
</script>

<div class="card">
  <div class="card-header d-flex align-items-center justify-content-between py-2">
    <h6 class="mb-0"><i class="ti ti-message-star me-2 text-primary"></i>Customer Feedback</h6>
    {#if canMutateOrder}
    <button class="btn btn-primary btn-sm" on:click={() => dispatch("openFeedbackModal")}>
      <i class="ti ti-plus me-1"></i>Add Feedback
    </button>
    {/if}
  </div>
  <div class="card-body p-0">
    {#if loadingFeedbacks}
      <div class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary"></span></div>
    {:else if feedbacks.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-message-off" style="font-size:2rem;"></i>
        <p class="mt-2 mb-0">No feedback recorded yet.</p>
      </div>
    {:else}
      <div class="table-responsive">
        <table class="table table-hover table-sm mb-0">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Satisfaction</th>
              <th>Reason</th>
              <th>Type</th>
              <th>Trigger Status</th>
              <th>Remarks</th>
              {#if currentUser?.role === "master" || currentUser?.role === "admin"}
                <th>By</th>
              {/if}
              <th>Date</th>
              {#if currentUser?.role !== "user"}
                <th></th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each feedbacks as fb, i}
              {@const cfg = SATISFACTION_CONFIG[fb.satisfactionLevel] || {}}
              <tr>
                <td>{i + 1}</td>
                <td>
                  <span class="{cfg.cls} d-inline-flex align-items-center gap-1" style="font-size:11px;">
                    <i class="ti {cfg.icon}"></i>{cfg.label}
                  </span>
                </td>
                <td style="font-size:12px;">{REASON_LABELS[fb.reason] ?? fb.reason}</td>
                <td>
                  <span class="badge {fb.feedbackType === 'TRIGGERED' ? 'bg-info' : 'bg-secondary'}" style="font-size:10px;">
                    {fb.feedbackType === 'TRIGGERED' ? 'Auto' : 'Manual'}
                  </span>
                </td>
                <td style="font-size:12px;">{fb.triggerStatus || "—"}</td>
                <td style="font-size:12px; max-width:160px; word-break:break-word;">{fb.remarks || "—"}</td>
                {#if currentUser?.role === "master" || currentUser?.role === "admin"}
                  <td style="font-size:12px;">{fb.submittedBy?.name ?? "—"}</td>
                {/if}
                <td style="font-size:12px; white-space:nowrap;">{formatDate(fb.createdAt)}</td>
                {#if currentUser?.role !== "user"}
                  <td>
                    <button
                      class="btn btn-sm btn-outline-danger p-0 px-1"
                      title="Delete"
                      on:click={() => dispatch("deleteFeedback", fb.id)}
                    >
                      <i class="ti ti-trash" style="font-size:13px;"></i>
                    </button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
