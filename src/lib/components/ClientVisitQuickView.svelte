<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";

  /** @type {boolean} */
  export let open = false;
  /** @type {number|string|null} */
  export let visitId = null;
  export let currentUser = null;

  const dispatch = createEventDispatcher();

  let loading = false;
  let visit = null;
  let loadToken = 0;

  const TYPE_META = {
    incoming: { label: "They Came To Us", cls: "bg-info text-white" },
    outgoing: { label: "We Visited Client", cls: "bg-warning text-dark" },
    joint: { label: "Joint Site Visit", cls: "bg-primary" },
    job_discussion: { label: "Client Gave Job Details", cls: "bg-success" },
    job_received: { label: "Job Received", cls: "bg-secondary" },
    sample_sent: { label: "Sample Sent", cls: "bg-danger" },
  };

  const STATUS_META = {
    scheduled: { label: "Scheduled", cls: "bg-primary" },
    completed: { label: "Completed", cls: "bg-success" },
    cancelled: { label: "Cancelled", cls: "bg-danger" },
  };

  const OUTCOME_META = {
    Positive: "bg-success",
    Negative: "bg-danger",
    Pending: "bg-warning text-dark",
    "No Response": "bg-secondary",
  };

  const TYPE_FIELDS = {
    incoming: {
      dateLabel: "Visit Date",
      ourTeamLabel: "Our Team Who Received",
      clientLabel: "Client Contacts Who Came",
      jobsLabel: "Job / Material Details",
      addressLabel: "Client's Origin / Home Office",
      purpose: true,
      outcome: true,
      feedback: true,
      transport: false,
      location: false,
      startEnd: true,
      nextFollowUp: true,
      jobs: true,
    },
    outgoing: {
      dateLabel: "Visit Date",
      ourTeamLabel: "Who Went From Our Side",
      clientLabel: "Client Contacts Met",
      jobsLabel: "Job / Material Details",
      addressLabel: "Client Site Address",
      purpose: true,
      outcome: true,
      feedback: true,
      transport: true,
      location: false,
      startEnd: true,
      nextFollowUp: true,
      jobs: true,
    },
    joint: {
      dateLabel: "Visit Date",
      ourTeamLabel: "Our Team",
      clientLabel: "Client Contacts",
      jobsLabel: "Job / Material Details",
      addressLabel: "Meeting Location",
      purpose: true,
      outcome: true,
      feedback: false,
      transport: true,
      location: true,
      startEnd: true,
      nextFollowUp: true,
      jobs: true,
    },
    job_discussion: {
      dateLabel: "Discussion Date",
      ourTeamLabel: "Our Team Present",
      clientLabel: "Client Contacts Who Came",
      jobsLabel: "Job / Work-piece Requirements",
      addressLabel: "Client Office Address",
      purpose: false,
      outcome: false,
      feedback: false,
      transport: false,
      location: false,
      startEnd: false,
      nextFollowUp: true,
      jobs: true,
    },
    job_received: {
      dateLabel: "Date Received",
      ourTeamLabel: "Received By",
      clientLabel: "Sent By (Client Contact)",
      jobsLabel: "Job / Material Details",
      addressLabel: "Pickup / Sent From Address",
      purpose: false,
      outcome: false,
      feedback: false,
      transport: false,
      location: false,
      startEnd: false,
      nextFollowUp: false,
      jobs: true,
    },
    sample_sent: {
      dateLabel: "Date Sent",
      ourTeamLabel: "Sent By",
      clientLabel: "Sent To (Client Contact)",
      jobsLabel: "Sample Details",
      addressLabel: "Delivery Address",
      purpose: false,
      outcome: false,
      feedback: false,
      transport: false,
      location: false,
      startEnd: false,
      nextFollowUp: true,
      jobs: true,
    },
  };

  $: tf = visit ? TYPE_FIELDS[visit.visitType] ?? TYPE_FIELDS.outgoing : TYPE_FIELDS.outgoing;
  $: typeMeta = visit ? TYPE_META[visit.visitType] ?? { label: visit.visitType, cls: "bg-secondary" } : null;
  $: statusMeta = visit ? STATUS_META[visit.status] ?? { label: visit.status, cls: "bg-secondary" } : null;
  $: totalJobCost = (visit?.jobs ?? []).reduce((s, j) => s + (parseFloat(j.cost) || 0), 0);

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    const day = WEEKDAYS[dt.getDay()];
    return `${day}, ${String(dt.getDate()).padStart(2, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
  }

  function fmtTime12(t) {
    if (!t) return "";
    const [hStr, mStr = "00"] = String(t).split(":");
    let h = parseInt(hStr, 10);
    if (Number.isNaN(h)) return "";
    const m = mStr.slice(0, 2).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  function fmtDatetime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function maskName(name) {
    if (!name) return "—";
    if (currentUser?.role === "user" && name !== currentUser?.name) return "Team Member";
    return name;
  }

  function addressLine() {
    if (!visit) return "";
    return [visit.addressLine, visit.city, visit.state, visit.pincode].filter(Boolean).join(", ");
  }

  function followUpTone(d) {
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vd = new Date(d);
    vd.setHours(0, 0, 0, 0);
    const diff = Math.round((vd - today) / 86400000);
    if (diff < 0) return { text: "Overdue", cls: "cvqv-chip--danger" };
    if (diff === 0) return { text: "Today", cls: "cvqv-chip--warn" };
    if (diff === 1) return { text: "Tomorrow", cls: "cvqv-chip--soon" };
    return { text: `In ${diff} days`, cls: "cvqv-chip--soon" };
  }

  async function load(id) {
    const token = ++loadToken;
    loading = true;
    visit = null;
    try {
      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${id}`);
      if (token !== loadToken) return;
      visit = data;
    } catch (err) {
      if (token !== loadToken) return;
      errorHandle(err);
      close();
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  function close() {
    open = false;
    visit = null;
    dispatch("close");
  }

  function onKeydown(e) {
    if (e.key === "Escape" && open) close();
  }

  $: if (open && visitId != null) {
    load(visitId);
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <div
    class="cvqv-backdrop"
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="-1"
  ></div>
{/if}

<aside class="cvqv-drawer" class:cvqv-drawer--open={open} aria-hidden={!open}>
  <div class="cvqv-header">
    <div class="cvqv-header-text">
      <div class="cvqv-eyebrow">Visit Quick View</div>
      {#if visit}
        <div class="cvqv-id">#{visit.id}</div>
      {/if}
      <h5 class="mb-0 cvqv-title text-truncate" title={visit?.client?.name || ""}>
        {visit?.client?.name || (loading ? "Loading…" : "Client Visit")}
      </h5>
      {#if visit?.company?.name}
        <div class="cvqv-sub text-truncate">{visit.company.name}</div>
      {/if}
    </div>
    <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
  </div>

  <div class="cvqv-body">
    {#if loading}
      <div class="cvqv-loading text-muted">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Loading visit…
      </div>
    {:else if visit}
      <div class="cvqv-section">
        <div class="cvqv-badges">
          {#if statusMeta}
            <span class="badge {statusMeta.cls}">{statusMeta.label}</span>
          {/if}
          {#if typeMeta}
            <span class="badge {typeMeta.cls}">{typeMeta.label}</span>
          {/if}
          {#if visit.outcome}
            <span class="badge {OUTCOME_META[visit.outcome] ?? 'bg-secondary'}">{visit.outcome}</span>
          {/if}
        </div>
      </div>

      <div class="cvqv-section">
        <div class="cvqv-section-title">When &amp; Where</div>
        <dl class="cvqv-dl">
          <div class="cvqv-row">
            <dt>{tf.dateLabel}</dt>
            <dd>
              {fmtDate(visit.visitDate)}
              {#if visit.meetingTime}
                <span class="cvqv-meta">· {fmtTime12(visit.meetingTime)}</span>
              {/if}
            </dd>
          </div>
          {#if tf.startEnd && (visit.startTime || visit.endTime)}
            <div class="cvqv-row">
              <dt>Duration</dt>
              <dd>{fmtDatetime(visit.startTime)} – {fmtDatetime(visit.endTime)}</dd>
            </div>
          {/if}
          {#if tf.transport && visit.transportMedium}
            <div class="cvqv-row">
              <dt>Transport</dt>
              <dd>{visit.transportMedium}</dd>
            </div>
          {/if}
          {#if tf.location && visit.location}
            <div class="cvqv-row">
              <dt>Meeting Spot</dt>
              <dd>{visit.location}</dd>
            </div>
          {/if}
          {#if addressLine()}
            <div class="cvqv-row cvqv-row--block">
              <dt>{tf.addressLabel}</dt>
              <dd class="text-break">{addressLine()}</dd>
            </div>
          {:else if visit.city || visit.state}
            <div class="cvqv-row">
              <dt>Location</dt>
              <dd>{[visit.city, visit.state].filter(Boolean).join(", ")}</dd>
            </div>
          {/if}
        </dl>
      </div>

      <div class="cvqv-section">
        <div class="cvqv-section-title">People</div>
        <dl class="cvqv-dl">
          <div class="cvqv-row cvqv-row--block">
            <dt>{tf.ourTeamLabel}</dt>
            <dd>
              {#if visit.attendees?.length}
                <div class="cvqv-chips">
                  {#each visit.attendees as att}
                    <span class="cvqv-chip cvqv-chip--team">
                      {maskName(att.user?.name)}{#if att.isLead} · Lead{/if}
                    </span>
                  {/each}
                </div>
              {:else}
                <span class="text-muted">No team members listed</span>
              {/if}
            </dd>
          </div>
          <div class="cvqv-row cvqv-row--block">
            <dt>{tf.clientLabel}</dt>
            <dd>
              {#if visit.clientContacts?.length}
                <div class="cvqv-chips">
                  {#each visit.clientContacts as cc}
                    <span class="cvqv-chip">
                      {cc.name}{#if cc.designation} · {cc.designation}{/if}
                      {#if cc.mobile}<span class="cvqv-meta"> · {cc.mobile}</span>{/if}
                    </span>
                  {/each}
                </div>
              {:else}
                <span class="text-muted">No client contacts listed</span>
              {/if}
            </dd>
          </div>
          <div class="cvqv-row">
            <dt>Logged by</dt>
            <dd>{maskName(visit.createdBy?.name)}</dd>
          </div>
        </dl>
      </div>

      {#if tf.purpose || tf.outcome || tf.feedback || visit.notes || visit.terms}
        <div class="cvqv-section">
          <div class="cvqv-section-title">Visit Summary</div>
          <dl class="cvqv-dl">
            {#if tf.purpose && visit.purpose}
              <div class="cvqv-row cvqv-row--block">
                <dt>Purpose</dt>
                <dd class="text-break">{visit.purpose}</dd>
              </div>
            {/if}
            {#if tf.outcome}
              <div class="cvqv-row">
                <dt>Outcome</dt>
                <dd>
                  {#if visit.outcome}
                    <span class="badge {OUTCOME_META[visit.outcome] ?? 'bg-secondary'}">{visit.outcome}</span>
                  {:else}
                    <span class="text-muted">Not recorded</span>
                  {/if}
                </dd>
              </div>
            {/if}
            {#if tf.feedback && visit.clientFeedback}
              <div class="cvqv-row cvqv-row--block">
                <dt>Client Feedback</dt>
                <dd class="text-break">{visit.clientFeedback}</dd>
              </div>
            {/if}
            {#if visit.notes}
              <div class="cvqv-row cvqv-row--block">
                <dt>Internal Notes</dt>
                <dd class="text-break">{visit.notes}</dd>
              </div>
            {/if}
            {#if visit.terms}
              <div class="cvqv-row cvqv-row--block">
                <dt>Terms Discussed</dt>
                <dd class="text-break">{visit.terms}</dd>
              </div>
            {/if}
          </dl>
        </div>
      {/if}

      {#if tf.jobs}
        <div class="cvqv-section">
          <div class="cvqv-section-title d-flex align-items-center justify-content-between">
            <span>{tf.jobsLabel}</span>
            {#if visit.jobs?.length}
              <span class="cvqv-count">{visit.jobs.length}</span>
            {/if}
          </div>
          {#if visit.jobs?.length}
            <ul class="cvqv-jobs">
              {#each visit.jobs as job, i}
                <li class="cvqv-job">
                  <div class="cvqv-job-top">
                    <span class="cvqv-job-idx">#{i + 1}</span>
                    {#if job.cost}
                      <span class="cvqv-job-cost">₹{Number(job.cost).toLocaleString("en-IN")}</span>
                    {/if}
                  </div>
                  {#if job.description}
                    <div class="cvqv-job-line"><strong>What:</strong> {job.description}</div>
                  {/if}
                  {#if job.material}
                    <div class="cvqv-job-line"><strong>Material:</strong> {job.material}</div>
                  {/if}
                  {#if job.quantity || job.size}
                    <div class="cvqv-job-line">
                      {#if job.quantity}<strong>Qty:</strong> {job.quantity}{/if}
                      {#if job.quantity && job.size} · {/if}
                      {#if job.size}<strong>Size:</strong> {job.size}{/if}
                    </div>
                  {/if}
                  {#if job.requirement}
                    <div class="cvqv-job-line text-break"><strong>Need:</strong> {job.requirement}</div>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if totalJobCost > 0}
              <div class="cvqv-job-total">Estimated total · ₹{totalJobCost.toLocaleString("en-IN")}</div>
            {/if}
          {:else}
            <p class="text-muted mb-0 cvqv-empty">No job / material lines added</p>
          {/if}
        </div>
      {/if}

      {#if tf.nextFollowUp || visit.order}
        <div class="cvqv-section">
          <div class="cvqv-section-title">Follow-up &amp; Links</div>
          <dl class="cvqv-dl">
            {#if tf.nextFollowUp}
              <div class="cvqv-row">
                <dt>Next Follow-up</dt>
                <dd>
                  {#if visit.nextFollowUpDate}
                    {fmtDate(visit.nextFollowUpDate)}
                    {@const tone = followUpTone(visit.nextFollowUpDate)}
                    {#if tone}
                      <span class="cvqv-chip {tone.cls}">{tone.text}</span>
                    {/if}
                  {:else}
                    <span class="text-muted">Not set</span>
                  {/if}
                </dd>
              </div>
            {/if}
            <div class="cvqv-row">
              <dt>Linked Order</dt>
              <dd>
                {#if visit.order}
                  <a href="/admin/order/{visit.order.id}" class="text-primary">
                    #{visit.order.pId ?? visit.order.id}{visit.order.title ? ` — ${visit.order.title}` : ""}
                  </a>
                {:else}
                  <span class="text-muted">None</span>
                {/if}
              </dd>
            </div>
            {#if visit.financialYear}
              <div class="cvqv-row">
                <dt>Financial Year</dt>
                <dd>{visit.financialYear}</dd>
              </div>
            {/if}
          </dl>
        </div>
      {/if}
    {/if}
  </div>

  {#if visit && !loading}
    <div class="cvqv-footer">
      <a href="/admin/client-visit/{visit.id}" class="btn btn-sm btn-primary flex-fill">
        <i class="ti ti-external-link me-1"></i>Open Full
      </a>
      <a href="/admin/client-visit/edit/{visit.id}" class="btn btn-sm btn-outline-secondary flex-fill">
        <i class="ti ti-edit me-1"></i>Edit
      </a>
    </div>
  {/if}
</aside>

<style>
  .cvqv-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(15, 23, 42, 0.28);
  }
  .cvqv-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 1050;
    width: min(440px, 100vw);
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fff;
    box-shadow: -8px 0 28px rgba(15, 23, 42, 0.12);
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
    font-size: 12px;
    line-height: 1.45;
  }
  .cvqv-drawer--open {
    transform: translateX(0);
    pointer-events: auto;
  }
  .cvqv-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #e9ecef;
    flex-shrink: 0;
  }
  .cvqv-header-text {
    min-width: 0;
    flex: 1;
  }
  .cvqv-eyebrow {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #868e96;
    margin-bottom: 2px;
  }
  .cvqv-id {
    font-size: 11px;
    color: #868e96;
    font-weight: 500;
  }
  .cvqv-title {
    font-size: 15px !important;
    font-weight: 600 !important;
    color: #212529;
    letter-spacing: -0.01em;
  }
  .cvqv-sub {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
  }
  .cvqv-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px 20px;
  }
  .cvqv-loading {
    display: flex;
    align-items: center;
    padding: 24px 0;
    justify-content: center;
  }
  .cvqv-section {
    margin-bottom: 16px;
  }
  .cvqv-section-title {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #868e96;
    margin-bottom: 8px;
  }
  .cvqv-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: #e9ecef;
    color: #495057;
    font-size: 10px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .cvqv-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cvqv-badges :global(.badge) {
    font-weight: 500;
    font-size: 11px;
  }
  .cvqv-dl {
    margin: 0;
  }
  .cvqv-row {
    display: grid;
    grid-template-columns: 108px 1fr;
    gap: 8px 12px;
    padding: 6px 0;
    border-bottom: 1px solid #f1f3f5;
  }
  .cvqv-row:last-child {
    border-bottom: none;
  }
  .cvqv-row--block {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .cvqv-row dt {
    margin: 0;
    font-size: 11px;
    font-weight: 500;
    color: #868e96;
  }
  .cvqv-row dd {
    margin: 0;
    color: #212529;
    font-size: 12px;
    font-weight: 500;
  }
  .cvqv-meta {
    color: #868e96;
    font-weight: 400;
  }
  .cvqv-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cvqv-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    font-size: 11px;
    font-weight: 500;
    color: #343a40;
  }
  .cvqv-chip--team {
    background: #e6f1fb;
    border-color: #b5d4f4;
    color: #185fa5;
  }
  .cvqv-chip--danger {
    background: #fff5f5;
    border-color: #ffc9c9;
    color: #c92a2a;
    margin-left: 6px;
  }
  .cvqv-chip--warn {
    background: #fff9db;
    border-color: #ffe066;
    color: #e67700;
    margin-left: 6px;
  }
  .cvqv-chip--soon {
    background: #e6fcf5;
    border-color: #96f2d7;
    color: #087f5b;
    margin-left: 6px;
  }
  .cvqv-jobs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cvqv-job {
    padding: 8px 10px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
  }
  .cvqv-job-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .cvqv-job-idx {
    font-size: 10.5px;
    font-weight: 600;
    color: #868e96;
  }
  .cvqv-job-cost {
    font-size: 11px;
    font-weight: 600;
    color: #087f5b;
  }
  .cvqv-job-line {
    font-size: 11.5px;
    color: #343a40;
    margin-top: 2px;
  }
  .cvqv-job-line strong {
    font-weight: 600;
    color: #495057;
  }
  .cvqv-job-total {
    margin-top: 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: #212529;
    text-align: right;
  }
  .cvqv-empty {
    font-size: 11.5px;
  }
  .cvqv-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e9ecef;
    flex-shrink: 0;
    background: #fff;
  }
</style>
