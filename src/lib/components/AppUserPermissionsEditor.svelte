<script>
  /** @type {{ sample_view: boolean, sample_update: boolean, dispatch_view: boolean, dispatch_update: boolean, dispatch_hold: boolean }} */
  export let permissions;

  const groups = [
    {
      title: "Sample orders",
      icon: "ti ti-package",
      hint: "Movement status, notes, photos",
      items: [
        { key: "sample_view", label: "View", desc: "List & detail" },
        { key: "sample_update", label: "Update", desc: "Status & photos" },
      ],
    },
    {
      title: "Order dispatch",
      icon: "ti ti-truck-delivery",
      hint: "Dispatch stages & hold",
      items: [
        { key: "dispatch_view", label: "View", desc: "List & detail" },
        { key: "dispatch_update", label: "Update", desc: "Status & stages" },
        { key: "dispatch_hold", label: "Hold", desc: "Hold + remark" },
      ],
    },
  ];

  function toggle(key) {
    permissions = { ...permissions, [key]: !permissions[key] };
  }

  function setGroup(group, on) {
    const next = { ...permissions };
    for (const item of group.items) next[item.key] = on;
    permissions = next;
  }

  function groupAllOn(group) {
    return group.items.every((i) => permissions[i.key]);
  }
</script>

<div class="app-perm">
  <div class="app-perm__banner">
    <i class="ti ti-shield-lock"></i>
    <div>
      <strong>App-only access</strong>
      <span>CRM login is never granted. These rights apply only to the Sample / Dispatch app.</span>
    </div>
  </div>

  <div class="app-perm__grid">
    {#each groups as group}
      <div class="app-perm__card">
        <div class="app-perm__card-head">
          <div class="app-perm__card-title">
            <i class={group.icon}></i>
            <div>
              <div class="fw-semibold">{group.title}</div>
              <small class="text-muted">{group.hint}</small>
            </div>
          </div>
          <button
            type="button"
            class="btn btn-sm {groupAllOn(group) ? 'btn-soft-danger' : 'btn-soft-secondary'}"
            on:click={() => setGroup(group, !groupAllOn(group))}
          >
            {groupAllOn(group) ? "Clear" : "All"}
          </button>
        </div>
        <div class="app-perm__items">
          {#each group.items as item}
            <button
              type="button"
              class="app-perm__chip"
              class:is-on={permissions[item.key]}
              on:click={() => toggle(item.key)}
            >
              <span class="app-perm__check">
                {#if permissions[item.key]}
                  <i class="ti ti-check"></i>
                {/if}
              </span>
              <span class="app-perm__chip-text">
                <strong>{item.label}</strong>
                <small>{item.desc}</small>
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .app-perm__banner {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: #fff5f5;
    border: 1px solid #fecaca;
    margin-bottom: 1rem;
  }
  .app-perm__banner i {
    font-size: 1.25rem;
    color: #dc2626;
    margin-top: 0.1rem;
  }
  .app-perm__banner strong {
    display: block;
    font-size: 0.875rem;
    color: #991b1b;
  }
  .app-perm__banner span {
    display: block;
    font-size: 0.8rem;
    color: #7f1d1d;
    opacity: 0.85;
  }
  .app-perm__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  @media (min-width: 992px) {
    .app-perm__grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 768px) {
    .app-perm__grid {
      grid-template-columns: 1fr;
    }
  }
  .app-perm__card {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: #fafafa;
    padding: 0.75rem;
  }
  .app-perm__card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }
  .app-perm__card-title {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .app-perm__card-title > i {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.4rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #dc2626;
    flex-shrink: 0;
  }
  .app-perm__items {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .app-perm__chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.55rem;
    border-radius: 0.4rem;
    border: 1px solid #e5e7eb;
    background: #fff;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  }
  .app-perm__chip:hover {
    border-color: #fca5a5;
  }
  .app-perm__chip.is-on {
    border-color: #f87171;
    background: #fff1f2;
    box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.08);
  }
  .app-perm__check {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.3rem;
    border: 1.5px solid #d1d5db;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: #fff;
    color: #fff;
    font-size: 0.75rem;
  }
  .app-perm__chip.is-on .app-perm__check {
    background: #dc2626;
    border-color: #dc2626;
  }
  .app-perm__chip-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .app-perm__chip-text strong {
    font-size: 0.875rem;
    color: #111827;
  }
  .app-perm__chip-text small {
    font-size: 0.72rem;
    color: #6b7280;
  }
</style>
