import PDFDocument from 'pdfkit';
import { BRAND } from './brand.js';
import { drawHeaderBar, drawSectionTitle, resetBodyStyle, formatDate } from './pdf-utils.js';

const SERVICE_DESCRIPTIONS = {
  'Full Website Build':
    'A professionally designed, mobile-optimized website built to convert visitors into leads — tailored to your industry and brand.',
  'Unified Omni-Channel Chat':
    'One inbox for all your customer conversations — SMS, email, social media, and web chat — so no lead falls through the cracks.',
  'Full Sales Pipeline Setup':
    'A structured sales pipeline that tracks every lead from first contact to closed deal, with automated follow-ups at every stage.',
  'GMB Growth & Reputation Suite':
    'Automated review requests, reputation monitoring, and Google My Business optimization to boost your local search rankings.',
  'Automated SMS/WhatsApp Messaging':
    'Reach prospects and customers instantly with automated text and WhatsApp campaigns that drive engagement and bookings.',
  'Multi-Platform Social Planner':
    'Plan, schedule, and publish content across all your social media platforms from a single dashboard.',
  'AI Appointment Setter Chatbot':
    "An intelligent chatbot that qualifies leads, answers common questions, and books appointments 24/7 — even when you're on a job.",
  'Business Process Automation':
    'Custom automations that eliminate repetitive tasks — from intake forms to invoicing — so you can focus on growing your business.',
};

export async function generateProposal(config, client) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: BRAND.page.size, margins: BRAND.page.margins });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = 612;
    const contentWidth = pageWidth - BRAND.page.margins.left - BRAND.page.margins.right;
    const leftX = BRAND.page.margins.left;
    const dateStr = formatDate(new Date());

    doc.on('pageAdded', () => {
      drawHeaderBar(doc, dateStr);
      doc.x = leftX;
      doc.y = 100;
    });

    drawHeaderBar(doc, dateStr);

    doc.moveDown(4);
    doc
      .font(BRAND.fonts.heading)
      .fontSize(26)
      .fillColor(BRAND.colors.navy)
      .text('Business Growth Proposal', leftX, doc.y, { width: contentWidth });
    doc
      .font(BRAND.fonts.heading)
      .fontSize(18)
      .fillColor(BRAND.colors.orange)
      .text(client.business_name, { width: contentWidth });
    doc.moveDown(1);

    drawSectionTitle(doc, 'Prepared For');
    resetBodyStyle(doc);
    doc.text(`Name: ${client.client_name}`, { width: contentWidth });
    doc.text(`Email: ${client.email}`, { width: contentWidth });
    if (client.phone) doc.text(`Phone: ${client.phone}`, { width: contentWidth });
    if (client.niche) {
      const badgeY = doc.y + 4;
      const badgeText = client.niche;
      const badgeWidth = doc.widthOfString(badgeText) + 16;
      doc.roundedRect(leftX, badgeY, badgeWidth, 20, 4).fill(BRAND.colors.orange);
      doc
        .font(BRAND.fonts.heading)
        .fontSize(9)
        .fillColor(BRAND.colors.white)
        .text(badgeText, leftX + 8, badgeY + 5, { width: badgeWidth - 16 });
      doc.y = badgeY + 28;
      resetBodyStyle(doc);
    }
    doc.moveDown(1);

    drawSectionTitle(doc, 'Package Overview');
    doc
      .font(BRAND.fonts.heading)
      .fontSize(12)
      .fillColor(BRAND.colors.navy)
      .text(
        `${config.package.name} — $${config.package.price}/${config.package.billing}`,
        { width: contentWidth },
      );
    doc.moveDown(0.5);
    resetBodyStyle(doc);

    for (const service of config.package.services) {
      doc.text(`✓  ${service}`, leftX + 10, doc.y, { width: contentWidth - 10 });
    }
    doc.moveDown(1);

    drawSectionTitle(doc, 'What You Get');

    for (const service of config.package.services) {
      if (doc.y > 680) doc.addPage();

      doc
        .font(BRAND.fonts.heading)
        .fontSize(11)
        .fillColor(BRAND.colors.navy)
        .text(service, leftX, doc.y, { width: contentWidth });
      doc.moveDown(0.2);
      resetBodyStyle(doc);
      const description = SERVICE_DESCRIPTIONS[service]
        || 'A powerful tool designed to help grow your business.';
      doc.text(description, { width: contentWidth });
      doc.moveDown(0.6);
    }
    doc.moveDown(0.5);

    if (doc.y > 600) doc.addPage();
    drawSectionTitle(doc, 'Investment Summary');

    const tableRows = [
      ['Monthly Fee', `$${config.package.price}`],
      ['Setup Fee', `$${config.package.setup_fee}`],
      ['Minimum Term', `${config.package.contract_length_months} months`],
    ];
    const colWidths = [contentWidth * 0.6, contentWidth * 0.4];
    const rowHeight = 28;

    for (let i = 0; i < tableRows.length; i++) {
      const rowY = doc.y;
      if (i % 2 === 0) {
        doc.rect(leftX, rowY, contentWidth, rowHeight).fill('#F0F0F0');
      }
      doc
        .font(BRAND.fonts.body)
        .fontSize(10)
        .fillColor(BRAND.colors.bodyText)
        .text(tableRows[i][0], leftX + 8, rowY + 8, { width: colWidths[0] });
      doc
        .font(BRAND.fonts.heading)
        .fontSize(10)
        .fillColor(BRAND.colors.navy)
        .text(tableRows[i][1], leftX + colWidths[0], rowY + 8, {
          width: colWidths[1],
          align: 'right',
        });
      doc.y = rowY + rowHeight;
    }
    doc.moveDown(1);

    if (doc.y > 640) doc.addPage();
    drawSectionTitle(doc, 'Next Steps');
    resetBodyStyle(doc);

    const steps = [
      'Sign the service agreement to lock in your spot.',
      "We'll schedule your onboarding call within 48 hours.",
      'Your systems go live within 7 days of onboarding.',
    ];

    for (let i = 0; i < steps.length; i++) {
      doc
        .font(BRAND.fonts.heading)
        .fontSize(11)
        .fillColor(BRAND.colors.orange)
        .text(`${i + 1}.`, leftX, doc.y, { continued: true, width: contentWidth });
      resetBodyStyle(doc);
      doc.text(`  ${steps[i]}`, { width: contentWidth });
      doc.moveDown(0.4);
    }

    doc.end();
  });
}
