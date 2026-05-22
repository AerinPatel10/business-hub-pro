import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Order, OrderItem, AppSettings } from "@/contexts/AppDataContext";
import { inr, fmtDate, num } from "./format";

interface BusinessInfo {
  business_name?: string | null;
  gstin?: string | null;
  pan?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state?: string | null;
  state_code?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
}

interface PartyInfo {
  name?: string | null;
  address?: string | null;
  state?: string | null;
  state_code?: string | null;
  gstin?: string | null;
  pan?: string | null;
  phone?: string | null;
}

export type InvoiceDocKind = "invoice" | "estimate";

const toWords = (n: number): string => {
  const a = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
    "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const b = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  const inWords = (num: number): string => {
    if (num === 0) return "";
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "");
    if (num < 1000) return a[Math.floor(num / 100)] + " HUNDRED" + (num % 100 ? " " + inWords(num % 100) : "");
    if (num < 100000) return inWords(Math.floor(num / 1000)) + " THOUSAND" + (num % 1000 ? " " + inWords(num % 1000) : "");
    if (num < 10000000) return inWords(Math.floor(num / 100000)) + " LAKH" + (num % 100000 ? " " + inWords(num % 100000) : "");
    return inWords(Math.floor(num / 10000000)) + " CRORE" + (num % 10000000 ? " " + inWords(num % 10000000) : "");
  };
  const rupees = Math.floor(n);
  return (inWords(rupees) || "ZERO") + " ONLY";
};

// ===== Estimate / Delivery Challan style =====
// Renders a single estimate "card" into the given doc within a bounding box.
// When targetDoc/bounds are provided we draw inside those bounds (used by 2-up landscape).
const renderEstimateCard = (
  doc: jsPDF,
  order: Order,
  items: OrderItem[],
  business: BusinessInfo,
  settings: AppSettings | null,
  party: PartyInfo | undefined,
  bounds: { x: number; y: number; w: number; h: number },
) => {
  const margin = bounds.x;
  const innerW = bounds.w;
  const centerX = bounds.x + bounds.w / 2;
  const outerTop = bounds.y;
  const outerBottom = bounds.y + bounds.h;

  doc.setLineWidth(0.5);
  doc.setDrawColor(0);

  // Outer border (challan card)
  doc.rect(margin, outerTop, innerW, outerBottom - outerTop);

  let y = outerTop;

  // ===== Top dark band: business name + tagline =====
  const bandH = 22;
  doc.setFillColor(30, 30, 30);
  doc.rect(margin, y, innerW, bandH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.text((business.business_name || "BUSINESS NAME").toUpperCase(), centerX, y + 9, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (business.address) doc.text(business.address, centerX, y + 14, { align: "center" });
  const contact = [
    business.phone ? `Mob: ${business.phone}` : "",
    business.email ? `Email: ${business.email}` : "",
  ].filter(Boolean).join("  |  ");
  if (contact) doc.text(contact, centerX, y + 18.5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += bandH;

  // ===== Title row: ESTIMATE =====
  const titleH = 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ESTIMATE", centerX, y + 7.5, { align: "center" });
  doc.line(margin, y + titleH, margin + innerW, y + titleH);
  y += titleH;

  // ===== Sr / Date row =====
  const metaH = 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Sr :", margin + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.text(order.invoice_number, margin + 14, y + 6);

  doc.setFont("helvetica", "bold");
  const dateLabel = "Date :";
  const dateLabelX = margin + innerW - 50;
  doc.text(dateLabel, dateLabelX, y + 6);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(order.invoice_date), dateLabelX + 14, y + 6);
  doc.line(margin, y + metaH, margin + innerW, y + metaH);
  y += metaH;

  // ===== M/s / Add / Mob block =====
  const partyH = 32;
  const lineGap = 6.5;
  const drawField = (label: string, value: string, ly: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(label, margin + 4, ly);
    doc.setFont("helvetica", "normal");
    const labelW = doc.getTextWidth(label) + 1;
    const valX = margin + 4 + labelW + 1;
    const valEnd = margin + innerW - 4;
    // dotted underline
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(valX, ly + 1, valEnd, ly + 1);
    doc.setLineDashPattern([], 0);
    doc.text(value, valX + 1, ly);
    return { valX, valEnd };
  };

  drawField("M/s :", party?.name || order.party_name || "", y + 6);
  // Address: split into 2 lines so long addresses don't overlap
  const addrText = (party?.address || "").trim();
  const addrMaxW = innerW - 8 - doc.getTextWidth("Add :") - 2;
  const addrLines = doc.splitTextToSize(addrText, addrMaxW) as string[];
  drawField("Add :", addrLines[0] || "", y + 6 + lineGap);
  // Second address line — continuation (or state if only one address line)
  const addr2 = addrLines.length > 1 ? addrLines.slice(1).join(" ") : "";
  const addr2Fit = addr2 ? (doc.splitTextToSize(addr2, addrMaxW)[0] as string) : (party?.state ? `State: ${party.state}` : "");
  drawField("", addr2Fit, y + 6 + lineGap * 2);
  drawField("Mob. No :", party?.phone || "", y + 6 + lineGap * 3);
  doc.line(margin, y + partyH, margin + innerW, y + partyH);
  y += partyH;

  // ===== Items table — fixed visual area, single page, simple 5 columns =====
  const head = [["S.N.", "Description of Goods", "Quantity", "Rate", "Amount"]];
  const realBody = items.map((it, i) => [
    String(i + 1),
    it.product_name,
    `${num(it.quantity, 2)} ${it.unit || ""}`.trim(),
    num(it.price, 2),
    num(Number(it.quantity) * Number(it.price), 2),
  ]);

  // Footer reserve: total row(8) + amount-in-words(10) + T&C/signature(22) = 40
  const FOOTER_BLOCK = 42;
  const tableTop = y;
  const tableBottom = outerBottom - FOOTER_BLOCK;
  const availableH = tableBottom - tableTop;
  const headerRowH = 9;

  const MAX_ROW_H = 9;
  const MIN_ROW_H = 3.2;
  const itemCount = Math.max(realBody.length, 1);
  // Row height that *guarantees* all items fit inside availableH (no overlap into footer)
  const fitRowH = (availableH - headerRowH) / itemCount;
  const rowH = Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, fitRowH));
  // Only pad blank rows when items easily fit; never overflow.
  const slotCount = fitRowH >= MAX_ROW_H
    ? Math.max(itemCount, Math.floor((availableH - headerRowH) / rowH))
    : realBody.length;
  const bodyFont = Math.max(6, Math.min(10, rowH * 1.05));
  const cellPad = Math.max(0.3, Math.min(1.6, rowH * 0.18));

  const blankRows: string[][] = [];
  for (let i = 0; i < slotCount - realBody.length; i++) blankRows.push(["", "", "", "", ""]);
  const body = [...realBody, ...blankRows];

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    margin: { left: margin, right: margin },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    tableWidth: innerW,
    styles: {
      fontSize: bodyFont,
      cellPadding: cellPad,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      textColor: 0,
      valign: "middle",
      overflow: "linebreak",
      minCellHeight: rowH,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: 0,
      fontStyle: "bold",
      halign: "center",
      lineWidth: 0.3,
      cellPadding: 1.2,
      fontSize: Math.max(8, bodyFont - 0.3),
      minCellHeight: headerRowH,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: innerW - 14 - 28 - 28 - 34, overflow: "ellipsize" },
      2: { cellWidth: 28, halign: "center" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = (doc as any).lastAutoTable.finalY;
  y = Math.min(Math.max(tableEndY, tableBottom), tableBottom);

  // ===== Total row (spans Description/Qty/Rate as one cell, Amount on right) =====
  const totalRowH = 8;
  const amountColW = 34;
  const totalLabelW = innerW - amountColW;
  doc.rect(margin, y, totalLabelW, totalRowH);
  doc.rect(margin + totalLabelW, y, amountColW, totalRowH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total", margin + totalLabelW - 4, y + 5.5, { align: "right" });
  const grandTotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.price), 0);
  doc.text(num(grandTotal, 2), margin + innerW - 3, y + 5.5, { align: "right" });
  y += totalRowH;

  // ===== Amount in words =====
  const wordsH = 10;
  doc.rect(margin, y, innerW, wordsH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Amount in words :", margin + 3, y + 4.2);
  doc.setFont("helvetica", "normal");
  const wordsText = toWords(Math.round(grandTotal));
  const wrapped = doc.splitTextToSize(wordsText, innerW - 40);
  doc.text(wrapped.slice(0, 1), margin + 36, y + 4.2);
  // dotted continuation line
  doc.setLineDashPattern([0.6, 0.6], 0);
  doc.line(margin + 36 + doc.getTextWidth(String(wrapped[0] || "")) + 2, y + 5.2, margin + innerW - 3, y + 5.2);
  doc.setLineDashPattern([], 0);
  y += wordsH;

  // ===== Terms & Signature =====
  const tcH = outerBottom - y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Terms & Condition", margin + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const tc = (settings?.terms_and_conditions ||
    "1. All disputes are subject to local Jurisdiction.\n2. Goods once sold will not be taken back.\n3. Estimate is valid for 7 days from date of issue.").split("\n");
  tc.slice(0, 3).forEach((line, i) => doc.text(line, margin + 3, y + 10 + i * 4));

  // Signature (right)
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text("Signature", margin + innerW - 4, y + tcH - 3, { align: "right" });
  if (settings?.signature_text) {
    doc.setFont("times", "italic");
    doc.setFontSize(11);
    doc.text(settings.signature_text, margin + innerW - 4, y + tcH - 9, { align: "right" });
  }

};

const generateEstimatePDF = (
  order: Order,
  items: OrderItem[],
  business: BusinessInfo,
  settings: AppSettings | null,
  party?: PartyInfo,
  options: PdfOptions = {},
): jsPDF => {
  // 2-up landscape: same estimate twice on one A4 landscape page
  if (options.twoUp) {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();   // 297
    const pageH = doc.internal.pageSize.getHeight();  // 210
    const margin = 6;
    const gap = 6;
    const cardW = (pageW - margin * 2 - gap) / 2;
    const cardY = margin;
    const cardH = pageH - margin * 2;
    renderEstimateCard(doc, order, items, business, settings, party, { x: margin, y: cardY, w: cardW, h: cardH });
    renderEstimateCard(doc, order, items, business, settings, party, { x: margin + cardW + gap, y: cardY, w: cardW, h: cardH });
    return doc;
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  renderEstimateCard(doc, order, items, business, settings, party, {
    x: margin, y: margin, w: pageW - margin * 2, h: pageH - margin * 2,
  });
  return doc;
};

export type PaperSize = "a4" | "a3" | "letter" | "legal";
export interface PdfOptions {
  paperSize?: PaperSize;
  color?: boolean; // false = grayscale
  twoUp?: boolean; // estimate only: 2 copies on a single landscape page
}

export const generateInvoicePDF = (
  order: Order,
  items: OrderItem[],
  business: BusinessInfo,
  settings: AppSettings | null,
  party?: PartyInfo,
  kind: InvoiceDocKind = "invoice",
  options: PdfOptions = {},
): jsPDF => {
  if (kind === "estimate") {
    return generateEstimatePDF(order, items, business, settings, party, options);
  }

  const paper = options.paperSize ?? "a4";
  const doc = new jsPDF({ unit: "mm", format: paper });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const innerW = pageW - margin * 2;

  doc.setLineWidth(0.4);
  doc.setDrawColor(0);

  let y = margin;

  // ===== Business header =====
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.text(business.business_name || "BUSINESS NAME", pageW / 2, y + 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (business.address) doc.text(business.address, pageW / 2, y + 13.5, { align: "center" });
  const contactLine = [
    business.phone ? `(M) : ${business.phone}` : "",
    business.email ? `E-mail : ${business.email}` : "",
  ].filter(Boolean).join("     ");
  if (contactLine) doc.text(contactLine, pageW / 2, y + 18, { align: "center" });
  doc.line(margin, y + 21, pageW - margin, y + 21);
  y += 21;

  // ===== Title band + copies =====
  const bandH = 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("TAX INVOICE", margin + 4, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Under Section 31 Read with Rule 7 GST 2017", margin + 4, y + 10.5);

  {
    const copies = ["Original For Buyer's", "Duplicate For Transporter's", "Triplicate For Supplier"];
    const copyX = pageW - margin - 62;
    copies.forEach((c, i) => {
      doc.rect(copyX, y + 1.5 + i * 3.2, 2.2, 2.2);
      doc.setFontSize(7.5);
      doc.text(c, copyX + 3.6, y + 3.4 + i * 3.2);
    });
  }
  doc.line(margin, y + bandH, pageW - margin, y + bandH);
  y += bandH;

  // ===== Invoice meta =====
  const metaH = 22;
  const colW = innerW / 2;
  doc.line(margin + colW, y, margin + colW, y + metaH);

  doc.setFontSize(9);
  const leftRows: [string, string][] = [
    [`GSTIN No :`, business.gstin || ""],
    [`STATE CODE :`, business.state_code || ""],
    [`Order No :`, ""],
    [`Order Date :`, fmtDate(order.invoice_date)],
  ];
  const rightRows: [string, string, string, string][] = [
    [`Invoice No :`, order.invoice_number, `Date :`, fmtDate(order.invoice_date)],
    [`Transport :`, "", ``, ``],
    [`Lr No :`, "", `Parcel :`, ``],
    [`Destination :`, party?.state || "", "", ""],
  ];
  leftRows.forEach((r, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(r[0], margin + 3, y + 5 + i * 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(r[1], margin + 30, y + 5 + i * 4.5);
  });
  rightRows.forEach((r, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(r[0], margin + colW + 3, y + 5 + i * 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(r[1], margin + colW + 28, y + 5 + i * 4.5);
    if (r[2]) {
      doc.setFont("helvetica", "bold");
      doc.text(r[2], margin + colW + 60, y + 5 + i * 4.5);
      doc.setFont("helvetica", "normal");
      doc.text(r[3], margin + colW + 72, y + 5 + i * 4.5);
    }
  });
  doc.line(margin, y + metaH, pageW - margin, y + metaH);
  y += metaH;

  // ===== Receiver / Consignee headers =====
  const titleH = 5.5;
  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y, colW, titleH, "F");
  doc.rect(margin + colW, y, colW, titleH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Details of Receiver", margin + colW / 2, y + 4, { align: "center" });
  doc.text("Details of Consignee", margin + colW + colW / 2, y + 4, { align: "center" });
  doc.line(margin + colW, y, margin + colW, y + titleH);
  y += titleH;

  // Party block — address wraps over multiple lines without overlapping the State Code column.
  const partyH = 30;
  doc.line(margin + colW, y, margin + colW, y + partyH);
  const drawParty = (xOff: number) => {
    const lx = margin + xOff + 3;
    const px = margin + xOff + 18;
    // Right-side state-code column reserve so address never overlaps it
    const stateColReserve = 42;
    const valMaxW = colW - (px - (margin + xOff)) - stateColReserve;
    doc.setFontSize(8.5);
    const addr = (party?.address || "").trim();
    const stateLine = party?.state ? (party?.state_code ? `${party.state} (${party.state_code})` : party.state) : "";
    const addrLines = doc.splitTextToSize(addr, valMaxW) as string[];
    // Cap to 2 lines so layout never overflows the party box
    const a1 = addrLines[0] || "";
    const a2 = addrLines.length > 1
      ? (addrLines.length > 2 ? addrLines.slice(1).join(" ") : addrLines[1])
      : "";
    const a2Fit = a2 ? (doc.splitTextToSize(a2, valMaxW)[0] as string) : "";

    const rows: [string, string][] = [
      ["Name :", party?.name || order.party_name || ""],
      ["Add :", a1],
      ["", a2Fit || stateLine],
      ["GSTIN :", party?.gstin || order.party_gstin || ""],
      ["PAN No :", party?.pan || ""],
      ["Mob :", party?.phone || ""],
    ];
    rows.forEach((r, i) => {
      doc.setFont("helvetica", "bold");
      doc.text(r[0], lx, y + 4.2 + i * 4.3);
      doc.setFont("helvetica", "normal");
      const fitVal = doc.splitTextToSize(String(r[1]), valMaxW)[0] as string;
      doc.text(fitVal || "", px, y + 4.2 + i * 4.3);
    });
    doc.setFont("helvetica", "bold");
    doc.text("State Code :", margin + xOff + colW - 38, y + 4.2 + 5 * 4.3);
    doc.setFont("helvetica", "normal");
    doc.text(party?.state_code || "", margin + xOff + colW - 8, y + 4.2 + 5 * 4.3);
  };
  drawParty(0);
  drawParty(colW);
  doc.line(margin, y + partyH, pageW - margin, y + partyH);
  y += partyH;

  // ===== Items table — fixed visual area, single page =====
  const head = [["No", "Description of Product / Service", "HSN/SAC", "Per", "Qty", "Rate", "D%", "Amount", "RT%", "Value of Supply"]];
  const realBody = items.map((it, i) => [
    String(i + 1),
    it.product_name,
    it.hsn_code || "",
    (it.unit || "PCS").toUpperCase(),
    num(it.quantity, 2),
    num(it.price, 2),
    Number(it.discount) > 0 ? num((Number(it.discount) / (Number(it.quantity) * Number(it.price) || 1)) * 100, 0) : "",
    num(it.taxable_amount, 2),
    `${num(it.gst_rate, 0)}%`,
    num(Number(it.taxable_amount) + Number(it.tax_amount), 2),
  ]);

  // Footer reserve: bifurcation strip(6) + 4×gstRow(22.4) + words+net(11.2) + bank(24) ≈ 64
  const FOOTER_BLOCK = 66;
  const tableTop = y;
  const availableH = pageH - margin - FOOTER_BLOCK - tableTop;
  const headerRowH = 8.5;

  // Always fill the available area: pad blank rows so table reaches the footer.
  // For ≤ ~14 items, rows are tall (≈7mm). For more items, rows shrink to fit.
  const MAX_ROW_H = 7;
  const MIN_ROW_H = 3.4;
  const itemCount = realBody.length;
  // Choose slotCount so rowH lands in the comfortable range when itemCount is small.
  const slotsForFill = Math.max(itemCount, Math.floor((availableH - headerRowH) / MAX_ROW_H));
  const rowH = Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, (availableH - headerRowH) / slotsForFill));
  const slotCount = Math.max(itemCount, Math.floor((availableH - headerRowH) / rowH));
  const bodyFont = Math.max(5.8, Math.min(8.5, rowH * 1.1));
  const cellPad = Math.max(0.3, Math.min(1.4, rowH * 0.22));

  const blankRows: string[][] = [];
  if (itemCount < slotCount) {
    for (let i = 0; i < slotCount - itemCount; i++) {
      blankRows.push(["", "", "", "", "", "", "", "", "", ""]);
    }
  }
  const body = [...realBody, ...blankRows];

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    margin: { left: margin, right: margin },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    tableWidth: innerW,
    styles: {
      fontSize: bodyFont,
      cellPadding: cellPad,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: 0,
      valign: "middle",
      overflow: "linebreak",
      minCellHeight: rowH,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: 0,
      fontStyle: "bold",
      halign: "center",
      lineWidth: 0.3,
      cellPadding: Math.max(0.8, cellPad),
      fontSize: Math.max(7, bodyFont - 0.5),
      minCellHeight: headerRowH,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },                  // No
      1: { cellWidth: 56 },                                   // Description
      2: { cellWidth: 16, halign: "center" },                 // HSN/SAC
      3: { cellWidth: 11, halign: "center" },                 // Per
      4: { cellWidth: 14, halign: "right" },                  // Qty
      5: { cellWidth: 16, halign: "right" },                  // Rate
      6: { cellWidth: 9, halign: "center" },                  // D%
      7: { cellWidth: 22, halign: "right" },                  // Amount
      8: { cellWidth: 11, halign: "center" },                 // RT%
      9: { cellWidth: 31, halign: "right" },                  // Value of Supply
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = (doc as any).lastAutoTable.finalY;

  // Hard-clamp footer block so it never gets cut off
  const footerTop = pageH - margin - FOOTER_BLOCK;
  y = Math.min(Math.max(tableEndY, footerTop), footerTop);

  // ===== "GST BIFURCATION" strip =====
  const isInter = order.is_interstate;
  const totalQty = items.reduce((s, it) => s + Number(it.quantity), 0);
  const stripH = 6;

  // Layout widths matching reference: left half = bifurcation grid, right half = summary
  const leftW = innerW * 0.55;
  const rightW = innerW - leftW;
  const rightX = margin + leftW;

  // Bifurcation header row (left): "GST BIFURCATION" centered + Total : <qty>
  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y, leftW, stripH, "F");
  doc.rect(margin, y, leftW, stripH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("GST BIFURCATION", margin + leftW * 0.30, y + 4.2, { align: "center" });
  // separator before Total cell
  const totalLabelX = margin + leftW * 0.62;
  doc.line(totalLabelX, y, totalLabelX, y + stripH);
  doc.text("Total :", totalLabelX + 3, y + 4.2);
  const qtyCellX = margin + leftW * 0.85;
  doc.line(qtyCellX, y, qtyCellX, y + stripH);
  doc.setFont("helvetica", "normal");
  doc.text(num(totalQty, 0), (qtyCellX + margin + leftW) / 2, y + 4.2, { align: "center" });

  // Right: Total Amount Before Tax
  doc.setFillColor(255, 255, 255);
  doc.rect(rightX, y, rightW, stripH);
  doc.setFont("helvetica", "bold");
  doc.text("Total Amount Before Tax :", rightX + 3, y + 4.2);
  doc.text(num(order.subtotal, 2), pageW - margin - 3, y + 4.2, { align: "right" });
  y += stripH;

  // ===== GST split table (left) — 6 columns: RT%, Value, CGST, SGST, IGST, Total =====
  const gw = [10, 24, 18, 18, 20, 22.5];
  const gWidth = gw.reduce((a, b) => a + b, 0);
  // Scale gw to leftW
  const gscale = leftW / gWidth;
  const cw = gw.map(w => w * gscale);
  const gstRowH = 5.6;

  const drawLeftRow = (vals: string[], bold = false, fill = false) => {
    let gx = margin;
    vals.forEach((v, i) => {
      if (fill) { doc.setFillColor(235, 235, 235); doc.rect(gx, y, cw[i], gstRowH, "F"); }
      doc.rect(gx, y, cw[i], gstRowH);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const align = i === 0 ? "center" : "right";
      const tx = align === "center" ? gx + cw[i] / 2 : gx + cw[i] - 1.5;
      doc.text(v, tx, y + 3.9, { align: align as "center" | "right" });
      gx += cw[i];
    });
  };

  // GST header row
  doc.setFontSize(8);
  drawLeftRow(["RT%", "Value", "CGST", "SGST", "IGST", "Total"], true, true);
  // Right side header: Add CGST
  doc.rect(rightX, y, rightW, gstRowH);
  doc.setFont("helvetica", "bold");
  doc.text("Add : CGST :", rightX + 3, y + 3.9);
  doc.setFont("helvetica", "normal");
  doc.text(isInter ? "-" : num(order.cgst, 2), pageW - margin - 3, y + 3.9, { align: "right" });
  y += gstRowH;

  // GST values row (single rate row, summarised)
  drawLeftRow([
    `${num(items[0]?.gst_rate || 0, 0)}`,
    num(order.subtotal, 2),
    isInter ? "-" : num(order.cgst, 2),
    isInter ? "-" : num(order.sgst, 2),
    isInter ? num(order.igst, 2) : "-",
    num(Number(order.cgst) + Number(order.sgst) + Number(order.igst), 2),
  ]);
  doc.rect(rightX, y, rightW, gstRowH);
  doc.setFont("helvetica", "bold");
  doc.text("Add : SGST :", rightX + 3, y + 3.9);
  doc.setFont("helvetica", "normal");
  doc.text(isInter ? "-" : num(order.sgst, 2), pageW - margin - 3, y + 3.9, { align: "right" });
  y += gstRowH;

  // Empty placeholder row + IGST line
  drawLeftRow(["", "", "", "", "", ""]);
  doc.rect(rightX, y, rightW, gstRowH);
  doc.setFont("helvetica", "bold");
  doc.text("Add : IGST :", rightX + 3, y + 3.9);
  doc.setFont("helvetica", "normal");
  doc.text(isInter ? num(order.igst, 2) : "-", pageW - margin - 3, y + 3.9, { align: "right" });
  y += gstRowH;

  // Total row (left) + Total Tax Amount GST (right)
  drawLeftRow([
    "Total :",
    num(order.subtotal, 2),
    isInter ? "" : num(order.cgst, 2),
    isInter ? "" : num(order.sgst, 2),
    isInter ? num(order.igst, 2) : "",
    num(Number(order.cgst) + Number(order.sgst) + Number(order.igst), 2),
  ], true);
  doc.rect(rightX, y, rightW, gstRowH);
  doc.setFont("helvetica", "bold");
  doc.text("Total Tax Amount GST :", rightX + 3, y + 3.9);
  doc.text(num(Number(order.cgst) + Number(order.sgst) + Number(order.igst), 2), pageW - margin - 3, y + 3.9, { align: "right" });
  y += gstRowH;

  // Words row (left wide spans this row + Net Amount row) + Round Off (right) + Net Amount (right, highlighted)
  const wordsH = gstRowH * 2;
  doc.rect(margin, y, leftW, wordsH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const wordsText = `Rs : ${toWords(Math.round(Number(order.total)))}`;
  const wrappedWords = doc.splitTextToSize(wordsText, leftW - 4);
  doc.text(wrappedWords.slice(0, 2), margin + 2, y + 4.4);

  // Right: Round Off row
  doc.rect(rightX, y, rightW, gstRowH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Round Off :", rightX + 3, y + 3.9);
  doc.setFont("helvetica", "normal");
  const roundOff = Math.round(Number(order.total)) - Number(order.total);
  doc.text(num(roundOff, 2), pageW - margin - 3, y + 3.9, { align: "right" });
  y += gstRowH;

  // Right: Net Amount row (highlighted)
  doc.setFillColor(235, 235, 235);
  doc.rect(rightX, y, rightW, gstRowH, "F");
  doc.rect(rightX, y, rightW, gstRowH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Net Amount :", rightX + 3, y + 4.1);
  doc.text(num(Math.round(Number(order.total)), 2), pageW - margin - 3, y + 4.1, { align: "right" });
  y += gstRowH;

  // ===== Bank details + Signature =====
  const bankH = 24;
  const halfW = innerW / 2;
  doc.rect(margin, y, halfW, bankH);
  doc.rect(margin + halfW, y, halfW, bankH);

  // Split the left bank box into two side-by-side columns so long names/branches never overlap
  const bankColW = halfW / 2;
  const bankColX = margin + bankColW;
  doc.line(bankColX, y, bankColX, y + 10); // divider only across top two info rows

  const fitText = (text: string, maxW: number, fontSize: number): string => {
    doc.setFontSize(fontSize);
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const bankLabel = "Bank : ";
  doc.text(bankLabel, margin + 2, y + 4.5);
  doc.setFont("helvetica", "normal");
  const bankLabelW = doc.getTextWidth(bankLabel);
  doc.text(fitText(business.bank_name || "", bankColW - bankLabelW - 4, 9), margin + 2 + bankLabelW, y + 4.5);

  doc.setFont("helvetica", "bold");
  const branchLabel = "Branch : ";
  doc.text(branchLabel, bankColX + 2, y + 4.5);
  doc.setFont("helvetica", "normal");
  const branchLabelW = doc.getTextWidth(branchLabel);
  doc.text(fitText(business.bank_branch || "", bankColW - branchLabelW - 4, 9), bankColX + 2 + branchLabelW, y + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const acLabel = "A/c No : ";
  doc.text(acLabel, margin + 2, y + 8.8);
  doc.setFont("helvetica", "normal");
  const acLabelW = doc.getTextWidth(acLabel);
  doc.text(fitText(business.bank_account || "", bankColW - acLabelW - 4, 8.5), margin + 2 + acLabelW, y + 8.8);

  doc.setFont("helvetica", "bold");
  const ifscLabel = "IFSC : ";
  doc.text(ifscLabel, bankColX + 2, y + 8.8);
  doc.setFont("helvetica", "normal");
  const ifscLabelW = doc.getTextWidth(ifscLabel);
  doc.text(fitText(business.bank_ifsc || "", bankColW - ifscLabelW - 4, 8.5), bankColX + 2 + ifscLabelW, y + 8.8);

  // T&C
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Terms & Conditions :", margin + halfW / 2, y + 12.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  const tc = (settings?.terms_and_conditions ||
    "1. Goods Once Sold Can Not Be Taken Back.\n2. Interest @ 18% Will Be Charged On Over Due Payments.\n3. Payment Within 30 Days.\n4. Subject To Ahmedabad Jurisdiction").split("\n");
  tc.slice(0, 4).forEach((line, i) => doc.text(line, margin + 3, y + 16 + i * 2.4));

  // Right: signature
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.text("Certified That The Particulars Given Above Are True And Correct.", margin + halfW + halfW / 2, y + 4.5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(`For, ${business.business_name || ""}`, margin + halfW + halfW / 2, y + 10, { align: "center" });
  if (settings?.signature_text) {
    doc.setFont("times", "italic");
    doc.setFontSize(11);
    doc.text(settings.signature_text, margin + halfW + halfW / 2, y + 17, { align: "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Authorised Signatory", margin + halfW + halfW / 2, y + bankH - 2.5, { align: "center" });

  return doc;
};

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
const buildFileName = (kind: InvoiceDocKind, order: Order, party?: PartyInfo) => {
  const prefix = kind === "estimate" ? "Estimate" : "Invoice";
  const partyName = party?.name || order.party_name || "";
  const partPart = partyName ? `-${sanitize(partyName)}` : "";
  return `${prefix}-${sanitize(order.invoice_number)}${partPart}.pdf`;
};

export const downloadInvoice = (
  order: Order,
  items: OrderItem[],
  business: BusinessInfo,
  settings: AppSettings | null,
  party?: PartyInfo,
  kind: InvoiceDocKind = "invoice",
  options: PdfOptions = {},
) => {
  const doc = generateInvoicePDF(order, items, business, settings, party, kind, options);
  doc.save(buildFileName(kind, order, party));
};

export const printInvoice = (
  order: Order,
  items: OrderItem[],
  business: BusinessInfo,
  settings: AppSettings | null,
  party?: PartyInfo,
  kind: InvoiceDocKind = "invoice",
  options: PdfOptions = {},
) => {
  const doc = generateInvoicePDF(order, items, business, settings, party, kind, options);
  // Open the system/browser print dialog — user picks printer, paper size, color, copies
  doc.autoPrint();
  const url = doc.output("bloburl");
  const w = window.open(url, "_blank");
  if (!w) {
    doc.save(buildFileName(kind, order, party));
  }
};

export const shareInvoiceWhatsApp = async (
  order: Order,
  items: OrderItem[],
  business: BusinessInfo,
  settings: AppSettings | null,
  phone?: string | null,
  party?: PartyInfo,
  kind: InvoiceDocKind = "invoice",
  options: PdfOptions = {},
) => {
  const doc = generateInvoicePDF(order, items, business, settings, party, kind, options);
  const prefix = kind === "estimate" ? "Estimate" : "Invoice";
  const fileName = buildFileName(kind, order, party);
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });

  const docLabel = kind === "estimate" ? "estimate" : "invoice";
  const text = `Hello ${order.party_name || ""},\n\nHere is your ${docLabel} ${order.invoice_number} for ${inr(order.total)}.\n\nThanks,\n${business.business_name || ""}`;

  // Prefer native share with file attachment (mobile): opens WhatsApp directly with PDF
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: `${prefix} ${order.invoice_number}`, text });
      return;
    } catch {
      /* fall through */
    }
  }

  // Desktop fallback: download the PDF AND redirect to WhatsApp Web so user can attach it
  doc.save(fileName);
  const cleanPhone = phone?.replace(/\D/g, "") || "";
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text + "\n\n(Please attach the downloaded PDF)")}`;
  window.open(waUrl, "_blank");
};
