import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import * as XLSX from "xlsx";
import { maskAssignedName } from "$lib/utils/maskUser";

function formatDateIST(date) {
  return new Date(date).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function buildFileName(base, { searchTerm, selectedFilter, customStartDate, customEndDate }, ext) {
  let name = base;
  if (searchTerm) name += `_search_${searchTerm.replace(/\s+/g, "_")}`;
  if (selectedFilter) name += `_${selectedFilter}`;
  if (selectedFilter === "custom" && customStartDate && customEndDate)
    name += `_from_${customStartDate}_to_${customEndDate}`;
  name += `_exported_${new Date().toISOString().split("T")[0]}.${ext}`;
  return name;
}

export function generatePdfFromList(orders, filters, currentUser) {
  const safeDate = (d) => (d ? formatDateIST(d) : "");
  const headers = [
    "Order ID", "Unique ID", "Title", "Category", "Status",
    "Assigned Users", "Description", "Price", "Currency", "Price Terms",
    "Terms & Conditions", "Source", "Company", "GST Number",
    "Order Date", "Order Clients", "Created At", "Updated At",
  ];

  const body = [
    headers,
    ...orders.map((order) => {
      const assignedUsers = (order?.assignedUsers || [])
        .map((user) => {
          const name = maskAssignedName(user, currentUser);
          const showEmail = ["master", "admin", "manager"].includes(currentUser?.role);
          return showEmail ? `${name} (${user.email})` : name;
        })
        .join(", ");
      const orderClients = (order?.orderClients || [])
        .map((u) => `${u.name} (${u.email})`)
        .join(", ");

      return [
        String(order?.id ?? ""),
        order?.financialYear && order?.pId ? `${order.financialYear}/${order.pId}` : "",
        order?.title || "",
        order?.category || "",
        order?.status || "",
        assignedUsers || "",
        order?.description || "",
        order?.price != null ? String(order.price) : "",
        order?.currency || "INR",
        order?.priceTerms || "",
        order?.termsCondition || "",
        order?.source || "",
        order?.company || "",
        order?.gstNumber || "",
        safeDate(order?.orderDate),
        orderClients || "",
        safeDate(order?.createdAt),
        safeDate(order?.updatedAt),
      ];
    }),
  ];

  const docDefinition = {
    content: [
      { text: "Orders Report", style: "header" },
      { table: { headerRows: 1, body }, layout: "lightHorizontalLines" },
    ],
    styles: { header: { fontSize: 10, bold: true, margin: [0, 0, 0, 10] } },
  };

  pdfMake.vfs = pdfFonts.vfs;
  pdfMake.createPdf(docDefinition).download(buildFileName("orders", filters, "pdf"));
}

export function generateExcelFromList(orders, filters, currentUser) {
  const headers = [
    "OrderID", "UniqueId", "InqCode", "Title", "Category", "Status",
    "AssignedUsers", "Description", "Price", "PriceTerms", "TermsCondition",
    "Source", "Company", "GSTNumber", "OrderDate", "OrderClients",
    "CreatedAt", "UpdatedAt",
  ];

  const newList = orders.map((order) => {
    const assignedUsers = (order?.assignedUsers || [])
      .map((user) => {
        const name = maskAssignedName(user, currentUser);
        const showEmail = ["master", "admin", "manager"].includes(currentUser?.role);
        return showEmail ? `${name} (${user.email})` : name;
      })
      .join(", ");
    const orderClients = (order?.orderClients || [])
      .map((u) => `${u.name} (${u.email}, ${u.mobile}, ${u.whatsapp})`)
      .join(", ");

    return {
      OrderID: order?.id,
      UniqueId: `${order?.financialYear}/${order?.pId}`,
      InqCode: order?.inqCode ?? "",
      Title: order?.title,
      Category: order?.category,
      Status: order?.status,
      AssignedUsers: assignedUsers,
      Description: order?.description,
      Price: order?.price,
      PriceTerms: order?.priceTerms,
      Currency: order?.currency,
      TermsCondition: order?.termsCondition,
      Source: order?.source,
      Company: order?.company,
      GSTNumber: order?.gstNumber,
      OrderDate: formatDateIST(order?.orderDate),
      OrderClients: orderClients,
      CreatedAt: formatDateIST(order?.createdAt),
      UpdatedAt: formatDateIST(order?.updatedAt),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(newList, { header: headers });
  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A1" });
  worksheet["!cols"] = headers.map((h) => ({
    wch: Math.max(h.length, ...newList.map((r) => String(r[h] ?? "").length)),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
  const blob = new Blob(
    [XLSX.write(workbook, { bookType: "xlsx", type: "array" })],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildFileName("orders", filters, "xlsx");
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}
