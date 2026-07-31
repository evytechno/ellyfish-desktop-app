<script>
  import { createEventDispatcher } from "svelte";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";

  export let show = false;
  export let triggerStatus = null;
  export let loading = false;

  const REMARKS_MIN = 10;
  const dispatch = createEventDispatcher();

  const REASON_OPTIONS = [
    "Call Not Pick",
    "Transportation Issue",
    "Damaged / Poor Quality Material Rcv",
    "Delay Machine / Material",
    "Satisfied",
    "Documentation Issue",
    "Wrong Material Dispatch",
    "Timely Installation Pending",
    "Other",
  ];

  let satisfactionLevel = "SATISFIED";
  let reason = "";
  let remarks = "";
  let errors = {};
  let reasonKey = 0; // force re-mount on reset
  let modalContentEl;

  function reset() {
    satisfactionLevel = "SATISFIED";
    reason = "";
    remarks = "";
    errors = {};
    reasonKey++;
  }

  function close() {
    if (loading) return;
    reset();
    dispatch("close");
  }

  function validate() {
    const e = {};
    if (!reason || !reason.trim()) e.reason = "Please select or type a reason.";
    if (!remarks || remarks.trim().length < REMARKS_MIN)
      e.remarks = `Remarks must be at least ${REMARKS_MIN} characters.`;
    errors = e;
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    dispatch("submit", { satisfactionLevel, reason: reason.trim(), remarks: remarks.trim(), triggerStatus });
  }

  $: if (show) reset();

  const satisfactionOptions = [
    { value: "SATISFIED",    label: "Satisfied",    icon: "ti-mood-smile", cls: "btn-success" },
    { value: "NEUTRAL",      label: "Neutral",      icon: "ti-mood-empty", cls: "btn-warning" },
    { value: "DISSATISFIED", label: "Dissatisfied", icon: "ti-mood-sad",   cls: "btn-danger"  },
  ];
</script>

{#if show}
  <!-- Backdrop -->
  <div
    class="modal-backdrop fade show"
    style="z-index:1055;"
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="presentation"
  ></div>

  <!-- Modal -->
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="z-index:1056;"
    aria-modal="true"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content" bind:this={modalContentEl}>
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-message-star me-2 text-primary"></i>
            Customer Feedback
          </h5>
          {#if !loading}
            <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
          {/if}
        </div>
        <div class="modal-body">
          {#if triggerStatus}
            <div class="alert alert-info py-2 mb-3" style="font-size:13px;">
              <i class="ti ti-info-circle me-1"></i>
              Status changed to <strong>{triggerStatus}</strong> — please record customer feedback.
            </div>
          {/if}

          <!-- Satisfaction -->
          <div class="mb-3">
            <label class="form-label fw-semibold">Customer Satisfaction <span class="text-danger">*</span></label>
            <div class="d-flex gap-2 flex-wrap">
              {#each satisfactionOptions as opt}
                <button
                  type="button"
                  class="btn btn-sm {satisfactionLevel === opt.value ? opt.cls : 'btn-outline-secondary'}"
                  on:click={() => (satisfactionLevel = opt.value)}
                >
                  <i class="ti {opt.icon} me-1"></i>{opt.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Reason -->
          <div class="mb-3">
            <label class="form-label fw-semibold">Reason <span class="text-danger">*</span></label>
            {#key reasonKey}
              <TypeableSelect
                id="fb-reason"
                options={REASON_OPTIONS}
                value={reason}
                placeholder="Search or type custom reason..."
                dropdownParent={modalContentEl}
                on:change={(e) => { reason = e.detail; if (errors.reason) errors = { ...errors, reason: null }; }}
              />
            {/key}
            {#if errors.reason}<div class="text-danger mt-1" style="font-size:12px;">{errors.reason}</div>{/if}
          </div>

          <!-- Remarks -->
          <div class="mb-1">
            <label class="form-label fw-semibold" for="fb-remarks">
              Remarks <span class="text-danger">*</span>
              <span class="text-muted fw-normal" style="font-size:11px;">(min {REMARKS_MIN} chars)</span>
            </label>
            <textarea
              id="fb-remarks"
              class="form-control"
              class:is-invalid={!!errors.remarks}
              rows="3"
              placeholder="Describe the feedback in detail..."
              bind:value={remarks}
            ></textarea>
            <div class="d-flex justify-content-between mt-1">
              {#if errors.remarks}
                <div class="text-danger" style="font-size:12px;">{errors.remarks}</div>
              {:else}
                <div></div>
              {/if}
              <div class="text-muted" style="font-size:11px;">{remarks.trim().length} chars</div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          {#if !loading}
            <button type="button" class="btn btn-secondary btn-sm" on:click={close}>
              {triggerStatus ? "Skip" : "Cancel"}
            </button>
          {/if}
          <button type="button" class="btn btn-primary btn-sm" on:click={submit} disabled={loading}>
            {#if loading}
              <span class="spinner-border spinner-border-sm me-1"></span>Submitting...
            {:else}
              <i class="ti ti-send me-1"></i>Submit Feedback
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
