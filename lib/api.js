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
            const msg = data.error || data.message || `HTTP ${res.statusCode}`;
            reject(new Error(msg));
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
};

// Validate API key via /api/v1/transfer
async function validateApiKey(apiKey, baseUrl) {
  const url = new URL(`${baseUrl}/api/v1/transfer`);
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
