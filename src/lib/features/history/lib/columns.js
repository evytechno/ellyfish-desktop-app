import {
  activityIcon,
  eventBadgeClass,
  eventIcon,
  eventLabel,
  formatWhen,
} from "./format.js";
import { flagsHtml, getAuthFlags, getOrderFlags } from "./flags.js";

/** @param {{ openDetail: (row: any, kind: string) => void }} opts */
export function buildOrderColumns({ openDetail }) {
  const columns = [
    {
      key: "title",
      label: "Activity",
      render: (val, row) => {
        const icon = activityIcon(val);
        return `<div class="hx-act-cell"><span class="hx-act-icon"><i class="ti ${icon}"></i></span><div><div class="hx-act-title">${val || "-"}</div><div class="hx-act-sub">${row?.user?.name ? row.user.name : ""}</div></div></div>`;
      },
    },
    {
      key: "flags",
      label: "Flags",
      render: (_val, row) => flagsHtml(getOrderFlags(row)),
    },
    {
      key: "order",
      label: "Order",
      render: (val, row) =>
        row?.order?.id
          ? `<a href="/admin/order/${row.order.id}" class="hx-link">${row.order.pId ? `#${row.order.pId} · ` : ""}${row.order.title || "Order"}</a>`
          : "-",
    },
    {
      key: "description",
      label: "Summary",
      render: (val, row) => {
        if (row.title === "Order Chat Added") {
          const msg = row?.data?.message ?? "-";
          const typeStr = row?.data?.type || "";
          const types = typeStr
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 3)
            .map((t) => `<span class="hx-chip-mini">${t}</span>`)
            .join("");
          return `<div class="hx-desc">${types}<div class="hx-desc-text">${msg}</div></div>`;
        }
        if (row.title === "Order Attachment Added") {
          const n = row?.data?.files?.length || 0;
          const title = row?.data?.title || "Attachment";
          return `<div class="hx-desc-text">${title}${n ? ` · ${n} file(s)` : ""}</div>`;
        }
        if (row.title === "Order Reminder Added") {
          const rt = row?.data?.reminderTime
            ? new Date(row.data.reminderTime).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "";
          return `<div class="hx-desc-text">${rt || "-"}${row?.data?.message ? " · " + row.data.message : ""}</div>`;
        }
        const text = String(val ?? "-");
        return `<div class="hx-desc-text" title="${text.replace(/"/g, "&quot;")}">${text.length > 90 ? text.slice(0, 90) + "…" : text}</div>`;
      },
    },
    {
      key: "createdAt",
      label: "When",
      render: (val) => {
        const { absolute, relative } = formatWhen(val);
        return `<div class="hx-when"><div>${relative}</div><div class="hx-when-abs">${absolute}</div></div>`;
      },
    },
  ];

  const actions = [
    {
      label: "Details",
      icon: "ti ti-eye",
      class: "btn btn-sm btn-outline-primary",
      onClick: (id) => openDetail(id, "order"),
    },
  ];

  return { columns, actions };
}

/**
 * @param {{ openDetail: (row: any, kind: string) => void, authActivities: any[] }} opts
 */
export function buildAuthColumns({ openDetail, authActivities }) {
  const columns = [
    {
      key: "event",
      label: "Event",
      render: (val) =>
        `<span class="${eventBadgeClass(val)}"><i class="ti ${eventIcon(val)} me-1"></i>${eventLabel(val)}</span>`,
    },
    {
      key: "flags",
      label: "Flags",
      render: (_val, row) => flagsHtml(getAuthFlags(row, authActivities)),
    },
    {
      key: "userEmail",
      label: "Actor",
      render: (val, row) =>
        row?.user?.name
          ? `<div class="hx-actor"><strong>${row.user.name}</strong><span>${val ?? ""}</span></div>`
          : `<div class="hx-actor"><strong>${val ?? "-"}</strong></div>`,
    },
    {
      key: "ipAddress",
      label: "Network",
      render: (val, row) => {
        const ip = val ?? "-";
        const city = row?.city || "";
        const loc = row?.locationLabel || "";
        return `<div class="hx-net"><div class="hx-mono">${ip}</div>${city ? `<div class="hx-muted">${city}</div>` : ""}${loc ? `<div class="hx-loc">${loc}</div>` : ""}</div>`;
      },
    },
    {
      key: "browser",
      label: "Device",
      render: (val, row) => {
        const name = row?.deviceName || "Unknown device";
        const device = row?.device || "";
        return `<div class="hx-dev"><div>${name}</div><div class="hx-muted">${device ? device + " · " : ""}${val ?? ""}${row?.os ? " / " + row.os : ""}</div></div>`;
      },
    },
    {
      key: "failReason",
      label: "Note",
      render: (val) =>
        val ? `<span class="hx-fail">${val}</span>` : `<span class="hx-muted">—</span>`,
    },
    {
      key: "createdAt",
      label: "When",
      render: (val) => {
        const { absolute, relative } = formatWhen(val);
        return `<div class="hx-when"><div>${relative}</div><div class="hx-when-abs">${absolute}</div></div>`;
      },
    },
  ];

  const actions = [
    {
      label: "Details",
      icon: "ti ti-eye",
      class: "btn btn-sm btn-outline-primary",
      onClick: (id) => openDetail(id, "auth"),
    },
  ];

  return { columns, actions };
}
