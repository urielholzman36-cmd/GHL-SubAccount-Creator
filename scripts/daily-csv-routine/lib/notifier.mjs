// scripts/daily-csv-routine/lib/notifier.mjs
import { spawnSync } from 'child_process';

function escape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Fire a macOS notification via osascript. No-op silently if osascript fails.
 */
export function notify({ title, subtitle, message }) {
  const t = escape(title || 'CSV Routine');
  const s = escape(subtitle || '');
  const m = escape(message || '');
  const script = `display notification "${m}" with title "${t}"${s ? ` subtitle "${s}"` : ''} sound name "Glass"`;
  try {
    spawnSync('osascript', ['-e', script], { stdio: 'ignore' });
  } catch { /* silent */ }
}
