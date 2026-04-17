// Deterministic mock puller — seeds a PRNG from locationId so each client gets
// stable, varied fake data without static fixture files. Varies shape by niche.

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

// Per-niche profile controls how "healthy" a mock location looks.
const NICHE_PROFILES = {
  plumbing:     { leads: [8, 22],  ops: [2, 8], convos: [4, 10], respMin: [30, 240],  appts: [3, 12], reviews: [2, 8] },
  electrical:   { leads: [6, 18],  ops: [1, 6], convos: [3, 8],  respMin: [30, 240],  appts: [2, 10], reviews: [2, 7] },
  cleaning:     { leads: [15, 35], ops: [4, 10], convos: [8, 16], respMin: [15, 120], appts: [8, 18], reviews: [4, 12] },
  hvac:         { leads: [5, 14],  ops: [1, 5], convos: [2, 7],  respMin: [30, 300],  appts: [1, 8],  reviews: [1, 6] },
  construction: { leads: [3, 11],  ops: [0, 4], convos: [1, 5],  respMin: [60, 480],  appts: [1, 6],  reviews: [0, 5] },
  landscaping:  { leads: [10, 26], ops: [2, 8], convos: [5, 12], respMin: [30, 240],  appts: [5, 14], reviews: [2, 8] },
  roofing:      { leads: [5, 14],  ops: [1, 5], convos: [2, 8],  respMin: [60, 360],  appts: [2, 8],  reviews: [1, 6] },
  default:      { leads: [5, 20],  ops: [1, 7], convos: [3, 10], respMin: [30, 240],  appts: [2, 12], reviews: [1, 8] },
};

function pickRange(rand, [lo, hi]) {
  return Math.floor(lo + rand() * (hi - lo + 1));
}

export async function mockPullAll(locationId, dateRange, opts = {}) {
  const niche = (opts.niche || '').toLowerCase();
  const profile = NICHE_PROFILES[niche] || NICHE_PROFILES.default;
  const rand = mulberry32(hashSeed(locationId || 'unseeded'));

  // Occasionally simulate a struggling client (~20%)
  const struggling = rand() < 0.2;

  const leadCount = struggling ? Math.max(0, pickRange(rand, [0, 4]))
                                : pickRange(rand, profile.leads);
  const contacts = Array.from({ length: leadCount }, (_, i) => ({
    id: `contact_${locationId}_${i}`,
    dateAdded: daysAgoIso(Math.floor(rand() * 30)),
    tags: [],
  }));

  const opCount = struggling ? pickRange(rand, [0, 2]) : pickRange(rand, profile.ops);
  const opportunities = Array.from({ length: opCount }, (_, i) => ({
    id: `opp_${locationId}_${i}`,
    pipelineId: 'pipe_default',
    stageId: `stage_${(i % 4) + 1}`,
    stageChangedAt: daysAgoIso(Math.floor(rand() * 30)),
    status: 'open',
    monetaryValue: 500 + Math.floor(rand() * 4500),
    dateAdded: daysAgoIso(Math.floor(rand() * 60) + 5),
  }));

  const convoCount = struggling ? pickRange(rand, [0, 2]) : pickRange(rand, profile.convos);
  const staleConvo = struggling;
  const conversations = Array.from({ length: convoCount }, (_, i) => {
    const base = staleConvo ? 14 + Math.floor(rand() * 20) : Math.floor(rand() * 10);
    return {
      id: `conv_${locationId}_${i}`,
      contactId: contacts[i % Math.max(contacts.length, 1)]?.id ?? `c_${i}`,
      lastInboundAt: daysAgoIso(base + Math.floor(rand() * 3)),
      lastOutboundAt: daysAgoIso(base),
      avgResponseMinutes: pickRange(rand, profile.respMin),
    };
  });

  const apptCount = struggling ? pickRange(rand, [0, 2]) : pickRange(rand, profile.appts);
  const appointments = Array.from({ length: apptCount }, (_, i) => ({
    id: `appt_${locationId}_${i}`,
    startTime: daysAgoIso(Math.floor(rand() * 30)),
    status: 'booked',
    contactId: contacts[i % Math.max(contacts.length, 1)]?.id ?? `c_${i}`,
  }));

  const reviewRequestsSent = struggling ? pickRange(rand, [0, 2]) : pickRange(rand, profile.reviews);

  return {
    contacts,
    opportunities,
    conversations,
    appointments,
    reviewRequestsSent,
    metadata: {
      locationId,
      pulledAt: new Date().toISOString(),
      dateRange,
    },
  };
}
