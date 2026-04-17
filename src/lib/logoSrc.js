// Resolves a client's logo_path to a browser-usable URL.
// Cloudinary URLs (https://...) are returned as-is; legacy local paths
// (e.g. "data/logos/foo.jpg") get a leading slash so Express static serves them.
export default function logoSrc(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/${path}`;
}
