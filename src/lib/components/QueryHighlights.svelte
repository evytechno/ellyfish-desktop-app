<script>
  export let highlights = { telecallers: [], techs: [], techHelpers: [], overdueQueries: [] };
  export let loading = false;

  let activeTab = "telecallers";
  let selectedUserId = null;
  /** Content shown in the queries pane (may lag selection briefly for fade) */
  let displayUserId = null;
  let panelPhase = "idle"; // idle | out | in
  let queriesScrollEl;
  let switchTimer;

  const tagConfig = {
    high_reopen_rate:    { label: "High Reopen Rate", bg: "#dc3545", text: "#fff" },
    stuck_queries:       { label: "Stuck Queries",    bg: "#fd7e14", text: "#fff" },
    repeated_issue_type: { label: "Repeat Issues",    bg: "#0dcaf0", text: "#000" },
    inactive:            { label: "Inactive",          bg: "#6c757d", text: "#fff" },
    missed_replies:      { label: "Missed Replies",   bg: "#dc3545", text: "#fff" },
    low_resolution:      { label: "Low Resolution",   bg: "#fd7e14", text: "#fff" },
    high_backlog:        { label: "High Backlog",     bg: "#ffc107", text: "#000" },
    no_activity:         { label: "No Activity",      bg: "#6c757d", text: "#fff" },
  };

  const priorityColor = { high: "#dc3545", medium: "#fd7e14", low: "#198754" };
  const statusColor = {
    open: "#0d6efd",
    in_progress: "#e6a817",
    reopened: "#dc3545",
    resolved: "#198754",
    closed: "#6c757d",
  };

  $: tcCount = highlights.telecallers.length;
  $: techCount = highlights.techs.length;
  $: helperCount = highlights.techHelpers?.length ?? 0;
  $: overdueCount = highlights.overdueQueries?.length ?? 0;
  $: totalFlags = tcCount + techCount + helperCount;

  $: currentUsers =
    activeTab === "telecallers"
      ? highlights.telecallers
      : activeTab === "techs"
        ? highlights.techs
        : activeTab === "helpers"
          ? highlights.techHelpers ?? []
          : [];

  $: selectedUser =
    currentUsers.find((u) => u.userId === selectedUserId) ?? null;

  $: displayUser =
    currentUsers.find((u) => u.userId === displayUserId) ?? null;

  $: displayKind =
    activeTab === "telecallers" || activeTab === "techs" || activeTab === "helpers"
      ? activeTab
      : "telecallers";

  $: displaySections = displayUser ? querySections(displayUser, displayKind) : [];

  function applyUser(userId, animate = true) {
    selectedUserId = userId;
    if (!animate || displayUserId == null || displayUserId === userId) {
      displayUserId = userId;
      panelPhase = "idle";
      return;
    }

    panelPhase = "out";
    if (switchTimer) clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      displayUserId = userId;
      if (queriesScrollEl) queriesScrollEl.scrollTop = 0;
      panelPhase = "in";
      requestAnimationFrame(() => {
        switchTimer = setTimeout(() => {
          panelPhase = "idle";
          switchTimer = null;
        }, 180);
      });
    }, 110);
  }

  // Keep selection valid; auto-pick first user on tab / data change
  $: if (activeTab !== "overdue") {
    if (!currentUsers.length) {
      selectedUserId = null;
      displayUserId = null;
      panelPhase = "idle";
    } else if (!currentUsers.some((u) => u.userId === selectedUserId)) {
      applyUser(currentUsers[0].userId, false);
    }
  }

  function switchTab(tab) {
    if (switchTimer) clearTimeout(switchTimer);
    switchTimer = null;
    activeTab = tab;
    selectedUserId = null;
    displayUserId = null;
    panelPhase = "idle";
  }

  function selectUser(userId) {
    if (userId === selectedUserId && userId === displayUserId && panelPhase === "idle") return;
    applyUser(userId, true);
  }

  function fmtType(t) {
    return t ? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  }

  function fmtWait(mins) {
    if (!mins) return "";
    if (mins < 60) return `${mins}m waiting`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m waiting` : `${h}h waiting`;
  }

  function fmtDays(d) {
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    return `${d}d ago`;
  }

  function querySections(user, kind) {
    if (!user?.flaggedQueries) return [];
    const fq = user.flaggedQueries;
    if (kind === "telecallers") {
      return [
        { key: "reopened", title: "Reopened Queries", icon: "ti-refresh", color: "#dc3545", bg: "#ffe3e3", items: fq.reopened ?? [] },
        { key: "stuck", title: "Stuck Queries", icon: "ti-clock", color: "#e8590c", bg: "#fff4e6", items: fq.stuck ?? [] },
        {
          key: "repeated",
          title: user.topIssueType ? `Repeated: ${fmtType(user.topIssueType)}` : "Repeated Issues",
          icon: "ti-repeat",
          color: "#0c8599",
          bg: "#e3fafc",
          items: fq.repeated ?? [],
        },
      ].filter((s) => s.items.length);
    }
    return [
      { key: "missed", title: "Missed Replies", icon: "ti-message-off", color: "#dc3545", bg: "#ffe3e3", items: fq.missed ?? [] },
      {
        key: "stuck",
        title: "Stuck / Backlog",
        icon: "ti-clock",
        color: kind === "helpers" ? "#7048e8" : "#e8590c",
        bg: kind === "helpers" ? "#f3f0ff" : "#fff4e6",
        items: fq.stuck ?? [],
      },
    ].filter((s) => s.items.length);
  }

  function viewAllHref(user, kind) {
    if (kind === "telecallers") return `/admin/query?raisedById=${user.userId}`;
    return `/admin/query?assignedToId=${user.userId}`;
  }

  function userMeta(user, kind) {
    if (kind === "telecallers") {
      return `${user.total} queries · ${user.reopenRate}% reopen · ${user.stuck} stuck${
        user.topIssueType ? ` · Top: ${fmtType(user.topIssueType)}` : ""
      }`;
    }
    if (kind === "helpers") {
      return `${user.total} sub-queries · ${user.resolutionRate}% resolved · ${user.missedReplies} missed · ${user.stuck} stuck`;
    }
    return `${user.total} assigned · ${user.resolutionRate}% resolved · ${user.missedReplies} missed · ${user.stuck} stuck`;
  }
</script>

<div class="card flex-fill qh-card">
  <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2 py-3">
    <div class="d-flex align-items-center gap-2">
      <i class="ti ti-alert-triangle text-warning fs-5"></i>
      <h6 class="mb-0 fw-semibold">Query Highlights</h6>
      {#if totalFlags > 0}
        <span class="badge rounded-pill bg-danger">{totalFlags}</span>
      {/if}
    </div>
    <a href="/admin/query" class="text-decoration-none small text-primary d-flex align-items-center gap-1">
      View All <i class="ti ti-arrow-right"></i>
    </a>
  </div>

  <div class="card-body p-3">
    {#if loading}
      <div class="d-flex justify-content-center align-items-center py-5">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
      </div>
    {:else if totalFlags === 0 && overdueCount === 0}
      <div class="text-center py-4">
        <i class="ti ti-circle-check fs-1 text-success d-block mb-2"></i>
        <p class="text-muted mb-0 small">All users performing well</p>
      </div>
    {:else}
      <div class="qh-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="qh-tab"
          class:qh-tab--active={activeTab === "telecallers"}
          aria-selected={activeTab === "telecallers"}
          on:click={() => switchTab("telecallers")}
        >
          Telecallers
          {#if tcCount > 0}
            <span class="qh-tab-count">{tcCount}</span>
          {/if}
        </button>
        <button
          type="button"
          role="tab"
          class="qh-tab"
          class:qh-tab--active={activeTab === "techs"}
          aria-selected={activeTab === "techs"}
          on:click={() => switchTab("techs")}
        >
          Tech
          {#if techCount > 0}
            <span class="qh-tab-count">{techCount}</span>
          {/if}
        </button>
        <button
          type="button"
          role="tab"
          class="qh-tab"
          class:qh-tab--active={activeTab === "helpers"}
          aria-selected={activeTab === "helpers"}
          on:click={() => switchTab("helpers")}
        >
          Tech Helpers
          {#if helperCount > 0}
            <span class="qh-tab-count">{helperCount}</span>
          {/if}
        </button>
        <button
          type="button"
          role="tab"
          class="qh-tab qh-tab--danger"
          class:qh-tab--active={activeTab === "overdue"}
          aria-selected={activeTab === "overdue"}
          on:click={() => switchTab("overdue")}
        >
          Overdue
          {#if overdueCount > 0}
            <span class="qh-tab-count">{overdueCount}</span>
          {/if}
        </button>
      </div>

      <!-- User tabs: 30% list / 70% queries -->
      {#if activeTab === "telecallers" || activeTab === "techs" || activeTab === "helpers"}
        {@const kind = activeTab}
        {#if currentUsers.length === 0}
          <p class="text-muted text-center small py-3">
            {kind === "telecallers"
              ? "All telecallers performing well"
              : kind === "techs"
                ? "All tech users performing well"
                : "All tech helpers performing well"}
          </p>
        {:else}
          <div class="qh-split">
            <!-- Users (30%) -->
            <aside class="qh-users">
              <div class="qh-pane-label">Users</div>
              <div class="qh-users-scroll">
                {#each currentUsers as user}
                  {@const selected = selectedUserId === user.userId}
                  <button
                    type="button"
                    class="qh-user"
                    class:qh-user--active={selected}
                    on:click={() => selectUser(user.userId)}
                  >
                    <div class="qh-user-name">{user.name}</div>
                    <div class="qh-user-tags">
                      {#each user.tags as tag}
                        {@const cfg = tagConfig[tag]}
                        <span class="badge" style="background:{cfg?.bg}; color:{cfg?.text};">
                          {cfg?.label ?? tag}
                        </span>
                      {/each}
                    </div>
                    <div class="qh-user-meta text-muted">{userMeta(user, kind)}</div>
                  </button>
                {/each}
              </div>
            </aside>

            <!-- Queries (70%) -->
            <section class="qh-queries">
              <div class="qh-pane-label qh-pane-label--queries">
                <span class="qh-pane-label-text">
                  {#if selectedUser}
                    <span class="qh-pane-chip">Queries · {selectedUser.name}</span>
                  {:else}
                    <span class="qh-pane-chip qh-pane-chip--muted">Queries</span>
                  {/if}
                </span>
                {#if selectedUser}
                  <a
                    href={viewAllHref(selectedUser, kind)}
                    class="qh-view-all"
                  >
                    <span>{kind === "helpers" ? "View Sub-Queries" : "View All Queries"}</span>
                    <i class="ti ti-arrow-right"></i>
                  </a>
                {/if}
              </div>
              <div
                class="qh-queries-scroll"
                class:qh-queries-scroll--busy={panelPhase === "out"}
                bind:this={queriesScrollEl}
              >
                {#if panelPhase === "out"}
                  <div class="qh-skel" aria-hidden="true">
                    <div class="qh-skel-line qh-skel-line--sm"></div>
                    <div class="qh-skel-card"></div>
                    <div class="qh-skel-card"></div>
                    <div class="qh-skel-card qh-skel-card--short"></div>
                  </div>
                {:else if !displayUser}
                  <div class="qh-empty text-muted">Select a user to view flagged queries</div>
                {:else}
                  <div
                    class="qh-panel-body"
                    class:qh-panel-body--in={panelPhase === "in"}
                    class:qh-panel-body--idle={panelPhase === "idle"}
                  >
                    {#key displayUserId}
                      {#if displaySections.length === 0}
                        <div class="qh-empty text-muted">No flagged queries for this user</div>
                      {:else}
                        {#each displaySections as section}
                          <div class="qh-section">
                            <div class="qh-section-title">
                              <span
                                class="qh-section-chip"
                                style="background:{section.bg}; color:{section.color};"
                              >
                                <i class="ti {section.icon}"></i>
                                {section.title}
                              </span>
                            </div>
                            {#each section.items as q}
                              <a href="/admin/query/{q.id}" class="qh-query">
                                <div class="qh-query-body">
                                  <div class="qh-query-subject">{q.subject}</div>
                                  <div class="qh-query-meta">
                                    {#if q.priority}
                                      <span class="qh-tag" style="color:{priorityColor[q.priority] ?? '#6c757d'};">
                                        {q.priority}
                                      </span>
                                    {/if}
                                    {#if q.status}
                                      <span class="qh-tag" style="color:{statusColor[q.status] ?? '#6c757d'};">
                                        {q.status?.replace("_", " ")}
                                      </span>
                                    {/if}
                                    {#if q.waitingMins}
                                      <span class="qh-wait" style="color:#dc3545">{fmtWait(q.waitingMins)}</span>
                                    {:else if q.daysSince != null}
                                      <span class="text-muted">{fmtDays(q.daysSince)}</span>
                                    {/if}
                                  </div>
                                </div>
                                <i class="ti ti-external-link text-muted qh-query-link"></i>
                              </a>
                            {/each}
                          </div>
                        {/each}
                      {/if}
                    {/key}
                  </div>
                {/if}
              </div>
            </section>
          </div>
        {/if}

      <!-- Overdue — full width query list -->
      {:else if activeTab === "overdue"}
        {#if overdueCount === 0}
          <div class="text-center py-4">
            <i class="ti ti-circle-check fs-1 text-success d-block mb-2"></i>
            <p class="text-muted mb-0 small">No overdue queries — all picked up within 5 min</p>
          </div>
        {:else}
          <div class="qh-overdue-scroll">
            {#each highlights.overdueQueries as q}
              {@const isCritical = q.waitingMins >= 30}
              <a
                href="/admin/query/{q.id}"
                class="qh-overdue"
                class:qh-overdue--critical={isCritical}
              >
                <div class="qh-query-body">
                  <div class="qh-query-meta mb-1">
                    {#if isCritical}
                      <span class="qh-tag qh-pulse" style="color:#dc3545;">Critical</span>
                    {:else}
                      <span class="qh-tag" style="color:#e8590c;">Overdue</span>
                    {/if}
                    {#if q.isSubQuery}
                      <span class="qh-tag" style="color:#7950f2;">Sub-query</span>
                    {/if}
                    {#if q.priority}
                      <span class="qh-tag" style="color:{priorityColor[q.priority] ?? '#6c757d'};">
                        {q.priority}
                      </span>
                    {/if}
                  </div>
                  <div class="qh-query-subject">{q.subject}</div>
                  <div class="qh-wait mt-1" style="color:{isCritical ? '#c92a2a' : '#d9480f'}">
                    <i class="ti ti-clock me-1"></i>{fmtWait(q.waitingMins)}
                  </div>
                </div>
                <i class="ti ti-external-link text-muted qh-query-link"></i>
              </a>
            {/each}
          </div>
          <div class="mt-2 d-flex gap-2">
            <a href="/admin/query/open" class="btn btn-sm btn-outline-danger flex-fill">
              <i class="ti ti-inbox me-1"></i>Open Queue
            </a>
            <a href="/admin/query/sub-queue" class="btn btn-sm btn-outline-danger flex-fill">
              <i class="ti ti-subtask me-1"></i>Sub Queue
            </a>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  .qh-card {
    font-size: 12px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }

  .qh-card :global(h6) {
    font-size: 12.5px !important;
    font-weight: 650;
  }

  .qh-card :global(.badge) {
    font-size: 10px !important;
    font-weight: 600;
    line-height: 1.3;
  }

  .qh-card :global(.btn-sm) {
    font-size: 11.5px !important;
  }

  .qh-card :global(.small),
  .qh-card :global(.text-muted) {
    font-size: 11px !important;
  }

  /* ── Tab bar ───────────────────────────────────────────── */
  .qh-tabs {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-bottom: 12px;
    padding: 3px;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    background: #f8f9fa;
  }

  .qh-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #495057;
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .qh-tab:hover {
    background: #fff;
    color: #212529;
    border-color: #dee2e6;
  }

  .qh-tab--active {
    background: #fff !important;
    color: #0d6efd !important;
    border-color: #c5d8f7 !important;
    box-shadow: 0 1px 2px rgba(13, 110, 253, 0.08);
    font-weight: 600;
  }

  .qh-tab--active:hover {
    background: #fff !important;
    color: #0a58ca !important;
  }

  .qh-tab--danger.qh-tab--active {
    color: #c92a2a !important;
    border-color: #ffc9c9 !important;
    box-shadow: 0 1px 2px rgba(201, 42, 42, 0.08);
  }

  .qh-tab--danger.qh-tab--active:hover {
    color: #a61e1e !important;
  }

  .qh-tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    border-radius: 999px;
    background: #e9ecef;
    color: #495057;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
  }

  .qh-tab--active .qh-tab-count {
    background: #e7f1ff;
    color: #0d6efd;
  }

  .qh-tab--danger .qh-tab-count {
    background: #ffe3e3;
    color: #c92a2a;
  }

  .qh-tab--danger.qh-tab--active .qh-tab-count {
    background: #ffe3e3;
    color: #c92a2a;
  }

  .qh-split {
    display: flex;
    align-items: stretch;
    gap: 0;
    min-height: 320px;
    max-height: 520px;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }

  .qh-users {
    flex: 0 0 30%;
    width: 30%;
    max-width: 30%;
    border-right: 1px solid #e9ecef;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #fafbfc;
  }

  .qh-queries {
    flex: 1 1 70%;
    width: 70%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #fff;
  }

  .qh-pane-label {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #6c757d;
    border-bottom: 1px solid #e9ecef;
    background: transparent;
  }

  .qh-pane-label--queries {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .qh-pane-label-text {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .qh-pane-chip {
    display: inline-block;
    max-width: 100%;
    padding: 3px 8px;
    border-radius: 999px;
    background: #e7f1ff;
    color: #0b5ed7;
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.01em;
    text-transform: none;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .qh-pane-chip--muted {
    background: #f1f3f5;
    color: #6c757d;
  }

  .qh-view-all {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #c5d8f7;
    background: #f8fbff;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    text-decoration: none;
    color: #0d6efd;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }

  .qh-view-all :global(i) {
    font-size: 12px;
    transition: transform 0.15s ease;
  }

  .qh-view-all:hover {
    background: #0d6efd;
    border-color: #0d6efd;
    color: #fff;
    text-decoration: none;
    box-shadow: 0 2px 8px rgba(13, 110, 253, 0.28);
    transform: translateY(-1px);
  }

  .qh-view-all:hover :global(i) {
    transform: translateX(2px);
  }

  .qh-view-all:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .qh-users .qh-pane-label {
    background: transparent;
  }

  .qh-users-scroll,
  .qh-queries-scroll,
  .qh-overdue-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 470px;
  }

  .qh-overdue-scroll {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 520px;
  }

  .qh-user {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    border-bottom: 1px solid #eef0f2;
    background: transparent;
    padding: 10px 12px;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }

  .qh-user:hover {
    background: #f1f5f9;
  }

  .qh-user--active {
    background: #e7f1ff !important;
    box-shadow: inset 3px 0 0 #0d6efd;
  }

  .qh-user--active:hover {
    background: #dbeafe !important;
  }

  .qh-user-name {
    font-size: 12.5px;
    font-weight: 600;
    color: #212529;
    line-height: 1.3;
  }

  .qh-user-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 5px;
  }

  .qh-user-meta {
    margin-top: 4px;
    font-size: 10.5px !important;
    line-height: 1.35;
  }

  .qh-queries-scroll {
    padding: 10px 12px 12px;
  }

  .qh-queries-scroll--busy {
    pointer-events: none;
  }

  .qh-panel-body {
    opacity: 1;
    transform: translateY(0);
  }

  .qh-panel-body--in {
    animation: qh-fade-in 0.18s ease both;
  }

  @keyframes qh-fade-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .qh-skel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
    animation: qh-skel-pulse 0.9s ease infinite;
  }

  .qh-skel-line {
    height: 10px;
    width: 42%;
    border-radius: 4px;
    background: #e9ecef;
  }

  .qh-skel-line--sm {
    width: 28%;
    margin-bottom: 4px;
  }

  .qh-skel-card {
    height: 52px;
    border-radius: 6px;
    background: linear-gradient(90deg, #f1f3f5 0%, #e9ecef 50%, #f1f3f5 100%);
    background-size: 200% 100%;
    animation: qh-skel-shine 0.9s linear infinite;
  }

  .qh-skel-card--short {
    height: 40px;
    width: 88%;
  }

  @keyframes qh-skel-pulse {
    0%, 100% { opacity: 0.75; }
    50% { opacity: 1; }
  }

  @keyframes qh-skel-shine {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  .qh-section {
    margin-bottom: 14px;
  }

  .qh-section-title {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    background: transparent;
  }

  .qh-section-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 650;
    line-height: 1.3;
  }

  .qh-section-chip :global(i) {
    font-size: 12px;
  }

  .qh-query,
  .qh-overdue {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    margin-bottom: 6px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #fff;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }

  .qh-query:hover,
  .qh-overdue:hover {
    border-color: #91b7f5;
    background: #f8fbff;
    box-shadow: 0 2px 8px rgba(13, 110, 253, 0.08);
    transform: translateY(-1px);
  }

  .qh-query:hover .qh-query-link {
    color: #0d6efd !important;
  }

  .qh-overdue {
    margin-bottom: 0;
    background: #fff9f0;
    border-color: #ffd8a8 !important;
  }

  .qh-overdue--critical {
    background: #fff5f5;
    border-color: #ffc9c9 !important;
  }

  .qh-query-body {
    min-width: 0;
    flex: 1;
  }

  .qh-query-subject {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.35;
    color: #212529;
  }

  .qh-query-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .qh-tag {
    display: inline;
    padding: 0;
    margin: 0;
    border: none;
    background: none !important;
    font-size: 9px;
    font-weight: 400;
    line-height: 1.3;
    text-transform: capitalize;
    letter-spacing: 0.01em;
  }

  .qh-wait {
    font-size: 11px;
    font-weight: 600;
  }

  .qh-query-link {
    flex-shrink: 0;
    font-size: 14px;
  }

  .qh-empty {
    padding: 36px 12px;
    text-align: center;
    font-size: 12px;
  }

  .qh-pulse {
    animation: od-pulse 1s infinite;
  }

  @keyframes od-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }

  @media (max-width: 767.98px) {
    .qh-split {
      flex-direction: column;
      max-height: none;
    }

    .qh-users,
    .qh-queries {
      flex: none;
      width: 100%;
      max-width: none;
    }

    .qh-users {
      border-right: none;
      border-bottom: 1px solid #e9ecef;
      max-height: 220px;
    }

    .qh-users-scroll {
      max-height: 180px;
    }

    .qh-queries-scroll {
      max-height: 360px;
    }
  }
</style>
