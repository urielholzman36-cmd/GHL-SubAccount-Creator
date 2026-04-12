/**
 * Cloudinary upload service with Sharp compression.
 * Handles image compression and upload for social media content.
 */

import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

/**
 * Configure the Cloudinary SDK from environment variables.
 */
export function initCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Build the Cloudinary public_id path.
 * @param {string} clientFolder — client name (will be sanitized)
 * @param {number} dayNumber — content day number
 * @param {number} slideNumber — 0 for single image, 1+ for carousel slides
 * @returns {string} public_id path
 */
export function buildPublicId(clientFolder, dayNumber, slideNumber) {
  const sanitized = clientFolder.replace(/[^a-zA-Z0-9]/g, '-');
  const suffix = slideNumber === 0 ? `${dayNumber}` : `${dayNumber}-s${slideNumber}`;
  return `krea-agent/${sanitized}/${suffix}`;
}

/**
 * Compress an image buffer with Sharp and upload to Cloudinary.
 * @param {Buffer} imageBuffer — raw image data
 * @param {string} publicId — Cloudinary public_id
 * @returns {Promise<string>} secure_url of the uploaded image
 */
export async function compressAndUpload(imageBuffer, publicId) {
  const compressed = await sharp(imageBuffer)
    .resize(1080)
    .jpeg({ quality: 80 })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: true },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      },
    );
    stream.end(compressed);
  });
}
