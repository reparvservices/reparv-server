import PDFDocument from "pdfkit";

const formatINR = (n) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/**
 * @param {import('express').Response} res
 * @param {object} invoice — row from subscription_gst_invoices
 */
export function streamGstInvoicePdf(res, invoice) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const filename = `GST_Invoice_${invoice.invoice_number.replace(/\//g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const purple = "#5E23DC";
  let y = 50;

  doc.fillColor(purple).fontSize(22).font("Helvetica-Bold").text("TAX INVOICE", 50, y);
  doc.fillColor("#111").fontSize(10).font("Helvetica").text(invoice.invoice_number, 50, y + 28);
  doc.text(`Date: ${formatDate(invoice.invoice_date)}`, 50, y + 42);
  doc.text(`Payment ID: ${invoice.razorpay_payment_id}`, 50, y + 56);

  doc.font("Helvetica-Bold").text("PAID", 480, y, { align: "right" });

  y += 90;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
  y += 20;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280").text("FROM", 50, y);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text(invoice.seller_name || "Reparv", 50, y + 14);
  doc.font("Helvetica").fontSize(9).fillColor("#374151");
  if (invoice.seller_gstin) doc.text(`GSTIN: ${invoice.seller_gstin}`, 50, y + 28);
  doc.text(String(invoice.seller_address || "").slice(0, 120), 50, y + 42, { width: 220 });

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280").text("BILL TO", 300, y);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text(invoice.buyer_name || "Partner", 300, y + 14);
  doc.font("Helvetica").fontSize(9);
  if (invoice.buyer_email) doc.text(invoice.buyer_email, 300, y + 28);
  if (invoice.buyer_contact) doc.text(invoice.buyer_contact, 300, y + 40);
  const loc = [invoice.buyer_city, invoice.buyer_state].filter(Boolean).join(", ");
  if (loc) doc.text(loc, 300, y + 52);
  if (invoice.place_of_supply) {
    doc.text(`Place of supply: ${invoice.place_of_supply}`, 300, y + 64);
  }

  y += 100;
  doc.rect(50, y, 495, 22).fill("#f3f0ff");
  doc.fillColor("#374151").font("Helvetica-Bold").fontSize(8);
  doc.text("DESCRIPTION", 58, y + 7);
  doc.text("HSN/SAC", 280, y + 7);
  doc.text("TAXABLE", 340, y + 7);
  doc.text("TAX", 420, y + 7);
  doc.text("TOTAL", 490, y + 7, { width: 50, align: "right" });

  y += 28;
  doc.fillColor("#111").font("Helvetica").fontSize(9);
  doc.text(invoice.plan_name || "Subscription", 58, y, { width: 210 });
  doc.text(invoice.hsn_sac || "998314", 280, y);
  doc.text(`Rs.${formatINR(invoice.base_amount)}`, 340, y);

  const taxLabel =
    invoice.tax_type === "inter_state"
      ? `IGST @ ${invoice.gst_rate}%`
      : `CGST+SGST @ ${invoice.gst_rate}%`;
  const taxAmt =
    Number(invoice.cgst_amount) + Number(invoice.sgst_amount) + Number(invoice.igst_amount);
  doc.text(`Rs.${formatINR(taxAmt)}`, 420, y);
  doc.text(`Rs.${formatINR(invoice.total_amount)}`, 490, y, { width: 50, align: "right" });

  y += 40;
  doc.moveTo(300, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
  y += 12;

  doc.fontSize(9).fillColor("#6b7280");
  doc.text("Taxable value", 300, y);
  doc.fillColor("#111").text(`Rs.${formatINR(invoice.base_amount)}`, 490, y, { align: "right" });
  y += 14;

  if (Number(invoice.cgst_amount) > 0) {
    doc.fillColor("#6b7280").text(`CGST @ ${Number(invoice.gst_rate) / 2}%`, 300, y);
    doc.fillColor("#111").text(`Rs.${formatINR(invoice.cgst_amount)}`, 490, y, { align: "right" });
    y += 14;
    doc.fillColor("#6b7280").text(`SGST @ ${Number(invoice.gst_rate) / 2}%`, 300, y);
    doc.fillColor("#111").text(`Rs.${formatINR(invoice.sgst_amount)}`, 490, y, { align: "right" });
    y += 14;
  }
  if (Number(invoice.igst_amount) > 0) {
    doc.fillColor("#6b7280").text(`IGST @ ${invoice.gst_rate}%`, 300, y);
    doc.fillColor("#111").text(`Rs.${formatINR(invoice.igst_amount)}`, 490, y, { align: "right" });
    y += 14;
  }

  y += 6;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(purple);
  doc.text("Grand Total", 300, y);
  doc.text(`Rs.${formatINR(invoice.total_amount)}`, 490, y, { align: "right" });

  y += 40;
  doc.font("Helvetica").fontSize(8).fillColor("#9ca3af");
  doc.text(
    "This is a system-generated tax invoice. Subscriptions are non-refundable once activated.",
    50,
    y,
    { width: 495, align: "center" },
  );

  doc.end();
}
