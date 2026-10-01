'use strict';

const https   = require('https');
const http    = require('http');
const { URL } = require('url');
const config  = require('./config');

async function request(method, endpoint, body = null, opts = {}) {
  const apiKey  = config.getApiKey();
  const baseUrl = config.getBaseUrl();

  if (!apiKey && !opts.noAuth) {
    throw new Error('Not authenticated. Run: joytree login');
  }

  const url    = new URL(`${baseUrl}${endpoint}`);
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `joytree-cli/${require('../package.json').version}`,
        // Send API key as Bearer token — this is what requireAuth on the server reads
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(opts.headers || {}),
      },
    };

    const req = mod.request(reqOpts, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode === 204) return resolve({ ok: true });
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) {
            const msg = data.error || data.message || (Array.isArray(data.errors) && data.errors.length ? data.errors.join('; ') : `HTTP ${res.statusCode}`);
            // Keep the status and full body so callers can show details such as
            // a list of validation errors, not just the one-line message.
            const err = new Error(msg);
            err.status = res.statusCode;
            err.data = data;
            reject(err);
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error(`Non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const api = {
  get:    (path, opts)       => request('GET',    path, null, opts),
  post:   (path, body, opts) => request('POST',   path, body, opts),
  put:    (path, body, opts) => request('PUT',    path, body, opts),
  patch:  (path, body, opts) => request('PATCH',  path, body, opts),
  delete: (path, opts)       => request('DELETE', path, null, opts),
  postMultipart: (path, fields, fileBuffer, fileName, opts) => requestMultipart(path, fields, fileBuffer, fileName, opts),
};

// [FIX] There was no way to actually send a file to a multipart/form-data
// endpoint at all -- misc.js's uploadDeploy() was calling api.post() (plain
// JSON) against /api/upload-project, which rejects anything that isn't
// multipart/form-data on its very first line. Every `joytree deploy-upload`
// was failing immediately with "multipart/form-data required" regardless
// of the file being sent. This builds a real multipart body by hand (no
// extra dependency needed -- just Buffer concatenation with a boundary),
// matching exactly what the server's own parseMultipart() expects: each
// text field as its own part, and the file part carrying a filename= in
// its Content-Disposition header (parseMultipart identifies the file part
// by that, not by a specific field name).
async function requestMultipart(endpoint, fields, fileBuffer, fileName, opts = {}) {
  const apiKey  = config.getApiKey();
  const baseUrl = config.getBaseUrl();
  if (!apiKey && !opts.noAuth) {
    throw new Error('Not authenticated. Run: joytree login');
  }

  const boundary = '----joytreeCliBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null) continue;
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const payload = Buffer.concat(parts);

  const url = new URL(`${baseUrl}${endpoint}`);
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        'User-Agent': `joytree-cli/${require('../package.json').version}`,
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(data.error || data.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error(`Non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Validate API key via /api/v1/account
// [FIX] Was /api/v1/transfer -- that endpoint doesn't exist (and never
// did; the only /transfer route on the whole server is /api/domains/transfer,
// an unrelated domain-name-transfer feature). Every `joytree login` was
// hitting a 404 here. /api/v1/account is the correct "confirm this key
// works and tell me who I am" endpoint -- same one joytree_whoami calls
// on the MCP server side.
async function validateApiKey(apiKey, baseUrl) {
  const url = new URL(`${baseUrl}/api/v1/account`);
  const mod = url.protocol === 'https:' ? require('https') : require('http');

  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': `joytree-cli/${require('../package.json').version}`,
      },
    };

    const req = mod.request(reqOpts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(data.error || `HTTP ${res.statusCode}`));
          else resolve(data);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { api, validateApiKey };
