import PDFDocument from 'pdfkit';
import { BRAND } from './brand.js';
import { drawHeaderBar, drawSectionTitle, resetBodyStyle, formatDate } from './pdf-utils.js';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function generateContract(config, client) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: BRAND.page.size, margins: BRAND.page.margins });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dateStr = formatDate(new Date());
    const pkg = config.package;
    const vo = config.vo360;
    const leftMargin = BRAND.page.margins.left;

    doc.on('pageAdded', () => {
      drawHeaderBar(doc, dateStr);
      doc.x = leftMargin;
      doc.y = 100;
    });

    drawHeaderBar(doc, dateStr);

    doc.moveDown(4);
    doc
      .font(BRAND.fonts.heading)
      .fontSize(24)
      .fillColor(BRAND.colors.navy)
      .text('Service Agreement', { align: 'center' });
    doc
      .font(BRAND.fonts.body)
      .fontSize(10)
      .fillColor(BRAND.colors.bodyText)
      .text(`Date: ${dateStr}`, { align: 'center' });
    doc.moveDown(1.5);

    drawSectionTitle(doc, '1. Parties');
    resetBodyStyle(doc);
    doc.text(`Provider: ${vo.company_name}`);
    doc.text(`Website: ${vo.website}`);
    doc.text(`Email: ${vo.email}`);
    doc.text(`Representative: ${vo.rep_name}`);
    doc.moveDown(0.5);
    doc.text(`Client: ${client.business_name}`);
    doc.text(`Contact: ${client.client_name}`);
    doc.text(`Email: ${client.email}`);
    if (client.phone) doc.text(`Phone: ${client.phone}`);
    doc.moveDown(1);

    drawSectionTitle(doc, '2. Services');
    resetBodyStyle(doc);
    doc.text(`The following services are included in the ${pkg.name} package:`);
    doc.moveDown(0.3);
    for (const service of pkg.services) {
      doc.text(`  •  ${service}`, { indent: 10 });
    }
    doc.moveDown(0.5);
    doc.font(BRAND.fonts.heading).fontSize(11).text('Not Included:');
    resetBodyStyle(doc);
    for (const item of (pkg.not_included || [])) {
      doc.text(`  ✗  ${item}`, { indent: 10 });
    }
    doc.moveDown(1);

    drawSectionTitle(doc, '3. Payment Terms');
    resetBodyStyle(doc);
    doc.text(`Monthly Fee: $${pkg.price.toLocaleString()} (${pkg.billing} billing)`);
    if (pkg.setup_fee > 0) {
      doc.text(`Setup Fee: $${pkg.setup_fee.toLocaleString()} (one-time)`);
    }
    const pt = pkg.payment_terms || { due_day: 1, auto_charge_after_days: 3, late_fee_percent: 5 };
    doc.text(`Payment is due on the ${ordinal(pt.due_day)} of each month.`);
    doc.text(`Auto-charge will be applied ${pt.auto_charge_after_days} days after the due date if payment has not been received.`);
    doc.text(`A late fee of ${pt.late_fee_percent}% will be applied to overdue balances.`);
    doc.moveDown(1);

    drawSectionTitle(doc, '4. Term & Cancellation');
    resetBodyStyle(doc);
    doc.text(`This agreement has a minimum term of ${pkg.contract_length_months} month${pkg.contract_length_months !== 1 ? 's' : ''}.`);
    doc.text('The agreement will automatically renew on a month-to-month basis after the initial term unless cancelled.');
    doc.text(`Either party may cancel with ${pkg.cancellation_notice_days ?? 30} days written notice.`);
    doc.moveDown(1);

    drawSectionTitle(doc, '5. Intellectual Property');
    resetBodyStyle(doc);
    doc.text('All work product created under this agreement shall become the exclusive property of the Client upon full payment. The Provider retains no rights to completed deliverables once payment is received.');
    doc.moveDown(1);

    drawSectionTitle(doc, '6. Limitation of Liability');
    resetBodyStyle(doc);
    doc.text(`The Provider's total liability under this agreement shall not exceed the amount of one month's fee ($${pkg.price.toLocaleString()}). In no event shall either party be liable for indirect, incidental, or consequential damages.`);
    doc.moveDown(1);

    drawSectionTitle(doc, '7. Governing Law');
    resetBodyStyle(doc);
    doc.text(`This agreement shall be governed by and construed in accordance with the laws of the State of ${pkg.governing_state || 'Florida'}.`);
    doc.moveDown(1);

    drawSectionTitle(doc, '8. Signatures');
    resetBodyStyle(doc);
    doc.moveDown(0.5);

    const sigY = doc.y;
    const leftX = leftMargin;
    const rightX = 310;
    const lineWidth = 180;

    doc.font(BRAND.fonts.heading).fontSize(10).fillColor(BRAND.colors.navy);
    doc.text(vo.company_name, leftX, sigY);
    resetBodyStyle(doc);
    doc.moveDown(1.5);
    const nameLineY1 = doc.y;
    doc.moveTo(leftX, nameLineY1).lineTo(leftX + lineWidth, nameLineY1).stroke(BRAND.colors.bodyText);
    doc.text('Name: ' + vo.rep_name, leftX, nameLineY1 + 4);
    doc.moveDown(0.5);
    doc.text('Title: Authorized Representative', leftX);
    doc.moveDown(0.5);
    doc.text('Date: _______________', leftX);
    doc.moveDown(1);
    const sigLineY1 = doc.y;
    doc.moveTo(leftX, sigLineY1).lineTo(leftX + lineWidth, sigLineY1).stroke(BRAND.colors.bodyText);
    doc.text('Signature', leftX, sigLineY1 + 4);

    doc.font(BRAND.fonts.heading).fontSize(10).fillColor(BRAND.colors.navy);
    doc.text(client.business_name, rightX, sigY);
    resetBodyStyle(doc);
    const nameLineY2 = nameLineY1;
    doc.moveTo(rightX, nameLineY2).lineTo(rightX + lineWidth, nameLineY2).stroke(BRAND.colors.bodyText);
    doc.text('Name: ' + client.client_name, rightX, nameLineY2 + 4);
    doc.text('Title: _______________', rightX, nameLineY2 + 4 + 14);
    doc.text('Date: _______________', rightX, nameLineY2 + 4 + 28);
    const sigLineY2 = sigLineY1;
    doc.moveTo(rightX, sigLineY2).lineTo(rightX + lineWidth, sigLineY2).stroke(BRAND.colors.bodyText);
    doc.text('Signature', rightX, sigLineY2 + 4);

    doc.end();
  });
}
