<script>
  import { convertDate } from "./utils.js";

  export let order;
  export let maskAuthorName;
  export let addReminder;
  export let deleteReminder;

  let reminderTime = null;
  let reminderMessage = "";
  let loading = false;
  let formErrors = {};

  async function handleAddReminder(e) {
    e.preventDefault();
    formErrors = {};
    if (!reminderTime) { formErrors.reminderTime = ["Reminder time is required."]; return; }
    if (!reminderMessage.trim()) { formErrors.message = ["Message is required."]; return; }
    loading = true;
    try {
      await addReminder({ reminderTime, message: reminderMessage });
      reminderTime = null; reminderMessage = "";
      const $ = window.jQuery || window.$;
      if ($) { $("#create_reminder").modal("hide"); }
    } catch {}
    finally { loading = false; }
  }
</script>

<!-- Reminders Tab -->
<div class="tab-pane active show" id="tab_7">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3">
      <h5 class="fw-semibold mb-0">Reminders</h5>
      <div class="d-inline-flex align-items-center">
        <a href="#create_reminder" data-bs-toggle="modal" data-bs-target="#create_reminder" class="link-primary fw-medium">
          <i class="ti ti-circle-plus me-1"></i>Add New
        </a>
      </div>
    </div>
    <div class="card-body">
      {#if order?.orderReminders?.length}
        {#each order.orderReminders as reminder}
          <div class="card mb-3 relative">
            {#if reminder?.deletedAt}
              <div class="ribbon ribbon-top-left"><span class="bg-red-500">Deleted</span></div>
            {/if}
            <div class="card-body">
              {#if !reminder?.deletedAt}
                <div class="absolute top-5 right-5">
                  <button on:click={deleteReminder(reminder?.id)} class="bg-red-500 text-white text-md px-1.5 py-1 rounded">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              {/if}
              <div class="d-sm-flex align-items-center justify-content-between pb-2">
                <div class="d-flex align-items-center mb-2">
                  <span class="avatar avatar-md me-2 flex-shrink-0">
                    <img src="/assets/img/profiles/user.png" alt="img" />
                  </span>
                  <div>
                    <h6 class="fw-medium fs-14 mb-1">{maskAuthorName(reminder?.user)}</h6>
                    <p class="mb-0 fs-13">
                      {reminder?.createdAt && convertDate(reminder?.createdAt, {
                        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })}
                    </p>
                  </div>
                </div>
              </div>
              {#if reminder?.reminderTime}
                <p class="mb-0">
                  Reminder Time : <span class="text-black">
                    {convertDate(reminder?.reminderTime, {
                      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: true,
                    })}
                  </span>
                </p>
              {/if}
              {#if reminder?.message}
                <p class="mb-0">{reminder?.message}</p>
              {/if}
            </div>
          </div>
        {/each}
      {:else}
        <div>No reminders found.</div>
      {/if}
    </div>
  </div>
</div>

<!-- Create Reminder Modal -->
<div class="modal fade" id="create_reminder" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Reminder</h5>
        <button type="button" class="btn-close custom-btn-close border p-1 me-0 text-dark" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <form on:submit={handleAddReminder} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="reminderTime">Reminder Time <span class="text-danger">*</span></label>
              <input type="datetime-local" name="reminderTime" class="form-control"
                class:is-invalid={formErrors.reminderTime} bind:value={reminderTime} required id="reminderTime" />
              {#if formErrors.reminderTime}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.reminderTime[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="reminderMsg">Message <span class="text-danger">*</span></label>
              <textarea id="reminderMsg" name="reminderMessage" class="form-control" rows="4"
                bind:value={reminderMessage} class:is-invalid={formErrors.message} required></textarea>
              {#if formErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.message[0]}</li></ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
