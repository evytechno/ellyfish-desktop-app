<script>
  import { fly, fade } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { eventLabel } from "../lib/format.js";

  /** @type {any} */
  export let detailRow = null;
  /** @type {'order' | 'auth'} */
  export let detailKind = "order";
  /** @type {any[]} */
  export let detailFlags = [];
  /** @type {string[]} */
  export let detailTips = [];
  export let detailSeverity = "ok";
  /** @type {any} */
  export let detailMeta = null;
  /** @type {{ absolute: string, relative: string }} */
  export let detailWhen = { absolute: "-", relative: "" };
  /** @type {string|null} */
  export let detailMapsUrl = null;
  /** @type {any} */
  export let currentUser = null;

  /** @type {() => void} */
  export let onClose = () => {};
  /** @type {() => void} */
  export let onFilterSameUser = () => {};
  /** @type {(user: any) => void} */
  export let onAuthTrail = () => {};
  /** @type {(email: string) => void} */
  export let onFilterAuthByEmail = () => {};
  /** @type {(ip: string) => void} */
  export let onFilterAuthByIp = () => {};
  /** @type {() => void} */
  export let onFilterSameEvent = () => {};
  /** @type {(value: string, label?: string) => void} */
  export let onCopyField = () => {};
</script>

{#if detailRow}
  <div
    class="hx-drawer-backdrop"
    transition:fade={{ duration: 120 }}
    on:click={onClose}
    on:keydown={() => {}}
    role="presentation"
  ></div>
  <aside class="hx-drawer" transition:fly={{ x: 360, duration: 220, easing: quintOut }}>
    <div class="hx-drawer-head hx-drawer-head--{detailSeverity}">
      <div>
        <div class="hx-drawer-kicker">
          {detailKind === "auth" ? "Auth event" : "Order activity"}
        </div>
        <h5 class="hx-drawer-title">
          {#if detailKind === "auth"}
            {eventLabel(detailRow.event)}
          {:else}
            {detailRow.title || "Activity"}
          {/if}
        </h5>
        {#if detailFlags.length}
          <div class="hx-flags hx-flags--drawer">
            {#each detailFlags as f}
              <span class="hx-flag hx-flag--{f.level}" title={f.hint || f.label}>{f.label}</span>
            {/each}
          </div>
        {/if}
      </div>
      <button type="button" class="btn btn-sm btn-light" on:click={onClose}>
        <i class="ti ti-x"></i>
      </button>
    </div>

    <div class="hx-drawer-body">
      {#if detailTips.length}
        <div class="hx-decide hx-decide--{detailSeverity}">
          <div class="hx-block-label"><i class="ti ti-bulb"></i> What to check</div>
          <ul class="hx-decide-list">
            {#each detailTips as tip}
              <li>{tip}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="hx-kv">
        <span>When</span>
        <strong>
          {#if detailWhen.relative || detailWhen.absolute}
            {detailWhen.relative}{detailWhen.relative && detailWhen.absolute ? " · " : ""}{detailWhen.absolute}
          {:else}
            —
          {/if}
        </strong>
      </div>

      {#if detailKind === "order"}
        <div class="hx-kv">
          <span>Activity</span>
          <strong>{detailRow.title || "—"}</strong>
        </div>
        <div class="hx-kv">
          <span>User</span>
          <strong>{detailRow?.user?.name || "—"}</strong>
        </div>
        {#if detailRow?.order?.id}
          <div class="hx-kv">
            <span>Order</span>
            <a href="/admin/order/{detailRow.order.id}" class="hx-link">
              {detailRow.order.pId ? `#${detailRow.order.pId} · ` : ""}{detailRow.order.title ||
                "Open order"}
            </a>
          </div>
        {/if}
        <div class="hx-block">
          <div class="hx-block-label">Description</div>
          <p class="hx-block-text">{detailRow.description || "—"}</p>
        </div>
        {#if detailRow.data}
          <div class="hx-block">
            <div class="hx-block-label">Payload</div>
            <pre class="hx-pre">{JSON.stringify(detailRow.data, null, 2)}</pre>
          </div>
        {/if}
        <div class="hx-quick">
          {#if detailRow?.order?.id}
            <a class="btn btn-sm btn-primary" href="/admin/order/{detailRow.order.id}">
              <i class="ti ti-external-link"></i> Open order
            </a>
          {/if}
          {#if detailRow?.user?.id}
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={onFilterSameUser}>
              <i class="ti ti-filter"></i> Same user
            </button>
          {/if}
          {#if detailRow?.user?.email && (currentUser?.role === "master" || currentUser?.role === "admin")}
            <button
              type="button"
              class="btn btn-sm btn-outline-primary"
              on:click={() => onAuthTrail(detailRow.user)}
            >
              <i class="ti ti-shield-lock"></i> Auth trail
            </button>
          {/if}
        </div>
      {:else}
        <div class="hx-kv">
          <span>Actor</span>
          <strong
            >{detailRow?.user?.name || detailRow.userEmail || "—"}{#if detailRow.userEmail && detailRow?.user?.name}<span
                class="hx-muted"
              >
                · {detailRow.userEmail}</span
              >{/if}</strong
          >
          {#if detailRow.userEmail}
            <button
              type="button"
              class="hx-copy"
              title="Copy email"
              on:click={() => onCopyField(detailRow.userEmail, "Email")}
            >
              <i class="ti ti-copy"></i>
            </button>
          {/if}
        </div>
        <div class="hx-kv">
          <span>IP / City</span>
          <strong class="hx-mono"
            >{detailRow.ipAddress || "—"}{detailRow.city ? ` · ${detailRow.city}` : ""}</strong
          >
          {#if detailRow.ipAddress}
            <button
              type="button"
              class="hx-copy"
              title="Copy IP"
              on:click={() => onCopyField(detailRow.ipAddress, "IP")}
            >
              <i class="ti ti-copy"></i>
            </button>
          {/if}
        </div>
        <div class="hx-kv">
          <span>Device</span>
          <strong
            >{detailRow.deviceName || "Unknown"} · {detailRow.device || "—"} · {detailRow.browser ||
              ""} / {detailRow.os || ""}</strong
          >
        </div>
        {#if detailRow.locationLabel}
          <div class="hx-kv">
            <span>Location</span>
            <strong>{detailRow.locationLabel}</strong>
          </div>
        {/if}
        {#if detailMapsUrl}
          <a class="hx-maps" href={detailMapsUrl} target="_blank" rel="noopener noreferrer">
            <i class="ti ti-map-2"></i> Open in Google Maps
          </a>
        {/if}
        {#if detailRow.failReason}
          <div class="hx-block hx-block--danger">
            <div class="hx-block-label">Fail reason</div>
            <p class="hx-block-text">{detailRow.failReason}</p>
          </div>
        {/if}
        {#if detailMeta}
          <div class="hx-block">
            <div class="hx-block-label">Metadata</div>
            <pre class="hx-pre">{JSON.stringify(detailMeta, null, 2)}</pre>
          </div>
        {/if}
        <div class="hx-quick">
          {#if detailRow.userEmail}
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              on:click={() => onFilterAuthByEmail(detailRow.userEmail)}
            >
              <i class="ti ti-mail"></i> Same email
            </button>
          {/if}
          {#if detailRow.ipAddress}
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              on:click={() => onFilterAuthByIp(detailRow.ipAddress)}
            >
              <i class="ti ti-network"></i> Same IP
            </button>
          {/if}
          {#if detailRow.event}
            <button
              type="button"
              class="btn btn-sm btn-outline-primary"
              on:click={onFilterSameEvent}
            >
              <i class="ti ti-filter"></i> Same event
            </button>
          {/if}
          {#if detailRow.failReason}
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              on:click={() => onCopyField(detailRow.failReason, "Fail reason")}
            >
              <i class="ti ti-copy"></i> Copy reason
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </aside>
{/if}
