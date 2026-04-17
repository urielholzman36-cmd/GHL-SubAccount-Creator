import {
  Document, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 400, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: '1B2B6B', font: 'Calibri' })],
  });
}
function bodyLine(text) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, color: '555555', font: 'Calibri' })],
  });
}
function spacer(points = 200) {
  return new Paragraph({ spacing: { after: points } });
}
function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none };
}
function cell(text, bold = false) {
  return new TableCell({
    borders: noBorders(),
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      children: [new TextRun({ text, bold, size: 22, color: bold ? '1B2B6B' : '555555', font: 'Calibri' })],
    })],
  });
}

export function buildProposalDocx(config) {
  const pkg = config.package;
  const vo = config.vo360;
  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'Business Growth Proposal', bold: true, size: 48, color: '1B2B6B', font: 'Calibri' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: '[Client Business Name]', bold: true, size: 32, color: 'F47B20', font: 'Calibri' })],
  }));

  children.push(sectionTitle('Prepared For'));
  children.push(bodyLine('Name: [Client Full Name]'));
  children.push(bodyLine('Email: [client@example.com]'));
  children.push(bodyLine('Phone: [Phone Number]'));
  children.push(bodyLine('Industry: [Niche]'));
  children.push(spacer());

  children.push(sectionTitle('Package Overview'));
  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({
      text: `${pkg.name} — $${pkg.price}/${pkg.billing}`,
      bold: true, size: 24, color: '1B2B6B', font: 'Calibri',
    })],
  }));
  for (const service of pkg.services) {
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `\u2713  ${service}`, size: 22, color: '555555', font: 'Calibri' })],
    }));
  }
  children.push(spacer());

  children.push(sectionTitle('Investment Summary'));
  const rows = [
    ['Monthly Fee', `$${pkg.price}`],
    ['Setup Fee', `$${pkg.setup_fee}`],
    ['Minimum Term', `${pkg.contract_length_months} months`],
  ];
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([l, v]) => new TableRow({ children: [cell(l), cell(v, true)] })),
  }));
  children.push(spacer());

  children.push(sectionTitle('Next Steps'));
  const steps = [
    'Sign the service agreement to lock in your spot.',
    "We'll schedule your onboarding call within 48 hours.",
    'Your systems go live within 7 days of onboarding.',
  ];
  steps.forEach((step, i) => {
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${i + 1}. `, bold: true, size: 22, color: 'F47B20', font: 'Calibri' }),
        new TextRun({ text: step, size: 22, color: '555555', font: 'Calibri' }),
      ],
    }));
  });
  children.push(spacer(300));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: `${vo.company_name} | ${vo.website} | ${vo.email}`,
      size: 18, color: '999999', font: 'Calibri', italics: true,
    })],
  }));

  return new Document({ sections: [{ children }] });
}
