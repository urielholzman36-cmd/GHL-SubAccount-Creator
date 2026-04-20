import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { BRAND, getLogoBuffer } from '../../proposals/services/brand.js';

let smallLogoPromise = null;
function getSmallLogo() {
  if (smallLogoPromise) return smallLogoPromise;
  smallLogoPromise = (async () => {
    try {
      const full = getLogoBuffer();
      return await sharp(full).resize({ width: 400 }).png({ compressionLevel: 9 }).toBuffer();
    } catch {
      return null;
    }
  })();
  return smallLogoPromise;
}

function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[m - 1]} ${y}`;
}

function formatDateShort(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function drawCover(doc, { clientName, month, generatedAt, logo }) {
  doc.save();
  // White cover with a navy band at the bottom
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(BRAND.colors.white);

  // Logo on white
  if (logo) {
    try { doc.image(logo, 54, 80, { fit: [220, 130], align: 'left', valign: 'top' }); } catch { /* skip */ }
  }

  // Orange divider
  doc.rect(54, 260, 60, 4).fill(BRAND.colors.orange);

  doc.font(BRAND.fonts.heading).fontSize(13).fillColor(BRAND.colors.bodyText)
    .text('MONTHLY PERFORMANCE REPORT', 54, 280, { characterSpacing: 2 });

  doc.font(BRAND.fonts.heading).fontSize(42).fillColor(BRAND.colors.navy)
    .text(clientName, 54, 320, { width: doc.page.width - 108 });

  doc.font(BRAND.fonts.heading).fontSize(26).fillColor(BRAND.colors.orange)
    .text(monthLabel(month), 54, 395);

  // Navy footer band
  const bandY = doc.page.height - 100;
  doc.rect(0, bandY, doc.page.width, 100).fill(BRAND.colors.navy);
  doc.font(BRAND.fonts.heading).fontSize(12).fillColor(BRAND.colors.white)
    .text('VO360 — Your Intelligent Execution Partner', 54, bandY + 30, { characterSpacing: 1 });
  doc.font(BRAND.fonts.body).fontSize(10).fillColor(BRAND.colors.white)
    .text(`Prepared by VO360  ·  Generated ${formatDateShort(generatedAt)}`, 54, bandY + 55);

  doc.restore();
}

function drawSectionHeader(doc, title, y) {
  doc.save();
  doc.rect(54, y - 6, 4, 24).fill(BRAND.colors.orange);
  doc.fillColor(BRAND.colors.navy).font(BRAND.fonts.heading).fontSize(18)
    .text(title, 72, y, { lineBreak: false });
  doc.restore();
  return y + 36;
}

function drawExecSummary(doc, narrative) {
  doc.addPage();
  let y = drawSectionHeader(doc, 'Executive Summary', 60);
  doc.font(BRAND.fonts.body).fontSize(11).fillColor(BRAND.colors.bodyText);
  doc.text(narrative.exec_summary, 54, y, {
    width: doc.page.width - 108,
    align: 'left',
    lineGap: 4,
  });
}

function drawLeadPerformance(doc, data) {
  doc.addPage();
  let y = drawSectionHeader(doc, 'Lead Performance', 60);

  const mom = (data.leads_mom_pct === null || data.leads_mom_pct === undefined)
    ? ''
    : ` (${data.leads_mom_pct >= 0 ? '+' : ''}${data.leads_mom_pct}% vs last month)`;

  doc.font(BRAND.fonts.heading).fontSize(48).fillColor(BRAND.colors.navy)
    .text(String(data.leads_count), 54, y);
  doc.font(BRAND.fonts.body).fontSize(12).fillColor(BRAND.colors.bodyText)
    .text(`leads this month${mom}`, 54, y + 60);

  y += 110;
  doc.font(BRAND.fonts.heading).fontSize(14).fillColor(BRAND.colors.navy)
    .text('Top lead sources', 54, y);
  y += 24;

  const barLeft = 54;
  const barRight = doc.page.width - 54;
  const barMaxWidth = barRight - barLeft - 140;
  const rowHeight = 28;
  const maxPct = Math.max(1, ...(data.lead_sources || []).map((s) => s.pct));

  for (const src of (data.lead_sources || [])) {
    const w = (src.pct / maxPct) * barMaxWidth;
    doc.save();
    doc.rect(barLeft, y, w, 14).fill(BRAND.colors.orange);
    doc.restore();
    doc.font(BRAND.fonts.body).fontSize(10).fillColor(BRAND.colors.bodyText)
      .text(`${src.source} — ${src.count} (${src.pct}%)`, barLeft + w + 8, y);
    y += rowHeight;
  }
}

function drawMetricCard(doc, x, y, w, h, label, value, accentColor) {
  doc.save();
  doc.rect(x, y, w, h).lineWidth(1).stroke(BRAND.colors.backgroundLight);
  doc.rect(x, y, 4, h).fill(accentColor);
  doc.fillColor(BRAND.colors.navy).font(BRAND.fonts.heading).fontSize(28)
    .text(String(value), x + 16, y + 16, { width: w - 24 });
  doc.fillColor(BRAND.colors.bodyText).font(BRAND.fonts.body).fontSize(10)
    .text(label, x + 16, y + 56, { width: w - 24 });
  doc.restore();
}

function drawAppointments(doc, data) {
  doc.addPage();
  let y = drawSectionHeader(doc, 'Appointments & Conversion', 60);

  const w = (doc.page.width - 108 - 32) / 3;
  const h = 96;
  drawMetricCard(doc, 54, y, w, h, 'Appointments booked', data.appointments_booked, BRAND.colors.orange);
  drawMetricCard(doc, 54 + w + 16, y, w, h, 'Show rate', `${data.show_rate_pct}%`, BRAND.colors.magenta);
  drawMetricCard(doc, 54 + (w + 16) * 2, y, w, h, 'Converted', `${data.converted_rate_pct}%`, BRAND.colors.navy);
}

function drawRecommendations(doc, narrative) {
  doc.addPage();
  let y = drawSectionHeader(doc, 'Recommendations', 60);
  doc.font(BRAND.fonts.body).fontSize(11).fillColor(BRAND.colors.bodyText);
  for (const rec of (narrative.recommendations || [])) {
    doc.circle(62, y + 6, 3).fill(BRAND.colors.orange);
    doc.fillColor(BRAND.colors.bodyText);
    doc.text(rec, 74, y, { width: doc.page.width - 128, lineGap: 2 });
    const height = doc.heightOfString(rec, { width: doc.page.width - 128, lineGap: 2 });
    y += Math.max(24, height + 12);
  }
}

export async function buildReportPdf({ clientName, month, generatedAt, data, narrative }) {
  const logo = await getSmallLogo();
  return await new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({
        size: BRAND.page.size,
        margins: BRAND.page.margins,
        info: { Title: `${clientName} — ${monthLabel(month)}`, Author: 'VO360' },
      });
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawCover(doc, { clientName, month, generatedAt, logo });
      drawExecSummary(doc, narrative);
      drawLeadPerformance(doc, data);
      drawAppointments(doc, data);
      drawRecommendations(doc, narrative);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
