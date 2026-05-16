import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BRAND = {
  colors: {
    navy: '#1B2B6B',
    orange: '#F47B20',
    magenta: '#C2185B',
    backgroundLight: '#F5F5F5',
    bodyText: '#555555',
    white: '#FFFFFF',
    black: '#000000',
  },
  fonts: {
    heading: 'Helvetica-Bold',
    body: 'Helvetica',
  },
  page: {
    size: 'LETTER',
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
  },
};

let logoBuffer = null;
export function getLogoBuffer() {
  if (logoBuffer) return logoBuffer;
  const logoPath = path.resolve(__dirname, '../../../assets/vo360-logo.png');
  logoBuffer = fs.readFileSync(logoPath);
  return logoBuffer;
}
