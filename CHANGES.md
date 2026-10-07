# Changes (Tyrebuddy Business OS)

1. Invoice screen rewritten in Tally tax-invoice layout (matches Tbt2.pdf): src/components/invoices/InvoiceView.tsx
   - "Items & options" panel: tap an item to hide/show it; totals, GST and HSN summary recalculate from shown items only.
   - Show/hide: dispatch block, ship-to, buyer GSTIN, SKU line, round-off, HSN table, tax words, remarks, declaration, bank, UPI QR.
   - Round total to Rs 1 / Rs 10 / none. A4 / A5. Tax invoice or Simple bill.
2. Mobile fixes
   - New dependency-free PDF writer: src/utils/invoicePdf.ts (+ invoiceModel.ts, pdfFontMetrics.ts)
   - Buttons: Print (opens the PDF on phones), Save PDF, Share / WhatsApp.
   - src/utils/export.ts: downloads no longer cancelled on phones; CSV has UTF-8 BOM; "File ready" bar (Open / Save / Share) via FileReadyBanner.
   - window.print() elsewhere replaced by safePrint() (src/utils/print.ts).
3. Customer paste: src/utils/addressParser.ts + components/customers/CustomerPasteBox.tsx, used in the new-order form.
   - Order form now has full address fields (city, pincode, state); state auto-set from pincode/GSTIN; item GST switches CGST+SGST <-> IGST when state changes.
   - New customers typed in the order form are now saved to Customers (matched by mobile to avoid duplicates).
