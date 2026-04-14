import { Router } from 'express';

export function createSettingsRouter() {
  const router = Router();

  router.get('/status', (req, res) => {
    res.json({
      ghl: !!process.env.GHL_AGENCY_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    });
  });

  return router;
}
