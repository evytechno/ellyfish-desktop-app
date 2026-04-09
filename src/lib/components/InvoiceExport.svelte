<script>
  import ExcelJS from "exceljs";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { numberToWords } from "$lib/utils/numberToWords";

  export let invoice;

  $: subtotal =
    invoice?.items.reduce((sum, item) => sum + item.total, 0) -
    invoice?.discount;
  $: extratotal = invoice?.extraItems.reduce(
    (sum, item) => sum + item.total,
    0
  );
  $: subplustotal = subtotal + extratotal;
  $: taxtotal = invoice?.taxItems.length
    ? invoice?.taxItems.reduce((sum, item) => sum + item.total, 0)
    : 0;
  $: total = Math.round(subplustotal + taxtotal);
  $: totalInWord = numberToWords(total || 0) + " Only";
  $: taxTotalInWord = numberToWords(taxtotal || 0) + " Only";

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];

  async function generateInvoiceExcel() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Invoice");

    const thinBorder = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const thinBorderLeftRight = {
      top: undefined,
      left: { style: "thin" },
      bottom: undefined,
      right: { style: "thin" },
    };

    const thinBorderLeftRightBottom = {
      top: undefined,
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    sheet.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.4,
        bottom: 0.4,
        header: 0.3,
        footer: 0.3,
      },
    };

    // Title
    sheet.mergeCells("A1", "H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Tax Invoice";
    titleCell.font = { name: "Arial", size: 14, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.border = thinBorder;

    // Company Logo + Info
    sheet.mergeCells("A2:A6");
    if (invoice?.company?.logo) {
      const response = await fetch(
        ATTACHMENT_BASE_URL + invoice?.company?.logo
      );
      const logoblob = await response.blob();
      const arrayBuffer = await logoblob.arrayBuffer();
      const logobuffer = new Uint8Array(arrayBuffer);

      const imageId = workbook.addImage({
        buffer: logobuffer,
        extension: "webp",
      });
      const img = new Image();
      const imageLoadPromise = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      img.src = URL.createObjectURL(logoblob);
      await imageLoadPromise;

      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;

      const widthRatio = 100 / originalWidth;
      const heightRatio = 80 / originalHeight;
      const scale = Math.min(widthRatio, heightRatio);

      const finalWidth = originalWidth * scale;
      const finalHeight = originalHeight * scale;

      sheet.addImage(imageId, {
        tl: { col: 0, row: 1 },
        ext: { width: finalWidth, height: finalHeight },
      });
    }
    sheet.getCell("A2").border = {
      top: undefined,
      left: { style: "thin" },
      bottom: undefined,
      right: undefined,
    };

    sheet.mergeCells("B2:D6");
    let companyValues = [];
    if (invoice?.company?.name) {
      companyValues.push(invoice?.company?.name);
    }
    if (invoice?.company?.address) {
      companyValues.push(invoice?.company?.address);
    }
    if (invoice?.company?.mobile) {
      companyValues.push(invoice?.company?.mobile);
    }
    if (invoice?.company?.whatsapp) {
      companyValues.push(invoice?.company?.whatsapp);
    }
    if (invoice?.company?.email) {
      companyValues.push(invoice?.company?.email);
    }
    if (invoice?.company?.gstNumber) {
      companyValues.push(invoice?.company?.gstNumber);
    }
    sheet.getCell("B2").value = companyValues.join("\n");
    sheet.getCell("B2").font = { name: "Arial", size: 10 };
    sheet.getCell("B2").alignment = {
      wrapText: true,
      vertical: "top",
      indent: 5,
    };

    sheet.mergeCells("E2:F2");
    sheet.mergeCells("E3:F3");
    sheet.mergeCells("E4:F4");
    sheet.mergeCells("E5:F5");
    sheet.mergeCells("E6:F6");

    sheet.mergeCells("G2:H2");
    sheet.mergeCells("G3:H3");
    sheet.mergeCells("G4:H4");
    sheet.mergeCells("G5:H5");
    sheet.mergeCells("G6:H6");

    const invoiceDetails = [
      { cell: "E2", value: `Invoice No. -\n${invoice.invoiceNo}` },
      { cell: "G2", value: "Dated :\n" },
      { cell: "E3", value: "Delivery Note -\n" },
      { cell: "G3", value: "Mode/Terms of Payment :\n" },
      { cell: "E4", value: "Buyer's Order No.\n" },
      { cell: "G4", value: "Dated :\n" },
      { cell: "E5", value: "Dispatch Doc No.\n" },
      { cell: "G5", value: "Delivery Note Date :\n" },
      { cell: "E6", value: "Dispatched through:\n" },
      { cell: "G6", value: "Destination :\n" },
    ];
    invoiceDetails.forEach(({ cell, value }) => {
      const c = sheet.getCell(cell);
      c.value = value;
      c.font = { name: "Arial", size: 10 };
      c.border = thinBorder;
      c.alignment = { wrapText: true, vertical: "top" };
    });

    // Ship To / Bill To
    sheet.mergeCells("A7:D9");
    let shipValues = [];
    shipValues.push("Ship To :");
    if (invoice?.shipToName) {
      shipValues.push(invoice?.shipToName);
    }
    if (invoice?.shipToMobile) {
      shipValues.push(invoice?.shipToMobile);
    }
    if (invoice?.shipToEmail) {
      shipValues.push(invoice?.shipToEmail);
    }
    if (invoice?.shipToGSTNumber) {
      shipValues.push(invoice?.shipToGSTNumber);
    }
    if (invoice?.shipToAddress) {
      shipValues.push(invoice?.shipToAddress);
    }

    sheet.getCell("A7").value = shipValues.join("\n");
    sheet.getCell("A7").font = { name: "Arial", size: 10 };
    sheet.getCell("A7").border = thinBorder;
    sheet.getCell("A7").alignment = { wrapText: true, vertical: "top" };

    sheet.mergeCells("A10:D12");
    let billValues = [];
    billValues.push("Bill To :");
    if (invoice?.billToName) {
      billValues.push(invoice?.billToName);
    }
    if (invoice?.billToMobile) {
      billValues.push(invoice?.billToMobile);
    }
    if (invoice?.billToEmail) {
      billValues.push(invoice?.billToEmail);
    }
    if (invoice?.billToGSTNumber) {
      billValues.push(invoice?.billToGSTNumber);
    }
    if (invoice?.billToAddress) {
      billValues.push(invoice?.billToAddress);
    }
    sheet.getCell("A10").value = billValues.join("\n");
    sheet.getCell("A10").font = { name: "Arial", size: 10 };
    sheet.getCell("A10").border = thinBorder;
    sheet.getCell("A10").alignment = { wrapText: true, vertical: "top" };

    sheet.mergeCells("E7:H12");
    sheet.getCell("E7").value = [
      "Terms of Delivery :",
      invoice?.termsConditions,
    ].join("\n");
    sheet.getCell("E7").font = { name: "Arial", size: 10 };
    sheet.getCell("E7").border = thinBorder;
    sheet.getCell("E7").alignment = { wrapText: true, vertical: "top" };

    // Table Header Row
    const headers = [
      "SI. No.",
      "Description of Goods",
      "HSN/SAC",
      "Quantity",
      "Rate",
      "Per",
      "Disc. %",
      "Amount",
    ];
    headers.forEach((text, i) => {
      const cell = sheet.getCell(13, i + 1);
      cell.value = text;
      cell.font = { name: "Arial", size: 10, bold: true };
      cell.border = thinBorder;
      cell.alignment = {
        wrapText: true,
        vertical: "middle",
        horizontal: "center",
      };
    });
    let columnNo = 14;
    const items = [];
    const hsnCodes = [];
    invoice?.items.forEach((item, index) => {
      hsnCodes.push(item?.hsCode);
      items.push([
        {
          cell: `A${columnNo + index}`,
          value: index + 1,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `B${columnNo + index}`,
          value: item?.item,
          alignment: { wrapText: true, vertical: "top" },
          border: thinBorderLeftRight,
          font: { bold: true },
        },
        {
          cell: `C${columnNo + index}`,
          value: item?.hsCode,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `D${columnNo + index}`,
          value: item?.quantity,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          font: { bold: true },
        },
        {
          cell: `E${columnNo + index}`,
          value: item?.price,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "##,##,##0.00",
        },
        {
          cell: `F${columnNo + index}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `G${columnNo + index}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "0.0%",
        },
        {
          cell: `H${columnNo + index}`,
          value: item?.total,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
      ]);
    });

    const items2 = [];
    invoice?.extraItems.forEach((extraItem, index1) => {
      items2.push([
        {
          cell: `A${columnNo + invoice?.items.length + index1}`,
          value: invoice?.items.length + index1 + 1,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `B${columnNo + invoice?.items.length + index1}`,
          value: extraItem?.item,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          font: { bold: true },
        },
        {
          cell: `C${columnNo + invoice?.items.length + index1}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `D${columnNo + invoice?.items.length + index1}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `E${columnNo + invoice?.items.length + index1}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "##,##,##0.00",
        },
        {
          cell: `F${columnNo + invoice?.items.length + index1}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `G${columnNo + invoice?.items.length + index1}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "0.0%",
        },
        {
          cell: `H${columnNo + invoice?.items.length + index1}`,
          value: extraItem?.total,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
      ]);
    });

    let taxItemsColumnNo =
      columnNo + invoice?.items.length + invoice?.extraItems.length;
    invoice?.taxItems.forEach((taxItem, index2) => {
      items2.push([
        {
          cell: `A${taxItemsColumnNo + index2}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `B${taxItemsColumnNo + index2}`,
          value: taxItem?.item,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "right",
          },
          border: thinBorderLeftRight,
          font: { bold: true, italic: true },
        },
        {
          cell: `C${taxItemsColumnNo + index2}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `D${taxItemsColumnNo + index2}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `E${taxItemsColumnNo + index2}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "##,##,##0.00",
        },
        {
          cell: `F${taxItemsColumnNo + index2}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
        },
        {
          cell: `G${taxItemsColumnNo + index2}`,
          value: "",
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "0.0%",
        },
        {
          cell: `H${taxItemsColumnNo + index2}`,
          value: taxItem?.total,
          alignment: {
            wrapText: true,
            vertical: "middle",
            horizontal: "center",
          },
          border: thinBorderLeftRight,
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
      ]);
    });

    let totalColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length;
    // Total Row
    items2.push([
      {
        cell: `A${totalColumnNo}`,
        value: "",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
      },
      {
        cell: `B${totalColumnNo}`,
        value: "Total",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "right",
        },
        border: thinBorderLeftRightBottom,
        font: { bold: true },
      },
      {
        cell: `C${totalColumnNo}`,
        value: "",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
      },
      {
        cell: `D${totalColumnNo}`,
        value: "",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
      },
      {
        cell: `E${totalColumnNo}`,
        value: "",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
        numFmt: "##,##,##0.00",
      },
      {
        cell: `F${totalColumnNo}`,
        value: "",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
      },
      {
        cell: `G${totalColumnNo}`,
        value: "",
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
        numFmt: "0.0%",
      },
      {
        cell: `H${totalColumnNo}`,
        value: total,
        alignment: {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        },
        border: thinBorderLeftRightBottom,
        numFmt: "##,##,##0.00 ₹",
        font: { bold: true },
      },
    ]);

    items.concat(items2).forEach((item) => {
      item.forEach((item1) => {
        sheet.getCell(item1.cell).value = item1.value;
        sheet.getCell(item1.cell).alignment = item1.alignment;
        sheet.getCell(item1.cell).border = item1.border;
        sheet.getCell(item1.cell).font = item1.font;
        if (item1.numFmt) {
          sheet.getCell(item1.cell).numFmt = item1.numFmt;
        }
      });
    });

    sheet.getRow(totalColumnNo).alignment = {
      wrapText: true,
      vertical: "middle",
      horizontal: "center",
    };

    // Amount in words
    let totalInWordTitleColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      1;
    sheet.mergeCells(
      `A${totalInWordTitleColumnNo}:G${totalInWordTitleColumnNo}`
    );
    sheet.getCell(`A${totalInWordTitleColumnNo}`).value =
      "Amount Chargeable (in words)";
    sheet.getCell(`A${totalInWordTitleColumnNo}`).font = {
      name: "Arial",
      size: 10,
    };
    sheet.getCell(`A${totalInWordTitleColumnNo}`).border = {
      top: { style: "thin" },
      left: { style: "thin" },
      right: undefined,
      bottom: undefined,
    };

    sheet.getCell(`H${totalInWordTitleColumnNo}`).value = "E. & O.E";
    sheet.getCell(`H${totalInWordTitleColumnNo}`).font = {
      name: "Arial",
      size: 10,
    };
    sheet.getCell(`H${totalInWordTitleColumnNo}`).border = {
      top: { style: "thin" },
      left: undefined,
      bottom: undefined,
      right: { style: "thin" },
    };
    sheet.getCell(`H${totalInWordTitleColumnNo}`).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    let totalInWordColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      2;
    sheet.mergeCells(`A${totalInWordColumnNo}:H${totalInWordColumnNo}`);
    sheet.getCell(`A${totalInWordColumnNo}`).value = `INR ${totalInWord}`;
    sheet.getCell(`A${totalInWordColumnNo}`).font = {
      name: "Arial",
      size: 10,
      bold: true,
    };
    sheet.getCell(`A${totalInWordColumnNo}`).border = {
      top: undefined,
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    sheet.getCell(`A${totalInWordColumnNo}`).alignment = { vertical: "top" };

    // Tax Table Header
    let taxTableHeaderColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      3;
    let taxItemsLength = invoice?.taxItems.length;
    let taxableAmountColumnName = "E";
    if (taxItemsLength > 1) {
      sheet.mergeCells(
        `A${taxTableHeaderColumnNo}:B${taxTableHeaderColumnNo + 1}`
      );
      taxableAmountColumnName = "C";
    }
    if (taxItemsLength == 1) {
      sheet.mergeCells(
        `A${taxTableHeaderColumnNo}:D${taxTableHeaderColumnNo + 1}`
      );
      taxableAmountColumnName = "E";
    }
    if (taxItemsLength == 0) {
      sheet.mergeCells(
        `A${taxTableHeaderColumnNo}:F${taxTableHeaderColumnNo + 1}`
      );
      taxableAmountColumnName = "G";
    }
    sheet.getCell(`A${taxTableHeaderColumnNo}`).value = "HSN/SAC";
    sheet.getCell(`A${taxTableHeaderColumnNo}`).font = {
      name: "Arial",
      size: 10,
    };
    sheet.getCell(`A${taxTableHeaderColumnNo}`).border = thinBorder;
    sheet.getCell(`A${taxTableHeaderColumnNo}`).alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    sheet.mergeCells(
      `${taxableAmountColumnName}${taxTableHeaderColumnNo}:${taxableAmountColumnName}${taxTableHeaderColumnNo + 1}`
    );
    sheet.getCell(`${taxableAmountColumnName}${taxTableHeaderColumnNo}`).value =
      "Taxable Amount";
    sheet.getCell(`${taxableAmountColumnName}${taxTableHeaderColumnNo}`).font =
      {
        name: "Arial",
        size: 10,
      };
    sheet.getCell(
      `${taxableAmountColumnName}${taxTableHeaderColumnNo}`
    ).border = thinBorder;
    sheet.getCell(
      `${taxableAmountColumnName}${taxTableHeaderColumnNo}`
    ).alignment = {
      wrapText: true,
      vertical: "middle",
      horizontal: "center",
    };
    let taxItemDetail1 = invoice?.taxItems[0];
    let taxItemDetail2 = invoice?.taxItems[1];
    if (taxItemDetail1) {
      sheet.mergeCells(`F${taxTableHeaderColumnNo}:G${taxTableHeaderColumnNo}`);
      sheet.getCell(`F${taxTableHeaderColumnNo}`).value = taxItemDetail1?.item;
      sheet.getCell(`F${taxTableHeaderColumnNo}`).font = {
        name: "Arial",
        size: 10,
      };
      sheet.getCell(`F${taxTableHeaderColumnNo}`).border = thinBorder;
      sheet.getCell(`F${taxTableHeaderColumnNo}`).alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      sheet.getCell(`F${taxTableHeaderColumnNo + 1}`).value = "Rate";
      sheet.getCell(`F${taxTableHeaderColumnNo + 1}`).font = {
        name: "Arial",
        size: 10,
      };
      sheet.getCell(`F${taxTableHeaderColumnNo + 1}`).border = thinBorder;
      sheet.getCell(`F${taxTableHeaderColumnNo + 1}`).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      sheet.getCell(`G${taxTableHeaderColumnNo + 1}`).value = "Amount";
      sheet.getCell(`G${taxTableHeaderColumnNo + 1}`).font = {
        name: "Arial",
        size: 10,
      };
      sheet.getCell(`G${taxTableHeaderColumnNo + 1}`).border = thinBorder;
      sheet.getCell(`G${taxTableHeaderColumnNo + 1}`).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
    }
    if (taxItemDetail2) {
      sheet.mergeCells(`D${taxTableHeaderColumnNo}:E${taxTableHeaderColumnNo}`);
      sheet.getCell(`D${taxTableHeaderColumnNo}`).value = taxItemDetail2?.item;
      sheet.getCell(`D${taxTableHeaderColumnNo}`).font = {
        name: "Arial",
        size: 10,
      };
      sheet.getCell(`D${taxTableHeaderColumnNo}`).border = thinBorder;
      sheet.getCell(`D${taxTableHeaderColumnNo}`).alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      sheet.getCell(`D${taxTableHeaderColumnNo + 1}`).value = "Rate";
      sheet.getCell(`D${taxTableHeaderColumnNo + 1}`).font = {
        name: "Arial",
        size: 10,
      };
      sheet.getCell(`D${taxTableHeaderColumnNo + 1}`).border = thinBorder;
      sheet.getCell(`D${taxTableHeaderColumnNo + 1}`).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      sheet.getCell(`E${taxTableHeaderColumnNo + 1}`).value = "Amount";
      sheet.getCell(`E${taxTableHeaderColumnNo + 1}`).font = {
        name: "Arial",
        size: 10,
      };
      sheet.getCell(`E${taxTableHeaderColumnNo + 1}`).border = thinBorder;
      sheet.getCell(`E${taxTableHeaderColumnNo + 1}`).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
    }

    sheet.mergeCells(
      `H${taxTableHeaderColumnNo}:H${taxTableHeaderColumnNo + 1}`
    );
    sheet.getCell(`H${taxTableHeaderColumnNo}`).value = "Total Tax Amount";
    sheet.getCell(`H${taxTableHeaderColumnNo}`).font = {
      name: "Arial",
      size: 10,
    };
    sheet.getCell(`H${taxTableHeaderColumnNo}`).border = thinBorder;
    sheet.getCell(`H${taxTableHeaderColumnNo}`).alignment = {
      wrapText: true,
      vertical: "middle",
      horizontal: "center",
    };

    let taxTableColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      5;
    const taxItems = [
      [
        { cell: `A${taxTableColumnNo}`, value: hsnCodes.join("/") },
        {
          cell: `${taxableAmountColumnName}${taxTableColumnNo}`,
          value: subtotal,
          numFmt: "##,##,##0.00",
        },
        taxItemDetail1 && {
          cell: `F${taxTableColumnNo}`,
          value: taxItemDetail1?.percentage
            ? taxItemDetail1?.percentage / 100
            : "",
          numFmt: "0.0%",
        },
        taxItemDetail1 && {
          cell: `G${taxTableColumnNo}`,
          value: taxItemDetail1?.total ? taxItemDetail1?.total : "",
          numFmt: "##,##,##0.00",
        },
        taxItemDetail2 && {
          cell: `D${taxTableColumnNo}`,
          value: taxItemDetail2?.percentage
            ? taxItemDetail2?.percentage / 100
            : "",
          numFmt: "0.0%",
        },
        taxItemDetail2 && {
          cell: `E${taxTableColumnNo}`,
          value: taxItemDetail2?.total ? taxItemDetail2?.total : "",
          numFmt: "##,##,##0.00",
        },
        {
          cell: `H${taxTableColumnNo}`,
          value: taxtotal,
          numFmt: "##,##,##0.00",
        },
      ],
      [
        {
          cell: `A${taxTableColumnNo + 1}`,
          value: "Total",
          font: { bold: true },
        },
        {
          cell: `${taxableAmountColumnName}${taxTableColumnNo + 1}`,
          value: subtotal,
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
        taxItemDetail1 && {
          cell: `F${taxTableColumnNo + 1}`,
          value: "",
          numFmt: "0.0%",
          font: { bold: true },
        },
        taxItemDetail1 && {
          cell: `G${taxTableColumnNo + 1}`,
          value: taxItemDetail1?.total ? taxItemDetail1?.total : "",
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
        taxItemDetail2 && {
          cell: `D${taxTableColumnNo + 1}`,
          value: "",
          numFmt: "0.0%",
          font: { bold: true },
        },
        taxItemDetail2 && {
          cell: `E${taxTableColumnNo + 1}`,
          value: taxItemDetail2?.total ? taxItemDetail2?.total : "",
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
        {
          cell: `H${taxTableColumnNo + 1}`,
          value: taxtotal,
          numFmt: "##,##,##0.00",
          font: { bold: true },
        },
      ],
    ];

    if (taxItemsLength > 1) {
      sheet.mergeCells(`A${taxTableColumnNo}:B${taxTableColumnNo}`);
      sheet.mergeCells(`A${taxTableColumnNo + 1}:B${taxTableColumnNo + 1}`);
    }
    if (taxItemsLength == 1) {
      sheet.mergeCells(`A${taxTableColumnNo}:D${taxTableColumnNo}`);
      sheet.mergeCells(`A${taxTableColumnNo + 1}:D${taxTableColumnNo + 1}`);
    }
    if (taxItemsLength == 0) {
      sheet.mergeCells(`A${taxTableColumnNo}:F${taxTableColumnNo}`);
      sheet.mergeCells(`A${taxTableColumnNo + 1}:F${taxTableColumnNo + 1}`);
    }

    taxItems.forEach((item) => {
      item.filter(Boolean).forEach((item1) => {
        sheet.getCell(item1.cell).value = item1.value;
        sheet.getCell(item1.cell).font = item1.font;
        sheet.getCell(item1.cell).alignment = {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        };
        sheet.getCell(item1.cell).border = thinBorder;
        if (item1.numFmt) {
          sheet.getCell(item1.cell).numFmt = item1.numFmt;
        }
      });
    });

    let taxTotalInWorkColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      7;
    sheet.mergeCells(`A${taxTotalInWorkColumnNo}:H${taxTotalInWorkColumnNo}`);
    sheet.getCell(`A${taxTotalInWorkColumnNo}`).value = [
      `Tax Amount (in words) : INR ${taxTotalInWord}`,
      "",
      "Company’s Bank Details",
      `Bank Name : ${invoice?.company?.bankName}`,
      `Account Holder Name : ${invoice?.company?.accountHolderName}`,
      `A/c No. : ${invoice?.company?.accountNumber}`,
      `Branch Name : ${invoice?.company?.branchAddress}`,
      `IFS Code : ${invoice?.company?.ifscCode}`,
    ].join("\n");
    sheet.getCell(`A${taxTotalInWorkColumnNo}`).font = {
      name: "Arial",
      size: 10,
    };
    sheet.getCell(`A${taxTotalInWorkColumnNo}`).border = thinBorder;
    sheet.getCell(`A${taxTotalInWorkColumnNo}`).alignment = {
      wrapText: true,
      vertical: "top",
    };

    let signatoryColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      8;
    sheet.mergeCells(`A${signatoryColumnNo}:H${signatoryColumnNo}`);
    sheet.getCell(`A${signatoryColumnNo}`).value = [
      `For ${invoice?.company?.name}`,
      "",
      "",
      "Authorised Signatory",
    ].join("\n");
    sheet.getCell(`A${signatoryColumnNo}`).font = { name: "Arial", size: 10 };
    sheet.getCell(`A${signatoryColumnNo}`).border = thinBorder;
    sheet.getCell(`A${signatoryColumnNo}`).alignment = {
      wrapText: true,
      vertical: "middle",
      horizontal: "right",
    };

    let lastColumnNo =
      columnNo +
      invoice?.items.length +
      invoice?.extraItems.length +
      invoice?.taxItems.length +
      9;
    sheet.mergeCells(`A${lastColumnNo}:H${lastColumnNo}`);
    sheet.getCell(`A${lastColumnNo}`).value = [
      "SUBJECT TO JODHPUR JURISDICTION",
      "This is a Computer Generated Invoice",
    ].join("\n");
    sheet.getCell(`A${lastColumnNo}`).font = { name: "Arial", size: 10 };
    sheet.getCell(`A${lastColumnNo}`).alignment = {
      wrapText: true,
      vertical: "top",
      horizontal: "center",
    };

    const colWidths = [7, 32, 10, 10, 13, 8, 8, 13]; // Total ~85
    colWidths.forEach((width, i) => {
      sheet.getColumn(i + 1).width = width;
    });

    sheet.getRow(1).height = 25;
    sheet.getRow(2).height = 30;
    sheet.getRow(3).height = 30;
    sheet.getRow(4).height = 30;
    sheet.getRow(5).height = 30;
    sheet.getRow(6).height = 30;
    sheet.getRow(8).height = 70;
    sheet.getRow(11).height = 70;
    sheet.getRow(13).height = 30;
    sheet.getRow(taxTableHeaderColumnNo).height = 25;
    sheet.getRow(taxTotalInWorkColumnNo).height = 110;
    sheet.getRow(signatoryColumnNo).height = 60;
    sheet.getRow(lastColumnNo).height = 30;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Tax_Invoice.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<button class="btn btn-primary" on:click={generateInvoiceExcel}>
  Tax Invoice Excel
</button>
