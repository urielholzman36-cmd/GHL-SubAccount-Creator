/**
 * Social Runner — 7-step pipeline orchestrator for social media campaigns.
 * Mirrors the build-runner.js pattern but for the social planner pipeline.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getCampaign,
  getClient,
  updateCampaignStatus,
  updateCampaignField,
  listCampaignPosts,
  bulkCreateCampaignPosts,
  updateCampaignPost,
} from '../db/social-queries.js';
import { runWebResearch, mergeResearch } from './social-research.js';
import { generateStrategyPack } from './social-strategy.js';
import { writePromptsCsv, runKreaGeneration, getImagePaths } from './social-images.js';
import { applyWatermark } from './social-watermark.js';
import { initCloudinary, compressAndUpload, buildPublicId } from './social-cloudinary.js';
import { buildGhlCsv } from './social-csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

// ── Step definitions ────────────────────────────────────────────────

export const SOCIAL_STEPS = [
  { number: 1, name: 'Monthly Brief', phase: 'Setup', manual: false },
  { number: 2, name: 'Research', phase: 'Strategy', manual: false },
  { number: 3, name: 'Strategy Pack', phase: 'Strategy', manual: false },
  { number: 4, name: 'Review Strategy', phase: 'Strategy', manual: true },
  { number: 5, name: 'Generate Images', phase: 'Content', manual: false },
  { number: 6, name: 'Watermark + Upload', phase: 'Content', manual: false },
  { number: 7, name: 'Review Final + Export CSV', phase: 'Content', manual: true },
];

// ── Status map ──────────────────────────────────────────────────────

const STATUS_MAP = {
  1: 'draft',
  2: 'researching',
  3: 'generating_strategy',
  4: 'review_strategy',
  5: 'generating_images',
  6: 'watermarking',
  7: 'review_final',
};

// ── PauseSignal ─────────────────────────────────────────────────────

export class PauseSignal {
  constructor(step, context) {
    this.step = step;
    this.context = context;
    this.isPauseSignal = true;
  }
}

// ── SocialRunner ────────────────────────────────────────────────────

export class SocialRunner {
  constructor(db, emit) {
    this.db = db;
    this.emit = emit;
  }

  /**
   * Run the pipeline from a given step forward.
   * Pauses at manual steps, otherwise executes each step.
   */
  async runFromStep(campaignId, fromStep) {
    for (let stepNum = fromStep; stepNum <= 7; stepNum++) {
      const stepDef = SOCIAL_STEPS[stepNum - 1];

      if (stepDef.manual) {
        // Update status and pause
        const status = STATUS_MAP[stepNum];
        updateCampaignStatus(this.db, campaignId, status, stepNum);
        this.emit({ type: 'campaign-paused', step: stepNum, status });
        return;
      }

      await this.executeStep(campaignId, stepNum);
    }

    // All steps completed
    updateCampaignStatus(this.db, campaignId, 'exported', 7);
  }

  /**
   * Resume a paused campaign.
   * If paused at step 4 (review strategy), continue from step 5.
   * If paused at step 7 (review final), export CSV and mark exported.
   */
  async resume(campaignId, payload) {
    const campaign = getCampaign(this.db, campaignId);
    const currentStep = campaign.current_step;

    if (currentStep === 4) {
      // Continue from step 5
      await this.runFromStep(campaignId, 5);
    } else if (currentStep === 7) {
      // Export CSV and mark done
      await this._step7ExportCsv(campaignId);
      updateCampaignStatus(this.db, campaignId, 'exported', 7);
    }
  }

  /**
   * Retry the pipeline from a given step.
   */
  async retryFromStep(campaignId, fromStep) {
    await this.runFromStep(campaignId, fromStep);
  }

  /**
   * Execute a single step: emit running, run logic, emit completed/failed.
   */
  async executeStep(campaignId, stepNum) {
    const status = STATUS_MAP[stepNum];

    this.emit({ type: 'step-update', step: stepNum, status: 'running' });
    updateCampaignStatus(this.db, campaignId, status, stepNum);

    try {
      await this._runStepLogic(campaignId, stepNum);
      this.emit({ type: 'step-update', step: stepNum, status: 'completed' });
    } catch (err) {
      this.emit({ type: 'step-update', step: stepNum, status: 'failed', error: err.message });
      throw err;
    }
  }

  // ── Step dispatch ───────────────────────────────────────────────

  async _runStepLogic(campaignId, stepNum) {
    switch (stepNum) {
      case 1: return this._step1ValidateBrief(campaignId);
      case 2: return this._step2Research(campaignId);
      case 3: return this._step3GenerateStrategy(campaignId);
      case 5: return this._step5GenerateImages(campaignId);
      case 6: return this._step6WatermarkUpload(campaignId);
      case 7: return this._step7ExportCsv(campaignId);
      default: throw new Error(`Unknown step: ${stepNum}`);
    }
  }

  // ── Step 1: Validate brief ────────────────────────────────────

  async _step1ValidateBrief(campaignId) {
    const campaign = getCampaign(this.db, campaignId);
    if (!campaign.month) throw new Error('Campaign is missing month');
    if (!campaign.start_date) throw new Error('Campaign is missing start_date');
  }

  // ── Step 2: Research ──────────────────────────────────────────

  async _step2Research(campaignId) {
    const campaign = getCampaign(this.db, campaignId);
    const client = getClient(this.db, campaign.client_id);

    const webResearch = await runWebResearch(client, campaign.month, campaign.theme);
    const merged = mergeResearch(webResearch, campaign.manus_research);
    updateCampaignField(this.db, campaignId, 'research_brief', merged);

    // If client uses Manus and no manus_research yet, emit a pause event
    if (client.uses_manus && !campaign.manus_research) {
      this.emit({ type: 'manus-pause', campaignId });
    }
  }

  // ── Step 3: Generate strategy pack ────────────────────────────

  async _step3GenerateStrategy(campaignId) {
    const campaign = getCampaign(this.db, campaignId);
    const client = getClient(this.db, campaign.client_id);

    const postCount = campaign.post_count || 30;
    const pack = await generateStrategyPack(
      client, campaign.month, campaign.theme, campaign.research_brief,
      { apiKey: process.env.ANTHROPIC_API_KEY, postCount },
    );

    updateCampaignField(this.db, campaignId, 'strategy_pack', JSON.stringify(pack));

    // Create campaign_posts rows from the strategy pack
    const posts = pack.map((post, idx) => {
      // Normalize day to a number (Haiku sometimes returns date strings)
      const dayNum = typeof post.day === 'number' ? post.day : idx + 1;

      // Calculate post_date from start_date + day offset
      const startDate = new Date(campaign.start_date);
      const postDate = new Date(startDate);
      postDate.setDate(startDate.getDate() + (dayNum - 1));
      const postDateStr = postDate.toISOString().split('T')[0];

      // Normalize post_type (Haiku returns "single_image" instead of "single")
      let postType = (post.post_type || 'single').toLowerCase();
      if (postType.includes('single') || postType === 'image') postType = 'single';
      if (postType.includes('carousel')) postType = 'carousel';
      if (postType.includes('before') || postType.includes('after')) postType = 'before_after';

      return {
        campaign_id: campaignId,
        day_number: dayNum,
        post_date: postDateStr,
        pillar: post.pillar,
        post_type: postType,
        concept: post.concept,
        caption: post.caption,
        hashtags: post.hashtags,
        cta: post.cta,
        visual_prompt: post.visual_prompt,
        slide_count: post.slide_count || 1,
        category: post.category || 'Product Showcase',
      };
    });

    bulkCreateCampaignPosts(this.db, posts);
  }

  // ── Step 5: Generate images ───────────────────────────────────

  async _step5GenerateImages(campaignId) {
    const campaign = getCampaign(this.db, campaignId);
    const client = getClient(this.db, campaign.client_id);
    const posts = listCampaignPosts(this.db, campaignId);

    const campaignDir = path.join(DATA_DIR, 'social', `campaign-${campaignId}`);
    fs.mkdirSync(campaignDir, { recursive: true });

    const csvPath = path.join(campaignDir, 'prompts.csv');
    writePromptsCsv(csvPath, posts);
    updateCampaignField(this.db, campaignId, 'prompts_csv_path', csvPath);

    if (process.env.DRY_RUN === 'true') {
      // Create placeholder folders with minimal files
      for (const post of posts) {
        const typeName = post.post_type === 'carousel' ? 'Carousel'
          : post.post_type === 'before_after' ? 'Before_After'
          : 'Single';
        const folderName = `Post_${post.day_number}_${typeName}`;
        const folderPath = path.join(campaignDir, folderName);
        fs.mkdirSync(folderPath, { recursive: true });

        const slideCount = post.slide_count || 1;
        for (let s = 1; s <= slideCount; s++) {
          fs.writeFileSync(path.join(folderPath, `slide_${s}.png`), Buffer.from('fake-png'));
        }
      }

      updateCampaignField(this.db, campaignId, 'images_folder', campaignDir);
      return;
    }

    // Live mode: spawn Krea
    await new Promise((resolve, reject) => {
      runKreaGeneration(client.name, csvPath, campaignDir, {
        onComplete: (contentDir) => {
          updateCampaignField(this.db, campaignId, 'images_folder', contentDir);
          resolve();
        },
        onError: reject,
      });
    });
  }

  // ── Step 6: Watermark + Upload ────────────────────────────────

  async _step6WatermarkUpload(campaignId) {
    const campaign = getCampaign(this.db, campaignId);
    const client = getClient(this.db, campaign.client_id);
    const posts = listCampaignPosts(this.db, campaignId);
    const imagesFolder = campaign.images_folder;

    if (!imagesFolder) throw new Error('No images_folder set on campaign');

    const imagePaths = getImagePaths(imagesFolder);

    if (process.env.DRY_RUN === 'true') {
      // Assign fake URLs
      for (const post of posts) {
        const files = imagePaths[post.day_number] || [];
        const fakeUrls = files.map((_, i) =>
          `https://fake-cloudinary.com/${client.name}/day${post.day_number}-s${i}.jpg`,
        );
        updateCampaignPost(this.db, post.id, {
          image_urls: JSON.stringify(fakeUrls),
        });
      }
      return;
    }

    // Live mode: watermark + upload to Cloudinary
    initCloudinary();

    let logoBuffer = null;
    if (client.logo_path) {
      const projectRoot = path.resolve(__dirname, '..', '..');
      logoBuffer = fs.readFileSync(path.resolve(projectRoot, client.logo_path));
    }

    for (const post of posts) {
      const files = imagePaths[post.day_number] || [];
      const urls = [];

      for (let i = 0; i < files.length; i++) {
        let imageBuffer = fs.readFileSync(files[i]);

        if (logoBuffer) {
          const sharp = (await import('sharp')).default;
          const meta = await sharp(imageBuffer).metadata();
          imageBuffer = await applyWatermark({
            imageBuffer,
            logoBuffer,
            position: client.watermark_position || 'bottom-right',
            opacity: client.watermark_opacity || 0.7,
            imageWidth: meta.width,
            imageHeight: meta.height,
          });
        }

        const publicId = buildPublicId(
          client.cloudinary_folder || client.name,
          post.day_number,
          files.length === 1 ? 0 : i + 1,
        );
        const url = await compressAndUpload(imageBuffer, publicId);
        urls.push(url);
      }

      updateCampaignPost(this.db, post.id, {
        image_urls: JSON.stringify(urls),
      });
    }
  }

  // ── Step 7: Export CSV ────────────────────────────────────────

  async _step7ExportCsv(campaignId) {
    const campaign = getCampaign(this.db, campaignId);
    const client = getClient(this.db, campaign.client_id);
    const posts = listCampaignPosts(this.db, campaignId);

    let platforms;
    try {
      platforms = JSON.parse(client.platforms);
    } catch {
      platforms = ['facebook', 'instagram'];
    }

    const csv = buildGhlCsv(posts, client.posting_time || '09:00:00', platforms);

    const campaignDir = path.join(DATA_DIR, 'social', `campaign-${campaignId}`);
    fs.mkdirSync(campaignDir, { recursive: true });
    const csvPath = path.join(campaignDir, 'ghl-export.csv');
    fs.writeFileSync(csvPath, csv, 'utf-8');

    updateCampaignField(this.db, campaignId, 'csv_path', csvPath);
  }
}
