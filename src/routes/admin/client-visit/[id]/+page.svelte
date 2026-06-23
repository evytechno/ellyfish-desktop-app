<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";

  const BASE_URL = import.meta.env.VITE_PUBLIC_API_URL?.replace("/api", "") ?? "";
  let visitId = $page.params.id;

  let currentUser = null;
  let visit = null;
  let expenses = [];
  let loadingData = true;
  let lightboxSrc = null;

  onMount(async () => {
    currentUser = checkAuth();
    try {
      const [v, exp] = await Promise.all([
        authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}`),
        authApiFetch(`${API_ROUTES.USER_PAYMENT}/by-visit/${visitId}`).catch(() => []),
      ]);
      visit = v;
      expenses = Array.isArray(exp) ? exp : [];
    } catch (_) {
      Swal.fire("Error", "Failed to load visit.", "error");
    } finally {
      loadingData = false;
    }
  });

  async function deleteVisit() {
    const r = await Swal.fire({ title: "Delete visit?", text: "This cannot be undone.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Delete" });
    if (!r.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}`, { method: "DELETE" });
      goto("/admin/client-visit");
    } catch (_) { Swal.fire("Error", "Failed to delete.", "error"); }
  }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtDatetime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  }

  $: totalJobCost = (visit?.jobs ?? []).reduce((s, j) => s + (parseFloat(j.cost) || 0), 0);
  $: totalExpenses = expenses.reduce((s, e) => s + (e.items ?? []).reduce((es, it) => es + (parseFloat(it.price ?? it.amount) || 0), 0), 0);

  const outcomeColors = { Positive: "bg-success", Negative: "bg-danger", Pending: "bg-warning text-dark", "No Response": "bg-secondary" };
</script>

<!-- lightbox -->
{#if lightboxSrc}
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;" on:click={() => lightboxSrc = null}>
    <img src={lightboxSrc} alt="Full size" style="max-width:90vw;max-height:90vh;border-radius:8px;" on:click|stopPropagation />
    <button on:click={() => lightboxSrc = null} style="position:fixed;top:20px;right:24px;background:none;border:none;color:white;font-size:28px;cursor:pointer;">✕</button>
  </div>
{/if}

<div class="page-wrapper">
  <div class="content">

    {#if loadingData}
      <Loader />
    {:else if visit}

      <!-- ── Top bar ── -->
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => history.length > 2 ? history.back() : goto('/admin/client-visit')}>← Back</button>
          <i class="ti ti-map-pin text-muted" style="font-size:18px;"></i>
          <span class="fw-semibold" style="font-size:16px;">Visit #{visit.id}</span>
          <span class="badge {visit.visitType === 'outgoing' ? 'bg-warning text-dark' : 'bg-info'}">
            {visit.visitType === 'outgoing' ? '↗ Outgoing' : '↙ Incoming'}
          </span>
          <span class="text-muted" style="font-size:13px;">{visit.company?.name ?? ""}</span>
        </div>
        <div class="d-flex gap-2">
          <a href="/admin/client-visit/edit/{visit.id}" class="btn btn-outline-primary btn-sm">
            <i class="ti ti-edit me-1"></i>Edit
          </a>
          <button class="btn btn-outline-danger btn-sm" on:click={deleteVisit}>
            <i class="ti ti-trash me-1"></i>Delete
          </button>
        </div>
      </div>

      <!-- ── CARD ── -->
      <div class="card border-0 shadow-sm mb-3" style="border-radius:12px;overflow:hidden;border-bottom:1px solid #e9ecef!important;">

        <!-- Section 1 header -->
        <div class="d-flex align-items-center justify-content-between px-4 py-2" style="background:#f8f9fa;border:1px solid #e9ecef;border-bottom:0;border-radius:12px 12px 0 0;">
          <div class="d-flex align-items-center gap-2">
            <div style="width:8px;height:8px;border-radius:50%;background:#185FA5;"></div>
            <span class="text-uppercase fw-semibold" style="font-size:11px;letter-spacing:.05em;color:#6c757d;">Section 1 — Client &amp; Visit Info</span>
          </div>
          <span style="font-size:12px;color:#6c757d;">
            {fmtDate(visit.visitDate)}
            {#if visit.startTime || visit.endTime}
              &nbsp;·&nbsp; {fmtDatetime(visit.startTime)} – {fmtDatetime(visit.endTime)}
            {/if}
          </span>
        </div>

        <div class="table-responsive">
          <table class="table visit-inner-table mb-0">
            <tbody>
              <!-- Row 1: Client / Contacts / Team -->
              <tr>
                <td style="width:30%;">
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Client / Company</div>
                  <div class="fw-semibold" style="font-size:14px;">{visit.client?.name ?? "—"}</div>
                  {#if visit.order}
                    <div class="text-muted" style="font-size:12px;">Order: <a href="/admin/order/{visit.order.id}" class="text-primary">#{visit.order.id}</a></div>
                  {/if}
                </td>
                <td style="width:40%;">
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Client Contacts Met</div>
                  {#if visit.clientContacts?.length}
                    <div class="d-flex flex-wrap gap-1">
                      {#each visit.clientContacts as cc}
                        <span class="badge bg-light text-dark border" style="font-size:11px;font-weight:400;">
                          {cc.name}{cc.designation ? ` · ${cc.designation}` : ""}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="text-muted" style="font-size:13px;">—</span>
                  {/if}
                </td>
                <td style="width:30%;">
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Our Team</div>
                  <div class="d-flex flex-wrap gap-1">
                    {#each (visit.attendees ?? []) as att}
                      <span class="badge border" style="font-size:11px;font-weight:400;background:#E6F1FB;color:#185FA5;border-color:#B5D4F4!important;">
                        {att.user?.name ?? "—"}{att.isLead ? " · Lead" : ""}
                      </span>
                    {/each}
                    {#if !visit.attendees?.length}
                      <span class="text-muted" style="font-size:13px;">—</span>
                    {/if}
                  </div>
                </td>
              </tr>

              <!-- Row 2: Purpose / Transport / Outcome / Follow-up / Created By -->
              <tr>
                <td>
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Purpose</div>
                  <div style="font-size:13px;">{visit.purpose}</div>
                </td>
                <td>
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Transport</div>
                  <div style="font-size:13px;">{visit.transportMedium || "—"}</div>
                </td>
                <td>
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Outcome</div>
                  {#if visit.outcome}
                    <span class="badge {outcomeColors[visit.outcome] ?? 'bg-secondary'}">{visit.outcome}</span>
                  {:else}
                    <span class="text-muted" style="font-size:13px;">—</span>
                  {/if}
                </td>
              </tr>

              <!-- Row 3: Follow-up / Created By / Notes/Feedback -->
              <tr>
                <td>
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Next Follow-up</div>
                  <div style="font-size:13px;">{fmtDate(visit.nextFollowUpDate)}</div>
                </td>
                <td>
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Created By</div>
                  <div style="font-size:13px;">{visit.createdBy?.name ?? "—"} · {visit.financialYear}</div>
                </td>
                <td>
                  <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;">Start / End Time</div>
                  <div style="font-size:13px;">
                    {#if visit.startTime || visit.endTime}
                      {fmtDatetime(visit.startTime)} – {fmtDatetime(visit.endTime)}
                    {:else}—{/if}
                  </div>
                </td>
              </tr>

              <!-- Row 4: Feedback / Notes (only if present) -->
              {#if visit.clientFeedback || visit.notes}
                <tr>
                  <td colspan={visit.clientFeedback && visit.notes ? 1 : 3}>
                    {#if visit.clientFeedback}
                      <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;"><i class="ti ti-message-circle me-1"></i>Client Feedback</div>
                      <div style="font-size:13px;line-height:1.5;font-style:italic;">"{visit.clientFeedback}"</div>
                    {/if}
                  </td>
                  {#if visit.clientFeedback && visit.notes}
                    <td colspan="2">
                      <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;"><i class="ti ti-notes me-1"></i>Internal Notes</div>
                      <div style="font-size:13px;line-height:1.5;">{visit.notes}</div>
                    </td>
                  {:else if visit.notes}
                    <td colspan="3">
                      <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;"><i class="ti ti-notes me-1"></i>Internal Notes</div>
                      <div style="font-size:13px;line-height:1.5;">{visit.notes}</div>
                    </td>
                  {/if}
                </tr>
              {/if}

            </tbody>
          </table>
        </div>

        <!-- Section 2 header -->
        <div class="d-flex align-items-center justify-content-between px-4 py-2" style="background:#f8f9fa;border:1px solid #e9ecef;border-top:0;border-bottom:0;">
          <div class="d-flex align-items-center gap-2">
            <div style="width:8px;height:8px;border-radius:50%;background:#854F0B;"></div>
            <span class="text-uppercase fw-semibold" style="font-size:11px;letter-spacing:.05em;color:#6c757d;">Section 2 — Job / Work-piece Requirements</span>
          </div>
          <a href="/admin/client-visit/edit/{visit.id}" class="btn btn-sm btn-outline-warning" style="font-size:11px;padding:3px 10px;">
            <i class="ti ti-plus me-1"></i>Add Job
          </a>
        </div>

        <!-- job table -->
        {#if visit.jobs?.length}
          <div class="table-responsive">
            <table class="table visit-inner-table mb-0">
              <thead class="table-light">
                <tr>
                  {#each ["Work-piece / Description","Material","Qty","Size","Requirement / Spec","Est. Cost","Images"] as h}
                    <th style="font-size:11px;font-weight:600;color:#6c757d;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;">{h}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each visit.jobs as job}
                  <tr>
                    <td>
                      <div class="fw-semibold" style="font-size:14px;">{job.description || "—"}</div>
                    </td>
                    <td style="font-size:13px;">{job.material || "—"}</td>
                    <td style="font-size:13px;">{job.quantity || "—"}</td>
                    <td style="font-size:13px;">{job.size || "—"}</td>
                    <td style="font-size:13px;">{job.requirement || "—"}</td>
                    <td class="fw-semibold" style="font-size:14px;white-space:nowrap;">₹{parseFloat(job.cost || 0).toLocaleString('en-IN')}</td>
                    <td>
                      <div class="d-flex flex-wrap gap-2">
                        {#each (job.images ?? []) as img}
                          <img src="{BASE_URL}{img.url}" alt="Work-piece" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #dee2e6;cursor:pointer;"
                            on:click={() => lightboxSrc = BASE_URL + img.url} />
                        {/each}
                        <a href="/admin/client-visit/edit/{visit.id}" style="width:60px;height:60px;border-radius:6px;border:1px dashed #adb5bd;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#6c757d;gap:2px;font-size:11px;text-decoration:none;">
                          <i class="ti ti-camera-plus" style="font-size:16px;"></i>
                          <span>Add</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="text-center py-4 text-muted" style="font-size:13px;">
            <i class="ti ti-tool" style="font-size:28px;display:block;margin-bottom:6px;opacity:.35;"></i>
            No jobs recorded.
            <a href="/admin/client-visit/edit/{visit.id}" class="d-block mt-2 text-primary" style="font-size:12px;">Add a job →</a>
          </div>
        {/if}

        <!-- job footer total -->
        {#if visit.jobs?.length}
          <div class="d-flex align-items-center justify-content-between px-4 py-2" style="background:#fafafa;">
            <span style="font-size:12px;color:#6c757d;">{visit.jobs.length} job{visit.jobs.length > 1 ? 's' : ''} · {visit.jobs.reduce((s, j) => s + (j.images?.length ?? 0), 0)} images</span>
            <span>
              <span style="font-size:12px;color:#6c757d;">Total estimate &nbsp;</span>
              <span style="font-size:18px;font-weight:600;">₹{totalJobCost.toLocaleString('en-IN')}</span>
            </span>
          </div>
        {/if}
      </div>

      <!-- Terms -->
      {#if visit.terms}
        <div class="card border-0 shadow-sm mb-3 px-4 py-3" style="border-radius:10px;">
          <div class="text-muted mb-1" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;"><i class="ti ti-file-text me-1"></i>Terms Discussed</div>
          <div style="font-size:13px;line-height:1.6;">{visit.terms}</div>
        </div>
      {/if}

      <!-- Expenses -->
      {#if expenses.length > 0}
        <div class="card border-0 shadow-sm mb-4" style="border-radius:12px;overflow:hidden;">
          <div class="d-flex align-items-center justify-content-between px-4 py-2" style="background:#f8f9fa;">
            <div class="d-flex align-items-center gap-2">
              <div style="width:8px;height:8px;border-radius:50%;background:#3B6D11;"></div>
              <span class="text-uppercase fw-semibold" style="font-size:11px;letter-spacing:.05em;color:#6c757d;">Expenses</span>
            </div>
            <span style="font-size:13px;font-weight:600;">Total: ₹{totalExpenses.toLocaleString('en-IN')}</span>
          </div>
          <table class="table table-sm mb-0">
            <thead class="table-light">
              <tr><th>Title</th><th>Items</th><th class="text-end">Amount</th><th>By</th></tr>
            </thead>
            <tbody>
              {#each expenses as exp}
                {@const et = (exp.items ?? []).reduce((s, it) => s + (parseFloat(it.price ?? it.amount) || 0), 0)}
                <tr>
                  <td style="font-size:13px;">{exp.title}</td>
                  <td style="font-size:12px;color:#6c757d;">{(exp.items ?? []).map((it) => `${it.item ?? it.description ?? ""} ₹${parseFloat(it.price ?? it.amount ?? 0).toFixed(0)}`).join(" · ") || "—"}</td>
                  <td class="text-end fw-semibold" style="font-size:13px;">₹{et.toLocaleString('en-IN')}</td>
                  <td style="font-size:12px;color:#6c757d;">{exp.user?.name ?? "—"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

    {:else}
      <div class="alert alert-warning">Visit not found.</div>
    {/if}
  </div>
</div>

<style>
  .visit-inner-table {
    border-collapse: collapse;
  }
  .visit-inner-table td,
  .visit-inner-table th {
    border: 1px solid #e9ecef;
    padding: 10px 14px;
  }
  /* remove outer borders */
  .visit-inner-table > tbody > tr:first-child > td,
  .visit-inner-table > thead > tr:first-child > th {
    border-top: none;
  }
  .visit-inner-table > tbody > tr:last-child > td {
    border-bottom: none;
  }
  .visit-inner-table > tbody > tr > td:first-child,
  .visit-inner-table > thead > tr > th:first-child {
    border-left: none;
  }
  .visit-inner-table > tbody > tr > td:last-child,
  .visit-inner-table > thead > tr > th:last-child {
    border-right: none;
  }
</style>
