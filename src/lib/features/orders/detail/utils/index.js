export function convertDate(rawTimestamp, format) {
  if (!rawTimestamp) return "";
  let s = String(rawTimestamp);
  if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
  return new Date(s).toLocaleString("en-GB", format);
}

export function newDateFormate(date, format) {
  let formattedDate;
  if (typeof date === "string" && date.includes(".") && !date.endsWith("Z") && !date.includes("+")) {
    const [datePart, msPart] = date.split(".");
    const trimmedMs = msPart.slice(0, 3);
    formattedDate = new Date(`${datePart}.${trimmedMs}`);
  } else {
    formattedDate = new Date(date);
  }
  if (isNaN(formattedDate)) return "Invalid date";
  return formattedDate.toLocaleString("en-GB", format);
}

export function shortenFileName(name, keepStart = 8, keepEnd = 12) {
  if (!name) return "";
  if (name.length <= keepStart + keepEnd) return name;
  return name.slice(0, keepStart) + "..." + name.slice(-keepEnd);
}

export function fileIcon(mime, name) {
  const m = mime ?? "";
  const n = (name ?? "").toLowerCase();
  if (m.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(n))
    return { icon: "ti-photo", bg: "bg-success" };
  if (m === "application/pdf" || n.endsWith(".pdf"))
    return { icon: "ti-file-type-pdf", bg: "bg-danger" };
  if (m.includes("word") || /\.(doc|docx)$/.test(n))
    return { icon: "ti-file-type-doc", bg: "bg-primary" };
  if (m.includes("excel") || m.includes("spreadsheet") || /\.(xls|xlsx|csv)$/.test(n))
    return { icon: "ti-file-spreadsheet", bg: "bg-success" };
  if (m.includes("zip") || m.includes("rar") || /\.(zip|rar|7z|tar|gz)$/.test(n))
    return { icon: "ti-file-zip", bg: "bg-warning" };
  return { icon: "ti-file", bg: "bg-secondary" };
}

export function getAvatarText(title) {
  if (!title) return "";
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function normalizeTypes(typeStr) {
  if (!typeStr || typeStr.trim() === "") return [];
  return typeStr.split(",").map(normalizeSingleType).filter(Boolean);
}

export function normalizeType(typeStr) {
  return normalizeTypes(typeStr)[0] ?? "Other";
}

function normalizeSingleType(raw) {
  if (!raw || raw.trim() === "") return null;
  const t = raw.trim().toLowerCase();
  if (t.includes("call")) return "Call";
  if (t.includes("whatsapp") || t.includes("whats app") || t === "wa") return "WhatsApp";
  if (t.includes("email") || t.includes("mail")) return "Email";
  return null;
}
