'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG_FILE = path.join(__dirname, 'data', 'live-tracker.json');

let config = {
  url: null,
  interval: 300,
  autoSync: false,
  lastSync: null,
  lastError: null,
  syncCount: 0,
  status: 'idle'
};

// ================= LOAD CONFIG =================
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      config = Object.assign(config, JSON.parse(data));
    }
  } catch (e) {
    console.error('[Live Tracker] Load error:', e.message);
  }
}

// ================= SAVE CONFIG =================
function saveConfig() {
  try {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('[Live Tracker] Save error:', e.message);
  }
}

// ================= FETCH FILE =================
// ================= FETCH FILE =================
async function fetchExcelFromUrl(url) {
  try {
    console.log('[Live Tracker] Fetching:', url);

    // Strip old cache-buster then add fresh one
    const baseUrl = url.replace(/[&?]t=\d+/, '').replace(/[&?]_cb=\d+/, '');
    const freshUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + '_cb=' + Date.now();

    const response = await axios.get(freshUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });

    const buffer = Buffer.from(response.data);

    // Validate: reject HTML responses (login page or error page)
    const preview = buffer.slice(0, 200).toString('utf-8');
    if (preview.trim().startsWith('<!DOCTYPE') || preview.trim().startsWith('<html')) {
      const err = 'Google returned an HTML page. Make sure the sheet is published via File → Share → Publish to web → CSV.';
      console.error('[Live Tracker] HTML response — sheet may not be public');
      config.lastError = err;
      config.status = 'error';
      saveConfig();
      return { ok: false, error: err };
    }

    // Detect file type
    const isCSV = url.includes('output=csv');
    const ext = isCSV ? '.csv' : '.xlsx';

    const fileName = 'live_' + Date.now() + ext;
    const filePath = path.join(__dirname, 'data', fileName);

    fs.writeFileSync(filePath, buffer);
    console.log('[Live Tracker] Saved:', filePath);

    return { ok: true, filePath };

  } catch (e) {
    console.error('[Live Tracker] FULL ERROR:', e.response?.status, e.message);
    config.lastError = e.message;
    config.status = 'error';
    saveConfig();
    return { ok: false, error: 'Fetch failed: ' + e.message };
  }
}
// ================= SET URL =================
function setLiveUrl(url, interval = 300) {
  if (!url) {
    config.url = null;
    config.autoSync = false;
    saveConfig();
    return { ok: true, message: 'URL cleared' };
  }

  try {
    new URL(url);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  config.url = url;
  config.interval = Math.max(60, Math.min(3600, interval));
  config.lastError = null;
  config.status = 'idle';

  saveConfig();

  return {
    ok: true,
    message: 'URL set',
    url,
    interval: config.interval
  };
}

// ================= AUTO SYNC =================
function startAutoSync() {
  if (!config.url) {
    return { ok: false, error: 'No URL configured' };
  }

  config.autoSync = true;
  saveConfig();

  return { ok: true, message: 'Auto-sync ON' };
}

function stopAutoSync() {
  config.autoSync = false;
  saveConfig();

  return { ok: true, message: 'Auto-sync OFF' };
}

// ================= SYNC NOW =================
async function syncNow() {
  if (!config.url) {
    return { ok: false, error: 'No URL configured' };
  }

  if (config.status === 'syncing') {
    return { ok: false, error: 'Already syncing' };
  }

  config.status = 'syncing';
  saveConfig();

  try {
    const result = await fetchExcelFromUrl(config.url);

    if (!result.ok) {
      return result;
    }

    config.lastSync = new Date().toISOString();
    config.syncCount++;
    config.lastError = null;
    config.status = 'idle';

    saveConfig();

    return {
      ok: true,
      message: 'Sync successful',
      filePath: result.filePath,
      syncCount: config.syncCount,
      lastSync: config.lastSync
    };

  } catch (e) {
    config.lastError = e.message;
    config.status = 'error';
    saveConfig();

    return {
      ok: false,
      error: e.message
    };
  }
}

// ================= STATUS =================
function getStatus() {
  return {
    url: config.url,
    interval: config.interval,
    autoSync: config.autoSync,
    lastSync: config.lastSync,
    lastError: config.lastError,
    syncCount: config.syncCount,
    status: config.status
  };
}

// ================= INIT =================
loadConfig();

// ================= EXPORT =================
module.exports = {
  setLiveUrl,
  startAutoSync,
  stopAutoSync,
  syncNow,
  getStatus,
  getConfig: () => config,
  setConfig: (newConfig) => {
    config = Object.assign(config, newConfig);
    saveConfig();
  }
};