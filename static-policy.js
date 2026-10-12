'use strict';
const fs = require('fs');
const path = require('path');
const pages = new Set(['index.html', 'index2.html', 'staff.html', 'session.html', 'session-admin.html', 'session-constructor.html', 'session-prep.html', 'smart.html', 'builder.html', 'course-live.html']);
const data = new Set(['data/demo-schedule.json', 'data/session-2025-26.json', 'data/links.json']);
function publicFile(root, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'; } catch (_) { return null; }
  if (relative.includes('\\') || relative.includes(':') || relative.split('/').some(part => part.startsWith('.'))) return null;
  const allowed = pages.has(relative) || relative === 'sw.js' || data.has(relative) ||
    /^(js\/|css\/|legacy\/external-widget\/|legacy\/pages\/|docs\/print\/).+\.(js|mjs|css|html|woff2|png|jpg|svg|ico)$/.test(relative);
  if (!allowed) return null;
  const absolute = path.resolve(root, relative);
  const base = path.resolve(root);
  if (!absolute.startsWith(base + path.sep)) return null;
  // Do not expose files through symlinks/junctions inside an allowed asset directory.
  try { if (!fs.realpathSync(absolute).startsWith(fs.realpathSync(base) + path.sep)) return null; } catch (_) { return null; }
  return absolute;
}
module.exports = { publicFile };
