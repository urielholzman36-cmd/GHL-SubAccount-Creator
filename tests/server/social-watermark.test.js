import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyWatermark } from '../../server/services/social-watermark.js';

/** Create a solid-colour RGBA test image. */
async function makeImage(width, height, color = { r: 100, g: 150, b: 200, alpha: 1 }) {
  return sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
}

/** Create a small logo image. */
async function makeLogo(size = 200) {
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe('applyWatermark', () => {
  it('returns a valid PNG buffer', async () => {
    const imageBuffer = await makeImage(1080, 1080);
    const logoBuffer = await makeLogo();

    const result = await applyWatermark({
      imageBuffer, logoBuffer, position: 'bottom-right', opacity: 0.5, imageWidth: 1080, imageHeight: 1080,
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
  });

  it('preserves original dimensions (1080x1080)', async () => {
    const imageBuffer = await makeImage(1080, 1080);
    const logoBuffer = await makeLogo();

    const result = await applyWatermark({
      imageBuffer, logoBuffer, position: 'bottom-right', opacity: 0.5, imageWidth: 1080, imageHeight: 1080,
    });

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it('works for all 4 positions', async () => {
    const imageBuffer = await makeImage(1080, 1080);
    const logoBuffer = await makeLogo();
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    for (const position of positions) {
      const result = await applyWatermark({
        imageBuffer, logoBuffer, position, opacity: 0.5, imageWidth: 1080, imageHeight: 1080,
      });
      const meta = await sharp(result).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1080);
    }
  });

  it('works with different opacity values', async () => {
    const imageBuffer = await makeImage(1080, 1080);
    const logoBuffer = await makeLogo();
    const opacities = [0.3, 0.5, 0.7, 1.0];

    for (const opacity of opacities) {
      const result = await applyWatermark({
        imageBuffer, logoBuffer, position: 'bottom-right', opacity, imageWidth: 1080, imageHeight: 1080,
      });
      const meta = await sharp(result).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1080);
    }
  });
});
