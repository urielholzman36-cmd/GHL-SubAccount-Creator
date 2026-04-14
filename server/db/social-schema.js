/**
 * Social Planner tables — clients, campaigns, campaign_posts.
 * Called from initializeDb() after the core onboarding tables exist.
 */
export async function initializeSocialTables(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      industry TEXT,
      location TEXT,
      website TEXT,
      logo_path TEXT,
      cloudinary_folder TEXT,
      platforms TEXT DEFAULT '["facebook","instagram"]',
      posting_time TEXT DEFAULT '09:00:00',
      brand_tone TEXT,
      brand_description TEXT,
      target_audience TEXT,
      services TEXT,
      content_pillars TEXT DEFAULT '["PAIN","SOLUTION","AUTHORITY","PROOF","CTA"]',
      hashtag_bank TEXT,
      cta_style TEXT,
      uses_manus INTEGER DEFAULT 0,
      watermark_position TEXT DEFAULT 'bottom-right',
      watermark_opacity REAL DEFAULT 0.7,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      month TEXT,
      theme TEXT,
      start_date TEXT,
      status TEXT DEFAULT 'draft',
      research_brief TEXT,
      manus_research TEXT,
      strategy_pack TEXT,
      prompts_csv_path TEXT,
      images_folder TEXT,
      csv_path TEXT,
      current_step INTEGER DEFAULT 1,
      post_count INTEGER DEFAULT 30,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      day_number INTEGER,
      post_date TEXT,
      pillar TEXT,
      post_type TEXT DEFAULT 'single',
      concept TEXT,
      caption TEXT,
      hashtags TEXT,
      cta TEXT,
      visual_prompt TEXT,
      image_urls TEXT DEFAULT '[]',
      slide_count INTEGER DEFAULT 1,
      category TEXT DEFAULT 'Product Showcase',
      edited INTEGER DEFAULT 0
    );
  `);
}
