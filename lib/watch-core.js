'use strict';
// Pure helpers behind `joytree watch` (no network, no timers) so they are easy to test.
// The browser "Watch Folder" on the dashboard follows the same naming rules.

const ARCHIVE_RE = /\.(zip|tar\.gz|tgz)$/i;
const HTML_RE    = /\.html?$/i;
// Partial / in-progress downloads and editor temp files: Chrome, Firefox, Edge, Safari, Office, vim...
const TEMP_RE    = /(\.crdownload|\.part|\.partial|\.download|\.opdownload|\.tmp|\.temp|\.swp|\.swx)$|~$/i;

function isTempName(name) {
  return name.startsWith('.') || name.startsWith('~$') || TEMP_RE.test(name);
}
function isArchive(name) { return ARCHIVE_RE.test(name); }
function isHtml(name)    { return HTML_RE.test(name); }
function isDeployableName(name) {
  return !isTempName(name) && (isArchive(name) || isHtml(name));
}

// "My Site (2).zip" -> "my-site"   (browsers add " (n)" when the name already exists)
function slugFromFilename(name) {
  let s = String(name || '').replace(/\.(zip|tar\.gz|tgz|html?)$/i, '');
  s = s.replace(/\s*\(\d+\)\s*$/, '').replace(/\s*-\s*copy(\s*\(\d+\))?\s*$/i, '');
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return s;
}

function fingerprint(f) { return `${f.size}:${Math.floor(f.mtimeMs)}`; }

// Decides when a file in the watched folder is ready to deploy: it must have kept the same
// size + modified time for `stableMs` (so a download that is still being written is never
// picked up half-finished) and differ from what was last handled.
class Tracker {
  constructor({ stableMs = 3000 } = {}) {
    this.stableMs = stableMs;
    this.files = new Map();   // name -> { fp, since }
    this.done  = new Map();   // name -> fingerprint already handled
  }
  baseline(list) { for (const f of list) this.done.set(f.name, fingerprint(f)); }
  loadDone(obj) { for (const k of Object.keys(obj || {})) this.done.set(k, obj[k]); }
  doneObject()  { return Object.fromEntries(this.done); }
  markDone(name, fp) { this.done.set(name, fp); }
  // list: [{ name, size, mtimeMs }]. Returns { ready: [...], pending: n }
  update(list, now) {
    const ready = [];
    let pending = 0;
    const seen = new Set();
    for (const f of list) {
      if (!isDeployableName(f.name)) continue;
      seen.add(f.name);
      const fp = fingerprint(f);
      if (this.done.get(f.name) === fp) continue;
      const st = this.files.get(f.name);
      if (!st || st.fp !== fp) { this.files.set(f.name, { fp, since: now }); pending++; continue; }
      if (f.size > 0 && now - st.since >= this.stableMs) ready.push({ ...f, fp });
      else pending++;
    }
    for (const k of Array.from(this.files.keys())) if (!seen.has(k)) this.files.delete(k);
    return { ready, pending };
  }
}

module.exports = { isTempName, isArchive, isHtml, isDeployableName, slugFromFilename, fingerprint, Tracker };
