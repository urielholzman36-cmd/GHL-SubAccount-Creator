import { BRAND, getLogoBuffer } from './brand.js';

export function sanitizeFilename(name) {
  return String(name || '').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').trim();
}

export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function drawHeaderBar(doc, dateStr) {
  const pageWidth = doc.page.width;
  const savedX = doc.x;
  const savedY = doc.y;

  doc.rect(0, 0, pageWidth, 80).fill(BRAND.colors.navy);

  try {
    const logo = getLogoBuffer();
    doc.image(logo, 30, 15, { height: 50 });
  } catch (err) {
    doc
      .font(BRAND.fonts.heading)
      .fontSize(20)
      .fillColor(BRAND.colors.white)
      .text('VO360', 30, 30, { lineBreak: false });
  }

  doc
    .font(BRAND.fonts.body)
    .fontSize(10)
    .fillColor(BRAND.colors.white)
    .text(dateStr, pageWidth - 180, 35, { width: 150, align: 'right', lineBreak: false });

  doc.x = savedX;
  doc.y = savedY;
}

export function drawFooter(doc) {
  const pageWidth = doc.page.width;
  const y = doc.page.height - 30;
  const savedY = doc.y;

  doc
    .font(BRAND.fonts.body)
    .fontSize(8)
    .fillColor(BRAND.colors.bodyText)
    .text(
      'vo360.net  |  hello@vo360.net  |  Your Intelligent Execution Partner',
      54,
      y,
      { width: pageWidth - 108, align: 'center', lineBreak: false },
    );

  doc.y = savedY;
}

export function drawSectionTitle(doc, title) {
  doc
    .font(BRAND.fonts.heading)
    .fontSize(14)
    .fillColor(BRAND.colors.navy)
    .text(title)
    .moveDown(0.5);
}

export function resetBodyStyle(doc) {
  doc.font(BRAND.fonts.body).fontSize(10).fillColor(BRAND.colors.bodyText);
}
