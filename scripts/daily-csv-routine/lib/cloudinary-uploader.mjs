// scripts/daily-csv-routine/lib/cloudinary-uploader.mjs
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';

let configured = false;
function ensureConfig() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('CLOUDINARY_CLOUD_NAME missing');
  configured = true;
}

function uploadOne(filepath, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: true },
      (err, result) => err ? reject(err) : resolve(result.secure_url),
    );
    fs.createReadStream(filepath).pipe(stream);
  });
}

/**
 * Upload many files in parallel batches.
 * @param {Array<{filepath, publicId}>} jobs
 * @param {{batchSize?: number, onProgress?: (done, total) => void}} opts
 * @returns {Promise<Array<{publicId, secure_url, error?}>>}
 */
export async function uploadAll(jobs, { batchSize = 8, onProgress } = {}) {
  ensureConfig();
  const results = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    const slice = jobs.slice(i, i + batchSize);
    const batchRes = await Promise.all(slice.map(async j => {
      try {
        const url = await uploadOne(j.filepath, j.publicId);
        return { publicId: j.publicId, secure_url: url };
      } catch (err) {
        return { publicId: j.publicId, error: err.message };
      }
    }));
    results.push(...batchRes);
    if (onProgress) onProgress(results.length, jobs.length);
  }
  return results;
}
