import { v2 as cloudinary } from 'cloudinary';

function slug(s) {
  return String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'client';
}

export function reportPublicId({ clientName, clientId, month }) {
  return `vo360-reports/${slug(clientName)}-${clientId}-${month}`;
}

export function uploadReportPdf(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'raw',
        format: 'pdf',
        overwrite: true,
        use_filename: false,
      },
      (err, result) => err ? reject(err) : resolve({ secure_url: result.secure_url, public_id: result.public_id }),
    );
    stream.end(buffer);
  });
}

export function signedReportDownloadUrl(publicId, filename) {
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'raw',
    type: 'upload',
    attachment: filename,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  });
}

export async function deleteReportPdf(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  } catch { /* best-effort */ }
}
