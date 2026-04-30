'use strict';
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const axios    = require('axios');
const http     = require('http');
const chokidar = require('chokidar');
const fs       = require('fs');
const multer   = require('multer');
const { WebSocketServer } = require('ws');
const { parseProject2 }  = require('./parser');
const { stagePipeline, bottlenecks, orderSummary, vendorItems, blockedItems, kpiSummary } = require('./logic');
const liveTracker = require('./liveTracker');
const app    = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 4. THEN static frontend (YOUR LINE)
const frontendPath = path.join(__dirname, '..', 'frontend', 'src');
const server = http.createServer(app);
// 🔥 GLOBAL ERROR HANDLING (ADD HERE)
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT ERROR:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED PROMISE:', err);
});
let FILE     = path.join(__dirname, 'data', 'project_2.xlsx');
const PORT = process.env.PORT || 3001;
// Live sync polling

let syncTimer = null;

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, 'data');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    // Keep only XLSX/XLS files as project data, store PDFs separately
    if (file.mimetype.includes('pdf')) {
      cb(null, 'pdfs_' + Date.now() + path.extname(file.originalname));
    } else {
      cb(null, 'project_2' + path.extname(file.originalname));
    }
  }
});

const fileFilter = function(req, file, cb) {
  const allowed = ['.xlsx', '.xls', '.csv', '.json', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .xlsx, .xls, .csv, .json, and .pdf files are allowed'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
// Serve uploaded files (Excel, PDFs) from /data
app.use('/data', express.static(path.join(__dirname, 'data')));

let ITEMS = [], ORDERS = [], LAST_LOADED = null, PARSE_ERROR = null;
const clients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function reload() {
  try {
    if (!fs.existsSync(FILE)) {
      console.log('⚠ No Excel file found, using empty data');
      ITEMS = [];
      ORDERS = [];
      return;
    }

    ITEMS  = parseProject2(FILE);
    ORDERS = orderSummary(ITEMS);
    LAST_LOADED = new Date().toISOString();
    PARSE_ERROR = null;

    console.log('Reloaded ' + ITEMS.length + ' items');
  } catch(e) {
    PARSE_ERROR = e.message;
    console.error('Parse failed:', e.message);

    // 🔥 IMPORTANT: prevent crash
    ITEMS = [];
    ORDERS = [];
  }
}
// Live sync polling function
let watcher = null;

function setupWatcher() {
  if (watcher) watcher.close();

  if (!fs.existsSync(FILE)) {
    console.log('[Watcher] File not found');
    return;
  }

  watcher = chokidar.watch(FILE, { ignoreInitial: true });

  watcher.on('change', () => {
    console.log('[Watcher] File changed');
    reload();
    broadcast({ type: 'file-change' });
  });

  console.log('[Watcher] Watching:', FILE);
}
let syncInterval = null;
let isSyncRunning = false;

function startLiveSync() {
  const cfg = liveTracker.getConfig();

  // ❌ Prevent duplicate intervals
  if (syncInterval) {
    console.log('[Live Tracker] Already running — skipping');
    return;
  }

  if (!cfg.autoSync || !cfg.url) return;

  console.log('[Live Tracker] Auto-sync every ' + cfg.interval + ' seconds');

  syncInterval = setInterval(async function() {

    // ❌ Prevent overlapping sync
    if (isSyncRunning) {
      console.log('[Live Tracker] Previous sync still running — skip');
      return;
    }

    isSyncRunning = true;

    console.log('[Live Tracker] Running sync...');

    try {
      const result = await liveTracker.syncNow();

      if (result.ok) {
        FILE = result.filePath;
        setupWatcher();
        reload();

        console.log('[Live Tracker] Sync success');

        broadcast({
          type: 'sync',
          status: 'success',
          ts: result.lastSync,
          count: result.syncCount
        });
      } else {
        console.error('[Live Tracker] Sync failed:', result.error);
      }

    } catch (e) {
      console.error('[Live Tracker] Unexpected error:', e.message);
    }

    isSyncRunning = false;

  }, cfg.interval * 1000);
}
function stopLiveSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Live Tracker] Auto-sync stopped');
  }
}
// Initialize live sync if configured
const initialConfig = liveTracker.getConfig();
if (initialConfig.autoSync && initialConfig.url) {
  startLiveSync();
}

const wss = new WebSocketServer({ server });
wss.on('connection', function(ws) {
  clients.add(ws);
  ws.send(JSON.stringify({ type:'connected', count:ITEMS.length, ts:LAST_LOADED }));
  ws.on('close', function(){ clients.delete(ws); });
  ws.on('error', function(){ clients.delete(ws); });
});

app.get('/api/health', function(_, res) {
  res.json({
    ok: !PARSE_ERROR,
    status: PARSE_ERROR ? 'error' : 'running',
    error: PARSE_ERROR || null,
    items: ITEMS.length,
    orders: ORDERS.length,
    last_loaded: LAST_LOADED,
    uptime: process.uptime()
  });
});
app.get('/api/kpi',    function(_,res){ res.json(kpiSummary(ITEMS,ORDERS)); });
app.get('/api/items',  function(req,res){
  var r=ITEMS.slice();
  if(req.query.op)       r=r.filter(function(i){ return i.current_op===req.query.op; });
  if(req.query.po)       r=r.filter(function(i){ return String(i.order_id)===req.query.po; });
  if(req.query.location) r=r.filter(function(i){ return i.location===req.query.location; });
  if(req.query.blocked)  r=r.filter(function(i){ return i.is_blocked; });
  if(req.query.search){
    var q=req.query.search.toLowerCase();
    r=r.filter(function(i){ return (i.product_name||'').toLowerCase().includes(q)||(i.customer||'').toLowerCase().includes(q)||String(i.po_number||'').toLowerCase().includes(q); });
  }
  res.json(r);
});
app.get('/api/stages',      function(_,res){ res.json(stagePipeline(ITEMS)); });
app.get('/api/bottlenecks', function(_,res){ res.json(bottlenecks(ITEMS)); });
app.get('/api/orders',      function(_,res){ res.json(ORDERS); });
app.get('/api/vendors',     function(_,res){ res.json(vendorItems(ITEMS)); });
app.get('/api/blocked',     function(_,res){ res.json(blockedItems(ITEMS)); });
app.post('/api/refresh',    function(_,res){ reload(); res.json({ ok:true, count:ITEMS.length, ts:LAST_LOADED }); });

// Upload endpoint
app.post('/api/upload', upload.single('file'), function(req, res) {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      error: 'No file uploaded'
    });
  }

  const uploadedPath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    // 🟣 PDF Upload
    if (ext === '.pdf') {
      return res.json({
        ok: true,
        type: 'pdf',
        filename: req.file.filename,
        path: '/data/' + req.file.filename,
        message: 'PDF uploaded successfully',

        // standard fields (keep consistent)
        count: null,
        orders: null
      });
    }

    // 🟢 Data file (Excel / CSV / JSON)
    FILE = uploadedPath;
    setupWatcher();
    reload();

    return res.json({
      ok: true,
      type: 'data', // unified type
      filename: req.file.filename,
      message: 'File uploaded and loaded successfully',

      count: ITEMS.length,
      orders: ORDERS.length
    });

  } catch (e) {
    console.error('Upload error:', e);

    return res.status(500).json({
      ok: false,
      error: e.message || 'Upload processing failed'
    });
  }
});
// List uploaded PDFs
app.get('/api/uploads', function(_,res) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    return res.json({ ok: true, pdfs: [] });
  }

  try {
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('pdfs_'));
    res.json({ ok: true, pdfs: files });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Live Tracker Endpoints
app.post('/api/live-tracker/set-url', (req, res) => {
  const { url, interval } = req.body;

  const result = liveTracker.setLiveUrl(url, interval);

  if (result.ok) {
    stopLiveSync();     // reset old interval
    startLiveSync();    // start with new config
  }

  res.json(result);
});

app.post('/api/live-tracker/start', function(req, res) {

  // ✅ STOP any existing interval first
  stopLiveSync();

  const result = liveTracker.startAutoSync();

  if (result.ok) {
    startLiveSync();   // start fresh only once
  }

  res.json(result);
});
app.post('/api/live-tracker/stop', function(req, res) {
  stopLiveSync();   // ✅ this already clears interval
  const result = liveTracker.stopAutoSync();
  res.json(result);
});

app.post('/api/live-tracker/sync-now', async function(req, res) {
  const result = await liveTracker.syncNow();

  if (result.ok) {
    FILE = result.filePath;
    setupWatcher();
    reload();

    broadcast({
      type: 'sync',
      status: 'success',
      ts: result.lastSync,
      count: result.syncCount
    });
  } else {
    console.error('[Live Tracker] Sync failed:', result.error);
  }

  res.json(result);
});

app.get('/api/live-tracker/status', function(req, res) {
  res.json(liveTracker.getStatus());
});
// ✅ SERVE FRONTEND STATIC FILES
// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Catch-all (NO patterns)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});
server.listen(PORT, function(){
  console.log('\nVelan Dashboard API ready');
  console.log('http://localhost:' + PORT + '/api/health');

  // ✅ SAFE LOAD AFTER SERVER START
  setTimeout(() => {
    try {
      reload();
    } catch (e) {
      console.error('Startup reload failed:', e.message);
    }
  }, 1000);
});
