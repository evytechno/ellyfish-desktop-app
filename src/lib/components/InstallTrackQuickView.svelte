<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { API_BASE_URL } from "$lib/constants/constants";

  /** Site row from the installation track, or null when closed. */
  export let site = null;
  export let color = "#64748b";
  /** Live Head pin from the track map (optional). */
  export let headPin = null;

  const dispatch = createEventDispatcher();

  let loading = false;
  let extra = null;
  let extraError = "";
  let token = 0;

  $: if (site) loadExtra(site);

  function close() {
    dispatch("close");
  }

  function fullHref(row) {
    if (!row) return "";
    if (
      (row.status === "woInProgress" || row.status === "woCompleted") &&
      row.workOrderRecordId
    ) {
      return `/admin/workorder/${row.workOrderRecordId}`;
    }
    if (row.orderId) return `/admin/order/${row.orderId}/dispatch`;
    return "";
  }

  function placeLine(row) {
    return [row?.city, row?.state]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  function formatDay(val) {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatWhen(val) {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function clientFromWorkOrder(data) {
    const company = data?.company;
    const order = data?.order;
    return (
      (typeof company === "string" ? company : company?.name) ||
      order?.client?.name ||
      order?.orderClients?.[0]?.name ||
      (typeof order?.company === "string" ? order.company : order?.company?.name) ||
      ""
    );
  }

  function headName(data) {
    const head = data?.headEmployeeDetails || {};
    return String(head.name || head.username || data?.headEmail || "").trim();
  }

  function seenAgo(val) {
    if (!val) return "";
    const t = new Date(val).getTime();
    if (Number.isNaN(t)) return "";
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 36) return `${hours}h ago`;
    return formatWhen(val);
  }

  function visitStatusLabel(status) {
    const map = {
      pending: "Pending",
      notVisited: "Unvisited",
      visitedButNoprogress: "No progress",
      partiallyInstalled: "In progress",
      Installed: "Done",
    };
    return map[String(status || "")] || String(status || "");
  }

  function mediaUrl(path) {
    if (!path) return "";
    const p = String(path);
    if (/^https?:\/\//i.test(p)) return p;
    const base = String(API_BASE_URL || "").replace(/\/$/, "");
    if (p.startsWith("/r2-media") || p.startsWith("r2-media")) {
      return p.startsWith("/") ? `${base}${p}` : `${base}/${p}`;
    }
    if (p.startsWith("r2:")) {
      return `${base}/r2-media?key=${encodeURIComponent(p.slice(3))}`;
    }
    if (p.startsWith("/")) return `${base}${p}`;
    return `${base}/uploads/${p.replace(/^\//, "")}`;
  }

  function imageList(images) {
    if (!Array.isArray(images)) return [];
    return images
      .map((img) => {
        if (typeof img === "string") return mediaUrl(img);
        return mediaUrl(img?.url || img?.path || img?.key || "");
      })
      .filter(Boolean)
      .slice(0, 6);
  }

  function lastVisitBlock(data) {
    const visits = data?.lastInstallationDetails;
    if (!Array.isArray(visits) || !visits.length) return null;
    const last = visits[visits.length - 1] || {};
    return {
      status: visitStatusLabel(last.status),
      date: last.installationDate || last.createdAt || "",
      remark: String(last.remark || last.description || "").trim(),
      challenges: String(last.challenges || "").trim(),
      images: imageList(last.images),
      videoUrl: last.videoUrl ? mediaUrl(last.videoUrl) : "",
    };
  }

  function timelineFrom(data) {
    const logs = Array.isArray(data?.processLogs) ? data.processLogs : [];
    return [...logs]
      .reverse()
      .slice(0, 6)
      .map((log) => ({
        title: String(log.title || log.type || "Update"),
        detail: String(log.detail || "").trim(),
        at: log.createdAt || "",
        by: String(log.createdBy || "").trim(),
      }));
  }

  function headLastSummary(data) {
    const seenAt = headPin?.lastSeenAt || data?.headLastSeenAt;
    if (!seenAt) return "";
    const ago = seenAgo(seenAt);
    const lat = Number(headPin?.latitude ?? data?.headLastLatitude);
    const lng = Number(headPin?.longitude ?? data?.headLastLongitude);
    const coords =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : "";
    const stale =
      seenAt && Date.now() - new Date(seenAt).getTime() > 3 * 60 * 60 * 1000;
    return [ago ? `Seen ${ago}` : "", stale ? "may be outdated" : "", coords]
      .filter(Boolean)
      .join(" · ");
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function headDistanceLabel() {
    if (!site || !headPin) return "";
    const sLat = Number(site.latitude);
    const sLng = Number(site.longitude);
    const hLat = Number(headPin.latitude);
    const hLng = Number(headPin.longitude);
    if (![sLat, sLng, hLat, hLng].every(Number.isFinite)) return "";
    const km = haversineKm(sLat, sLng, hLat, hLng);
    if (km < 1) return `${Math.round(km * 1000)} m from site`;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km from site`;
  }

  async function loadExtra(row) {
    const seq = ++token;
    loading = true;
    extra = null;
    extraError = "";
    try {
      const isWorkOrder =
        (row.status === "woInProgress" || row.status === "woCompleted") &&
        row.workOrderRecordId;
      if (isWorkOrder) {
        const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${row.workOrderRecordId}`);
        if (seq !== token) return;
        extra = {
          title: data?.title || data?.order?.title || row.orderTitle || "",
          client: clientFromWorkOrder(data),
          engineer: String(data?.installationEngineer || "").trim(),
          installDate: data?.installationDate || "",
          installType: "",
          headLast: "",
          lastVisit: null,
          timeline: [],
        };
      } else if (row.workOrder) {
        const resp = await authApiFetch(
          `${API_ROUTES.DISPATCH_BY_WO}/${encodeURIComponent(row.workOrder)}`,
        );
        const data = resp?.data ?? resp;
        if (seq !== token) return;
        extra = {
          title: row.orderTitle || "",
          client: String(data?.attendeeClientName || "").trim(),
          engineer: headName(data),
          headEmail: String(data?.headEmail || "").trim(),
          dispatchDate: data?.dispatchDate || "",
          deliveryDate: data?.deliveryDate || "",
          installType: String(data?.installationType || "").trim(),
          headLast: headLastSummary(data),
          lastVisit: lastVisitBlock(data),
          timeline: timelineFrom(data),
        };
      }
    } catch {
      if (seq !== token) return;
      extraError = "Extra details could not be loaded.";
    } finally {
      if (seq === token) loading = false;
    }
  }

  $: href = fullHref(site);
  $: distance = headDistanceLabel();
  $: rows = site
    ? [
        { label: "Status", value: site.statusLabel },
        { label: "Place", value: placeLine(site) || (site.missingLocation ? "Missing location" : "") },
        { label: "Job", value: extra?.title || site.orderTitle || "" },
        { label: "Client", value: extra?.client || "" },
        { label: "Engineer", value: extra?.engineer || "" },
        { label: "Head email", value: extra?.headEmail || "" },
        {
          label: "Head location",
          value: [extra?.headLast || headLastSummary(null), distance].filter(Boolean).join(" · "),
        },
        { label: "Install type", value: extra?.installType || "" },
        { label: "Installation date", value: formatDay(extra?.installDate) },
        { label: "Dispatch date", value: formatDay(extra?.dispatchDate) },
        { label: "Delivery date", value: formatDay(extra?.deliveryDate) },
        site.onRoute ? { label: "Along route", value: `${site.alongKm} km` } : null,
        site.status === "installed" && site.installedAt
          ? {
              label: "Installed",
              value: `${formatWhen(site.installedAt)}${site.installedDays != null ? ` (${site.installedDays}d)` : ""}`,
            }
          : null,
      ].filter((row) => row && row.value)
    : [];
</script>

{#if site}
  <div class="itq-backdrop" on:click={close}></div>
  <aside class="itq-drawer" role="dialog" aria-modal="true" aria-label="Installation details">
    <div class="itq-header">
      <div class="itq-header-text">
        <div class="itq-eyebrow">Installation</div>
        <h5 class="itq-title">{site.workOrder}</h5>
        <div class="itq-sub">
          <i class="itq-dot" style="background: {color}"></i>
          {site.statusLabel}
          {#if site.isNext}
            <span class="itq-flag next">Next</span>
          {:else if site.onRoute}
            <span class="itq-flag route">On route</span>
          {/if}
          {#if headPin}
            <span class="itq-flag head">Head on map</span>
          {/if}
        </div>
      </div>
      <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
    </div>

    <div class="itq-body">
      <dl class="itq-rows">
        {#each rows as row}
          <div>
            <dt>{row.label}</dt>
            <dd class:missing={row.value === "Missing location"}>{row.value}</dd>
          </div>
        {/each}
      </dl>

      {#if extra?.lastVisit}
        <section class="itq-section">
          <h6>Last daily update</h6>
          <p class="itq-meta">
            {[extra.lastVisit.status, formatDay(extra.lastVisit.date)].filter(Boolean).join(" · ")}
          </p>
          {#if extra.lastVisit.remark}
            <p class="itq-text">{extra.lastVisit.remark}</p>
          {/if}
          {#if extra.lastVisit.challenges}
            <p class="itq-text warn">Challenges: {extra.lastVisit.challenges}</p>
          {/if}
          {#if extra.lastVisit.images.length}
            <div class="itq-photos">
              {#each extra.lastVisit.images as src}
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <img src={src} alt="Visit photo" />
                </a>
              {/each}
            </div>
          {/if}
          {#if extra.lastVisit.videoUrl}
            <a class="itq-video" href={extra.lastVisit.videoUrl} target="_blank" rel="noopener noreferrer">
              Open activity video
            </a>
          {/if}
        </section>
      {/if}

      {#if extra?.timeline?.length}
        <section class="itq-section">
          <h6>Recent timeline</h6>
          <ul class="itq-timeline">
            {#each extra.timeline as item}
              <li>
                <strong>{item.title}</strong>
                {#if item.detail}<span>{item.detail}</span>{/if}
                <small>
                  {[item.by, item.at ? seenAgo(item.at) || formatWhen(item.at) : ""].filter(Boolean).join(" · ")}
                </small>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if loading}
        <p class="itq-note">Loading details…</p>
      {:else if extraError}
        <p class="itq-note itq-note-error">{extraError}</p>
      {/if}
    </div>

    {#if href}
      <div class="itq-footer">
        <a class="btn btn-sm btn-primary w-100" {href}>Open full page</a>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .itq-backdrop {
    position: fixed;
    inset: 0;
    z-index: 12040;
    background: rgba(15, 23, 42, 0.28);
  }
  .itq-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 12050;
    width: min(24rem, 100vw);
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fff;
    box-shadow: -8px 0 28px rgba(15, 23, 42, 0.12);
  }
  .itq-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid #e9ecef;
  }
  .itq-header-text {
    min-width: 0;
  }
  .itq-eyebrow {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #868e96;
  }
  .itq-title {
    margin: 0.1rem 0 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #212529;
  }
  .itq-sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.25rem;
    color: #495057;
    font-size: 0.78rem;
  }
  .itq-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
  }
  .itq-flag {
    font-size: 0.65rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
  }
  .itq-flag.next {
    background: #fef3c7;
    color: #92400e;
  }
  .itq-flag.route {
    background: #dbeafe;
    color: #1d4ed8;
  }
  .itq-flag.head {
    background: #ede9fe;
    color: #5b21b6;
  }
  .itq-body {
    flex: 1;
    overflow: auto;
    padding: 0.85rem 1rem 1.25rem;
  }
  .itq-rows {
    margin: 0;
  }
  .itq-rows > div {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    gap: 0.35rem 0.75rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid #f1f3f5;
  }
  .itq-rows dt {
    margin: 0;
    color: #868e96;
    font-size: 0.75rem;
    font-weight: 500;
  }
  .itq-rows dd {
    margin: 0;
    color: #212529;
    font-size: 0.82rem;
  }
  .itq-rows dd.missing {
    color: #dc2626;
  }
  .itq-section {
    margin-top: 0.9rem;
    padding-top: 0.7rem;
    border-top: 1px solid #eef2f6;
  }
  .itq-section h6 {
    margin: 0 0 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .itq-meta {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    color: #4b5563;
  }
  .itq-text {
    margin: 0 0 0.35rem;
    font-size: 0.82rem;
    color: #212529;
    line-height: 1.4;
  }
  .itq-text.warn {
    color: #b45309;
  }
  .itq-photos {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }
  .itq-photos img {
    width: 4.5rem;
    height: 4.5rem;
    object-fit: cover;
    border-radius: 0.35rem;
    border: 1px solid #e5e7eb;
  }
  .itq-video {
    display: inline-block;
    margin-top: 0.4rem;
    font-size: 0.78rem;
    color: #0d6efd;
  }
  .itq-timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .itq-timeline li {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding-left: 0.65rem;
    border-left: 2px solid #e5e7eb;
  }
  .itq-timeline strong {
    font-size: 0.78rem;
    color: #111827;
  }
  .itq-timeline span {
    font-size: 0.75rem;
    color: #4b5563;
  }
  .itq-timeline small {
    font-size: 0.68rem;
    color: #9ca3af;
  }
  .itq-note {
    margin: 0.75rem 0 0;
    color: #6b7280;
    font-size: 0.75rem;
  }
  .itq-note-error {
    color: #b91c1c;
  }
  .itq-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid #e9ecef;
  }
</style>
