/**
 * Retry helper for API calls with exponential backoff.
 * Retries on 429 (rate limit) and 529 (overloaded) errors.
 */
export async function withRetry(fn, { maxRetries = 3, baseDelay = 10000, label = 'API call' } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 529 ||
        err.message?.includes('429') || err.message?.includes('529') ||
        err.message?.includes('Overloaded') || err.message?.includes('rate');

      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = baseDelay * attempt;
      console.log(`[retry] ${label} failed (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
