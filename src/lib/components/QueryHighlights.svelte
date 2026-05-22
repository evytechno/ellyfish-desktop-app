<script>
  export let highlights = { telecallers: [], techs: [] };
  export let loading = false;

  let activeTab = 'telecallers';
  let expandedUsers = new Set();

  const tagConfig = {
    high_reopen_rate:    { label: 'High Reopen Rate',  bg: '#dc3545', text: '#fff' },
    stuck_queries:       { label: 'Stuck Queries',     bg: '#fd7e14', text: '#fff' },
    repeated_issue_type: { label: 'Repeat Issues',     bg: '#0dcaf0', text: '#000' },
    inactive:            { label: 'Inactive',           bg: '#6c757d', text: '#fff' },
    missed_replies:      { label: 'Missed Replies',    bg: '#dc3545', text: '#fff' },
    low_resolution:      { label: 'Low Resolution',    bg: '#fd7e14', text: '#fff' },
    high_backlog:        { label: 'High Backlog',      bg: '#ffc107', text: '#000' },
    no_activity:         { label: 'No Activity',       bg: '#6c757d', text: '#fff' },
  };

  const priorityColor = { high: '#dc3545', medium: '#fd7e14', low: '#198754' };
  const statusColor   = {
    open: '#0d6efd', in_progress: '#e6a817',
    reopened: '#dc3545', resolved: '#198754', closed: '#6c757d',
  };

  $: totalFlags = highlights.telecallers.length + highlights.techs.length;
  $: tcCount    = highlights.telecallers.length;
  $: techCount  = highlights.techs.length;

  function toggleUser(userId) {
    if (expandedUsers.has(userId)) expandedUsers.delete(userId);
    else expandedUsers.add(userId);
    expandedUsers = expandedUsers;
  }

  function switchTab(tab) {
    activeTab = tab;
    expandedUsers = new Set();
  }

  function fmtType(t) {
    return t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
  }

  function fmtWait(mins) {
    if (!mins) return '';
    if (mins < 60) return `${mins}m waiting`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m waiting` : `${h}h waiting`;
  }

  function fmtDays(d) {
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    return `${d}d ago`;
  }
</script>

<div class="card flex-fill">
  <!-- Header -->
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

    {:else if totalFlags === 0}
      <div class="text-center py-4">
        <i class="ti ti-circle-check fs-1 text-success d-block mb-2"></i>
        <p class="text-muted mb-0 small">All users performing well</p>
      </div>

    {:else}
      <!-- Tab buttons -->
      <div class="d-flex gap-2 mb-3">
        <button
          type="button"
          class="btn btn-sm px-3 {activeTab === 'telecallers' ? 'btn-primary' : 'btn-outline-secondary'}"
          on:click={() => switchTab('telecallers')}
        >
          Telecallers
          {#if tcCount > 0}
            <span class="badge ms-1 {activeTab === 'telecallers' ? 'bg-white text-primary' : 'bg-danger text-white'}">{tcCount}</span>
          {/if}
        </button>
        <button
          type="button"
          class="btn btn-sm px-3 {activeTab === 'techs' ? 'btn-primary' : 'btn-outline-secondary'}"
          on:click={() => switchTab('techs')}
        >
          Tech
          {#if techCount > 0}
            <span class="badge ms-1 {activeTab === 'techs' ? 'bg-white text-primary' : 'bg-danger text-white'}">{techCount}</span>
          {/if}
        </button>
      </div>

      <!-- ── Telecallers tab ─────────────────────────────────────────────── -->
      {#if activeTab === 'telecallers'}
        {#if tcCount === 0}
          <p class="text-muted text-center small py-3">All telecallers performing well</p>
        {:else}
          <div class="d-flex flex-column gap-2" style="max-height:520px; overflow-y:auto; overflow-x:hidden;">
            {#each highlights.telecallers as user}
              {@const expanded = expandedUsers.has(user.userId)}
              <div class="border rounded">

                <!-- Row header — click to expand/collapse -->
                <button
                  type="button"
                  class="w-100 d-flex align-items-start justify-content-between p-2 text-start border-0"
                  style="background:{expanded ? '#eef3fb' : '#fafafa'}; cursor:pointer; transition:background 0.15s;"
                  on:click={() => toggleUser(user.userId)}
                >
                  <div class="flex-grow-1 me-2">
                    <div class="fw-semibold" style="font-size:0.875rem">{user.name}</div>
                    <div class="d-flex flex-wrap gap-1 mt-1">
                      {#each user.tags as tag}
                        {@const cfg = tagConfig[tag]}
                        <span class="badge" style="font-size:0.68rem; background:{cfg?.bg}; color:{cfg?.text};">
                          {cfg?.label ?? tag}
                        </span>
                      {/each}
                    </div>
                    <div class="text-muted mt-1" style="font-size:0.72rem;">
                      {user.total} queries &nbsp;·&nbsp; {user.reopenRate}% reopen &nbsp;·&nbsp; {user.stuck} stuck
                      {#if user.topIssueType}&nbsp;·&nbsp; Top: {fmtType(user.topIssueType)}{/if}
                    </div>
                  </div>
                  <i class="ti {expanded ? 'ti-chevron-down' : 'ti-chevron-right'} text-muted mt-1 flex-shrink-0"></i>
                </button>

                <!-- Expanded detail panel -->
                {#if expanded}
                  <div class="border-top p-2" style="background:#f8f9fa;">

                    <!-- Reopened queries -->
                    {#if user.flaggedQueries?.reopened?.length}
                      <div class="mb-2">
                        <div class="d-flex align-items-center gap-1 mb-1">
                          <i class="ti ti-refresh" style="font-size:0.78rem; color:#dc3545;"></i>
                          <span class="fw-semibold" style="font-size:0.74rem; color:#dc3545;">Reopened Queries</span>
                        </div>
                        {#each user.flaggedQueries.reopened as q}
                          <a href="/admin/query/{q.id}"
                            class="d-flex align-items-center justify-content-between p-2 rounded mb-1 text-decoration-none text-dark"
                            style="background:#fff; border:1px solid #dee2e6;">
                            <div>
                              <div style="font-size:0.8rem; font-weight:500; line-height:1.3;">{q.subject}</div>
                              <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
                                <span class="badge" style="font-size:0.63rem; background:{priorityColor[q.priority] ?? '#6c757d'}; color:#fff;">{q.priority}</span>
                                <span class="badge" style="font-size:0.63rem; background:{statusColor[q.status] ?? '#6c757d'}; color:#fff;">{q.status?.replace('_',' ')}</span>
                                <span class="text-muted" style="font-size:0.7rem;">{fmtDays(q.daysSince)}</span>
                              </div>
                            </div>
                            <i class="ti ti-external-link text-muted flex-shrink-0 ms-2" style="font-size:0.85rem;"></i>
                          </a>
                        {/each}
                      </div>
                    {/if}

                    <!-- Stuck queries -->
                    {#if user.flaggedQueries?.stuck?.length}
                      <div class="mb-2">
                        <div class="d-flex align-items-center gap-1 mb-1">
                          <i class="ti ti-clock" style="font-size:0.78rem; color:#fd7e14;"></i>
                          <span class="fw-semibold" style="font-size:0.74rem; color:#fd7e14;">Stuck Queries</span>
                        </div>
                        {#each user.flaggedQueries.stuck as q}
                          <a href="/admin/query/{q.id}"
                            class="d-flex align-items-center justify-content-between p-2 rounded mb-1 text-decoration-none text-dark"
                            style="background:#fff; border:1px solid #dee2e6;">
                            <div>
                              <div style="font-size:0.8rem; font-weight:500; line-height:1.3;">{q.subject}</div>
                              <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
                                <span class="badge" style="font-size:0.63rem; background:{priorityColor[q.priority] ?? '#6c757d'}; color:#fff;">{q.priority}</span>
                                <span class="badge" style="font-size:0.63rem; background:{statusColor[q.status] ?? '#6c757d'}; color:#fff;">{q.status?.replace('_',' ')}</span>
                                <span class="text-muted" style="font-size:0.7rem;">{fmtDays(q.daysSince)}</span>
                              </div>
                            </div>
                            <i class="ti ti-external-link text-muted flex-shrink-0 ms-2" style="font-size:0.85rem;"></i>
                          </a>
                        {/each}
                      </div>
                    {/if}

                    <!-- Repeated issue type -->
                    {#if user.flaggedQueries?.repeated?.length}
                      <div class="mb-2">
                        <div class="d-flex align-items-center gap-1 mb-1">
                          <i class="ti ti-repeat" style="font-size:0.78rem; color:#0dcaf0;"></i>
                          <span class="fw-semibold" style="font-size:0.74rem; color:#0a9ab0;">
                            Repeated: {fmtType(user.topIssueType)}
                          </span>
                        </div>
                        {#each user.flaggedQueries.repeated as q}
                          <a href="/admin/query/{q.id}"
                            class="d-flex align-items-center justify-content-between p-2 rounded mb-1 text-decoration-none text-dark"
                            style="background:#fff; border:1px solid #dee2e6;">
                            <div>
                              <div style="font-size:0.8rem; font-weight:500; line-height:1.3;">{q.subject}</div>
                              <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
                                <span class="badge" style="font-size:0.63rem; background:{priorityColor[q.priority] ?? '#6c757d'}; color:#fff;">{q.priority}</span>
                                <span class="text-muted" style="font-size:0.7rem;">{fmtDays(q.daysSince)}</span>
                              </div>
                            </div>
                            <i class="ti ti-external-link text-muted flex-shrink-0 ms-2" style="font-size:0.85rem;"></i>
                          </a>
                        {/each}
                      </div>
                    {/if}

                    <a href="/admin/query?raisedById={user.userId}"
                      class="btn btn-sm btn-outline-primary w-100 mt-1"
                      style="font-size:0.8rem;">
                      View All Queries &nbsp;<i class="ti ti-arrow-right"></i>
                    </a>
                  </div>
                {/if}

              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- ── Tech tab ──────────────────────────────────────────────────────── -->
      {#if activeTab === 'techs'}
        {#if techCount === 0}
          <p class="text-muted text-center small py-3">All tech users performing well</p>
        {:else}
          <div class="d-flex flex-column gap-2" style="max-height:520px; overflow-y:auto; overflow-x:hidden;">
            {#each highlights.techs as user}
              {@const expanded = expandedUsers.has(user.userId)}
              <div class="border rounded">

                <!-- Row header -->
                <button
                  type="button"
                  class="w-100 d-flex align-items-start justify-content-between p-2 text-start border-0"
                  style="background:{expanded ? '#eef3fb' : '#fafafa'}; cursor:pointer; transition:background 0.15s;"
                  on:click={() => toggleUser(user.userId)}
                >
                  <div class="flex-grow-1 me-2">
                    <div class="fw-semibold" style="font-size:0.875rem">{user.name}</div>
                    <div class="d-flex flex-wrap gap-1 mt-1">
                      {#each user.tags as tag}
                        {@const cfg = tagConfig[tag]}
                        <span class="badge" style="font-size:0.68rem; background:{cfg?.bg}; color:{cfg?.text};">
                          {cfg?.label ?? tag}
                        </span>
                      {/each}
                    </div>
                    <div class="text-muted mt-1" style="font-size:0.72rem;">
                      {user.total} assigned &nbsp;·&nbsp; {user.resolutionRate}% resolved &nbsp;·&nbsp; {user.missedReplies} missed &nbsp;·&nbsp; {user.stuck} stuck
                    </div>
                  </div>
                  <i class="ti {expanded ? 'ti-chevron-down' : 'ti-chevron-right'} text-muted mt-1 flex-shrink-0"></i>
                </button>

                <!-- Expanded detail panel -->
                {#if expanded}
                  <div class="border-top p-2" style="background:#f8f9fa;">

                    <!-- Missed replies -->
                    {#if user.flaggedQueries?.missed?.length}
                      <div class="mb-2">
                        <div class="d-flex align-items-center gap-1 mb-1">
                          <i class="ti ti-message-off" style="font-size:0.78rem; color:#dc3545;"></i>
                          <span class="fw-semibold" style="font-size:0.74rem; color:#dc3545;">Missed Replies</span>
                        </div>
                        {#each user.flaggedQueries.missed as q}
                          <a href="/admin/query/{q.id}"
                            class="d-flex align-items-center justify-content-between p-2 rounded mb-1 text-decoration-none text-dark"
                            style="background:#fff; border:1px solid #dee2e6;">
                            <div>
                              <div style="font-size:0.8rem; font-weight:500; line-height:1.3;">{q.subject}</div>
                              <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
                                <span class="badge" style="font-size:0.63rem; background:{priorityColor[q.priority] ?? '#6c757d'}; color:#fff;">{q.priority}</span>
                                {#if q.waitingMins}
                                  <span class="fw-semibold" style="font-size:0.7rem; color:#dc3545;">{fmtWait(q.waitingMins)}</span>
                                {/if}
                              </div>
                            </div>
                            <i class="ti ti-external-link text-muted flex-shrink-0 ms-2" style="font-size:0.85rem;"></i>
                          </a>
                        {/each}
                      </div>
                    {/if}

                    <!-- Stuck / backlog -->
                    {#if user.flaggedQueries?.stuck?.length}
                      <div class="mb-2">
                        <div class="d-flex align-items-center gap-1 mb-1">
                          <i class="ti ti-clock" style="font-size:0.78rem; color:#fd7e14;"></i>
                          <span class="fw-semibold" style="font-size:0.74rem; color:#fd7e14;">Stuck / Backlog</span>
                        </div>
                        {#each user.flaggedQueries.stuck as q}
                          <a href="/admin/query/{q.id}"
                            class="d-flex align-items-center justify-content-between p-2 rounded mb-1 text-decoration-none text-dark"
                            style="background:#fff; border:1px solid #dee2e6;">
                            <div>
                              <div style="font-size:0.8rem; font-weight:500; line-height:1.3;">{q.subject}</div>
                              <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
                                <span class="badge" style="font-size:0.63rem; background:{priorityColor[q.priority] ?? '#6c757d'}; color:#fff;">{q.priority}</span>
                                <span class="badge" style="font-size:0.63rem; background:{statusColor[q.status] ?? '#6c757d'}; color:#fff;">{q.status?.replace('_',' ')}</span>
                                <span class="text-muted" style="font-size:0.7rem;">{fmtDays(q.daysSince)}</span>
                              </div>
                            </div>
                            <i class="ti ti-external-link text-muted flex-shrink-0 ms-2" style="font-size:0.85rem;"></i>
                          </a>
                        {/each}
                      </div>
                    {/if}

                    <a href="/admin/query?assignedToId={user.userId}"
                      class="btn btn-sm btn-outline-primary w-100 mt-1"
                      style="font-size:0.8rem;">
                      View All Queries &nbsp;<i class="ti ti-arrow-right"></i>
                    </a>
                  </div>
                {/if}

              </div>
            {/each}
          </div>
        {/if}
      {/if}

    {/if}
  </div>
</div>
