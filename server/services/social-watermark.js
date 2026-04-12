/**
 * Watermark service — ported from krea-agent postprocess.ts.
 * Composites a logo watermark onto an image using Sharp.
 */
import sharp from 'sharp';

/**
 * Apply a semi-transparent logo watermark to an image.
 * @param {Object} opts
 * @param {Buffer} opts.imageBuffer  - source image
 * @param {Buffer} opts.logoBuffer   - logo / watermark image
 * @param {'bottom-right'|'bottom-left'|'top-right'|'top-left'} opts.position
 * @param {number} opts.opacity      - 0–1
 * @param {number} opts.imageWidth
 * @param {number} opts.imageHeight
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function applyWatermark({ imageBuffer, logoBuffer, position, opacity, imageWidth, imageHeight }) {
  const logoWidth = Math.round(imageWidth * 0.15);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoWidth)
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });

  const logoWithOpacity = await sharp(resizedLogo.data)
    .ensureAlpha()
    .composite([{
      input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    }])
    .png()
    .toBuffer({ resolveWithObject: true });

  const logoHeight = logoWithOpacity.info.height;
  const padding = 20;

  let left, top;
  switch (position) {
    case 'top-left':
      left = padding;
      top = padding;
      break;
    case 'top-right':
      left = imageWidth - logoWidth - padding;
      top = padding;
      break;
    case 'bottom-left':
      left = padding;
      top = imageHeight - logoHeight - padding;
      break;
    case 'bottom-right':
    default:
      left = imageWidth - logoWidth - padding;
      top = imageHeight - logoHeight - padding;
      break;
  }

  return sharp(imageBuffer)
    .resize(imageWidth, imageHeight)
    .composite([{ input: logoWithOpacity.data, left, top }])
    .png()
    .toBuffer();
}
