import { Document, Paragraph, TextRun, AlignmentType } from 'docx';

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
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function buildContractDocx(config) {
  const pkg = config.package;
  const vo = config.vo360;
  const pt = pkg.payment_terms || { due_day: 1, auto_charge_after_days: 3, late_fee_percent: 5 };
  const cancellationDays = pkg.cancellation_notice_days ?? 30;
  const governingState = pkg.governing_state || 'Florida';
  const notIncluded = pkg.not_included || [];

  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'Service Agreement', bold: true, size: 48, color: '1B2B6B', font: 'Calibri' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: 'Date: [YYYY-MM-DD]', size: 22, color: '555555', font: 'Calibri' })],
  }));

  children.push(sectionTitle('1. Parties'));
  children.push(bodyLine(`Provider: ${vo.company_name}`));
  children.push(bodyLine(`Website: ${vo.website}`));
  children.push(bodyLine(`Email: ${vo.email}`));
  children.push(bodyLine(`Representative: ${vo.rep_name}`));
  children.push(spacer(100));
  children.push(bodyLine('Client: [Client Business Name]'));
  children.push(bodyLine('Contact: [Client Full Name]'));
  children.push(bodyLine('Email: [client@example.com]'));
  children.push(bodyLine('Phone: [Phone Number]'));
  children.push(spacer());

  children.push(sectionTitle('2. Services'));
  children.push(bodyLine(`The following services are included in the ${pkg.name} package:`));
  for (const service of pkg.services) {
    children.push(new Paragraph({
      spacing: { after: 40 },
      indent: { left: 360 },
      children: [new TextRun({ text: `\u2022  ${service}`, size: 22, color: '555555', font: 'Calibri' })],
    }));
  }
  if (notIncluded.length > 0) {
    children.push(spacer(100));
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: 'Not Included:', bold: true, size: 22, color: '1B2B6B', font: 'Calibri' })],
    }));
    for (const item of notIncluded) {
      children.push(new Paragraph({
        spacing: { after: 40 },
        indent: { left: 360 },
        children: [new TextRun({ text: `\u2717  ${item}`, size: 22, color: '555555', font: 'Calibri' })],
      }));
    }
  }
  children.push(spacer());

  children.push(sectionTitle('3. Payment Terms'));
  children.push(bodyLine(`Monthly Fee: $${pkg.price.toLocaleString()} (${pkg.billing} billing)`));
  if (pkg.setup_fee > 0) children.push(bodyLine(`Setup Fee: $${pkg.setup_fee.toLocaleString()} (one-time)`));
  children.push(bodyLine(`Payment is due on the ${ordinal(pt.due_day)} of each month.`));
  children.push(bodyLine(`Auto-charge will be applied ${pt.auto_charge_after_days} days after the due date if payment has not been received.`));
  children.push(bodyLine(`A late fee of ${pt.late_fee_percent}% will be applied to overdue balances.`));
  children.push(spacer());

  children.push(sectionTitle('4. Term & Cancellation'));
  children.push(bodyLine(`This agreement has a minimum term of ${pkg.contract_length_months} month${pkg.contract_length_months !== 1 ? 's' : ''}.`));
  children.push(bodyLine('The agreement will automatically renew on a month-to-month basis after the initial term unless cancelled.'));
  children.push(bodyLine(`Either party may cancel with ${cancellationDays} days written notice.`));
  children.push(spacer());

  children.push(sectionTitle('5. Intellectual Property'));
  children.push(bodyLine('All work product created under this agreement shall become the exclusive property of the Client upon full payment. The Provider retains no rights to completed deliverables once payment is received.'));
  children.push(spacer());

  children.push(sectionTitle('6. Limitation of Liability'));
  children.push(bodyLine(`The Provider\u2019s total liability under this agreement shall not exceed the amount of one month\u2019s fee ($${pkg.price.toLocaleString()}). In no event shall either party be liable for indirect, incidental, or consequential damages.`));
  children.push(spacer());

  children.push(sectionTitle('7. Governing Law'));
  children.push(bodyLine(`This agreement shall be governed by and construed in accordance with the laws of the State of ${governingState}.`));
  children.push(spacer());

  children.push(sectionTitle('8. Signatures'));
  children.push(spacer(100));

  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: vo.company_name, bold: true, size: 22, color: '1B2B6B', font: 'Calibri' })],
  }));
  children.push(bodyLine('Name: ' + vo.rep_name));
  children.push(bodyLine('Title: Authorized Representative'));
  children.push(bodyLine('Date: _______________'));
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: 'Signature: _______________________________', size: 22, color: '555555', font: 'Calibri' })],
  }));
  children.push(spacer(200));

  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: '[Client Business Name]', bold: true, size: 22, color: '1B2B6B', font: 'Calibri' })],
  }));
  children.push(bodyLine('Name: [Client Full Name]'));
  children.push(bodyLine('Title: _______________'));
  children.push(bodyLine('Date: _______________'));
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: 'Signature: _______________________________', size: 22, color: '555555', font: 'Calibri' })],
  }));
  children.push(spacer(300));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'This agreement is a template. VO360 recommends independent legal review before use.',
      italics: true, size: 16, color: '999999', font: 'Calibri',
    })],
  }));

  return new Document({ sections: [{ children }] });
}
