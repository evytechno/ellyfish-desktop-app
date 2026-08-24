<script>
  import { createEventDispatcher } from "svelte";
  import { MODULE_GROUPS } from "$lib/constants/modulePermissions";

  export let modulePermissions = {};

  const dispatch = createEventDispatcher();
  const LEVELS = [
    { value: "none", label: "None" },
    { value: "view", label: "View" },
    { value: "full", label: "Full" },
  ];

  let tick = 0;

  function emit(next) {
    modulePermissions = next;
    tick += 1;
    dispatch("change", next);
  }

  function getLevel(key) {
    return modulePermissions?.[key] ?? "none";
  }

  function setLevel(key, value) {
    emit({ ...modulePermissions, [key]: value });
  }

  function setGroup(modules, value) {
    const next = { ...modulePermissions };
    for (const mod of modules) next[mod.key] = value;
    emit(next);
  }

  function groupLevel(modules) {
    if (!modules.length) return "";
    const first = getLevel(modules[0].key);
    return modules.every((m) => getLevel(m.key) === first) ? first : "";
  }

  function groupSummary(modules) {
    const counts = { none: 0, view: 0, full: 0 };
    for (const mod of modules) counts[getLevel(mod.key)] += 1;
    if (!counts.view && !counts.full) return "All none";
    const parts = [];
    if (counts.full) parts.push(`${counts.full} full`);
    if (counts.view) parts.push(`${counts.view} view`);
    if (counts.none) parts.push(`${counts.none} none`);
    return parts.join(" · ");
  }
</script>

<div class="mod-access">
  <div class="mod-access__intro">
    <div class="mod-access__title">Module access</div>
    <p class="mod-access__hint">
      Default is <strong>None</strong>. Only selected modules are granted.
      <strong>Full</strong> applies to that module only.
    </p>
  </div>

  {#key tick}
  <div class="mod-access__grid">
    {#each MODULE_GROUPS as group}
      <section class="mod-card">
        <header class="mod-card__head">
          <div>
            <h6 class="mod-card__title">{group.label}</h6>
            <span class="mod-card__meta">{groupSummary(group.modules)}</span>
          </div>
          <div class="mod-card__bulk" title="Apply to all modules in this group">
            {#each LEVELS as opt}
              <button
                type="button"
                class="mod-bulk"
                class:is-on={groupLevel(group.modules) === opt.value}
                on:click={() => setGroup(group.modules, opt.value)}
              >{opt.label}</button>
            {/each}
          </div>
        </header>
        <ul class="mod-list">
          {#each group.modules as mod}
            <li
              class="mod-row"
              class:mod-row--none={getLevel(mod.key) === "none"}
              class:mod-row--view={getLevel(mod.key) === "view"}
              class:mod-row--full={getLevel(mod.key) === "full"}
            >
              <span class="mod-row__name">{mod.label}</span>
              <div class="seg" role="group" aria-label="{mod.label} access">
                {#each LEVELS as opt}
                  <button
                    type="button"
                    class="seg__btn seg__btn--{opt.value}"
                    class:is-on={getLevel(mod.key) === opt.value}
                    on:click={() => setLevel(mod.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
  {/key}
</div>

<style>
  .mod-access {
    margin-top: 4px;
  }
  .mod-access__title {
    font-size: 14px;
    font-weight: 700;
    color: #1e2937;
  }
  .mod-access__hint {
    margin: 4px 0 12px;
    font-size: 12px;
    color: #64748b;
    line-height: 1.45;
    max-width: 640px;
  }
  .mod-access__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }
  .mod-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .mod-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: #f8fafc;
    border-bottom: 1px solid #eef2f7;
  }
  .mod-card__title {
    margin: 0;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #334155;
  }
  .mod-card__meta {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: #94a3b8;
  }
  .mod-card__bulk {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .mod-bulk {
    border: 0;
    background: #e2e8f0;
    color: #475569;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 999px;
    cursor: pointer;
  }
  .mod-bulk.is-on {
    background: #1e293b;
    color: #fff;
  }
  .mod-list {
    list-style: none;
    margin: 0;
    padding: 6px;
  }
  .mod-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 8px;
  }
  .mod-row + .mod-row {
    margin-top: 2px;
  }
  .mod-row--none {
    background: #f8fafc;
  }
  .mod-row--view {
    background: #eff6ff;
  }
  .mod-row--full {
    background: #ecfdf5;
  }
  .mod-row__name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seg {
    display: inline-flex;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
    flex-shrink: 0;
  }
  .seg__btn {
    border: 0;
    background: transparent;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 9px;
    cursor: pointer;
    line-height: 1;
  }
  .seg__btn + .seg__btn {
    border-left: 1px solid #e2e8f0;
  }
  .seg__btn.is-on.seg__btn--none {
    background: #64748b;
    color: #fff;
  }
  .seg__btn.is-on.seg__btn--view {
    background: #2563eb;
    color: #fff;
  }
  .seg__btn.is-on.seg__btn--full {
    background: #059669;
    color: #fff;
  }
  @media (max-width: 576px) {
    .mod-access__grid {
      grid-template-columns: 1fr;
    }
    .mod-card__head {
      flex-direction: column;
    }
  }
</style>
