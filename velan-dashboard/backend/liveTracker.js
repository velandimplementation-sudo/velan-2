'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');

const CONFIG_FILE = path.join(__dirname, 'data', 'live-tracker.json');

let config = {
  url: null,
  interval: 300,      // seconds (default 5 min)
  autoSync: false,
  lastSync: null,
  lastError: null,
  syncCount: 0,
  status: 'idle'      // idle, syncing, error
};

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      config = Object.assign(config, JSON.parse(data));
    }
  } catch(e) {
    console.error('[Live Tracker] Error loading config:', e.message);
  }
}

// Save config to file
function saveConfig() {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch(e) {
    console.error('[Live Tracker] Error saving config:', e.message);
  }
}

// Fetch Excel from URL
async function fetchExcelFromUrl(url) {
  try {
    console.log('[Live Tracker] Fetching from URL:', url);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const buffer = Buffer.from(response.data, 'binary');
    const fileName = 'live_' + Date.now() + '.xlsx';
    const filePath = path.join(__dirname, 'data', fileName);
    
    fs.writeFileSync(filePath, buffer);
    console.log('[Live Tracker] Downloaded to:', filePath);
    
    return filePath;
  } catch(e) {
  console.error('[Live Tracker] Fetch failed:', e.message);

  config.lastError = e.message;
  config.status = 'error';
  saveConfig();

  return {
    ok: false,
    error: 'Failed to fetch URL: ' + e.message
  };
}
}

// Set live URL
function setLiveUrl(url, interval = 300) {
  if (!url) {
    config.url = null;
    config.autoSync = false;
    saveConfig();
    return { ok: true, message: 'Live URL cleared' };
  }

  // Validate URL
  try {
    new URL(url);
  } catch(e) {
    return { ok: false, error: 'Invalid URL' };
  }

  config.url = url;
  config.interval = Math.max(60, Math.min(3600, interval)); // Clamp 60-3600
  config.lastError = null;
  config.status = 'idle';
  saveConfig();

  return { 
    ok: true, 
    message: 'Live URL configured',
    url: config.url,
    interval: config.interval
  };
}

// Start auto-sync
function startAutoSync() {
  if (!config.url) {
    return { ok: false, error: 'No live URL configured' };
  }
  config.autoSync = true;
  saveConfig();
  return { ok: true, message: 'Auto-sync started', interval: config.interval };
}

// Stop auto-sync
function stopAutoSync() {
  config.autoSync = false;
  saveConfig();
  return { ok: true, message: 'Auto-sync stopped' };
}

// Manual sync trigger
async function syncNow() {
  if (!config.url) {
    return { ok: false, error: 'No live URL configured' };
  }

  if (config.status === 'syncing') {
    return { ok: false, error: 'Sync already in progress' };
  }

  config.status = 'syncing';
  saveConfig();
  
  try {
    const result = await fetchExcelFromUrl(config.url);

if (!result || result.ok === false) {
  return {
    ok: false,
    error: result ? result.error : 'Unknown fetch error'
  };
}

const filePath = result;
    config.lastSync = new Date().toISOString();
    config.syncCount++;
    config.lastError = null;
    config.status = 'idle';
    saveConfig();

    return {
      ok: true,
      message: 'Sync successful',
      filePath: filePath,
      syncCount: config.syncCount,
      lastSync: config.lastSync
    };
  } catch(e) {
    config.lastError = e.message;
    config.status = 'error';
    saveConfig();

    return {
      ok: false,
      error: e.message,
      lastError: config.lastError
    };
  }
}

// Get config status
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

// Initialize
loadConfig();

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
