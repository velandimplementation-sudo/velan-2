const { useState, useRef, useEffect } = React;

function Upload({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [liveUrl, setLiveUrl] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(300);
  const [autoSync, setAutoSync] = useState(false);
  const [lastSync, setLastSync] = useState('--');
  const [uploads, setUploads] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchTrackerStatus();
    fetchUploads();
  }, []);

  const fetchTrackerStatus = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/live-tracker/status');
      const data = await res.json();
      if (data.url) setLiveUrl(data.url);
      if (data.interval) setRefreshInterval(data.interval);
      setAutoSync(Boolean(data.autoSync));
      setLastSync(data.lastSync ? new Date(data.lastSync).toLocaleString() : '--');
    } catch (err) {
      console.error('Tracker status error', err);
    }
  };

  const fetchUploads = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/uploads');
      const data = await res.json();
      if (data.ok) {
        setUploads(data.pdfs || []);
      }
    } catch (err) {
      console.error('Uploads fetch error', err);
    }
  };

  const setAlert = (text, type) => {
    setMessage(text);
    setMessageType(type);
    window.setTimeout(() => setMessage(''), 5000);
  };

  const uploadFile = async (file) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.json', '.pdf'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setAlert('❌ Only .xlsx, .xls, .csv, .json and .pdf files are allowed', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setAlert('❌ File must be smaller than 50MB', 'error');
      return;
    }

    setUploading(true);
    setMessage('Uploading file...');
    setMessageType('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.ok) {
        setAlert('❌ Upload failed: ' + (data.error || 'Unknown error'), 'error');
        return;
      }

      if (data.type === 'pdf') {
        setAlert('✅ PDF uploaded: ' + data.filename, 'success');
      } else {
        setAlert('✅ File loaded: ' + data.filename, 'success');
        if (typeof onUploadSuccess === 'function') onUploadSuccess(data);
      }
      fetchUploads();
    } catch (err) {
      console.error(err);
      setAlert('❌ Upload error: ' + err.message, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length) {
      uploadFile(event.dataTransfer.files[0]);
    }
  };

  const handleChange = (event) => {
    if (event.target.files && event.target.files[0]) {
      uploadFile(event.target.files[0]);
    }
  };

  const handleSetUrl = async () => {
    if (!liveUrl.trim()) {
      setAlert('❌ Please enter a valid live URL', 'error');
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/live-tracker/set-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: liveUrl, interval: refreshInterval }),
      });
      const data = await res.json();
      if (data.ok) {
        setAlert('✅ Live source configured', 'success');
        fetchTrackerStatus();
      } else {
        setAlert('❌ ' + (data.error || 'Could not configure live source'), 'error');
      }
    } catch (err) {
      console.error(err);
      setAlert('❌ Live source error: ' + err.message, 'error');
    }
  };

  const handleStartSync = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/live-tracker/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.ok) {
        setAutoSync(true);
        setAlert('✅ Auto-sync started', 'success');
      } else {
        setAlert('❌ ' + (data.error || 'Unable to start auto-sync'), 'error');
      }
    } catch (err) {
      console.error(err);
      setAlert('❌ Auto-sync error: ' + err.message, 'error');
    }
  };

  const handleStopSync = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/live-tracker/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.ok) {
        setAutoSync(false);
        setAlert('✅ Auto-sync stopped', 'success');
      } else {
        setAlert('❌ ' + (data.error || 'Unable to stop auto-sync'), 'error');
      }
    } catch (err) {
      console.error(err);
      setAlert('❌ Auto-sync error: ' + err.message, 'error');
    }
  };

  const handleSyncNow = async () => {
    try {
      setMessage('Syncing live source...');
      setMessageType('');
      const res = await fetch('http://localhost:3001/api/live-tracker/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.ok) {
        setAlert('✅ Live sync completed', 'success');
        setLastSync(data.lastSync ? new Date(data.lastSync).toLocaleString() : '--');
        if (typeof onUploadSuccess === 'function') onUploadSuccess(data);
      } else {
        setAlert('❌ Sync failed: ' + (data.error || 'Unknown'), 'error');
      }
    } catch (err) {
      console.error(err);
      setAlert('❌ Sync error: ' + err.message, 'error');
    }
  };

  return (
    <div className="upload-card">
      <div className="upload-card-header">
        <div>
          <h2>Upload New Data</h2>
          <p>Upload Excel / CSV / JSON files, or PDF reports. Live Excel sync is also supported.</p>
        </div>
        <div className="status-chip">Live sync: {autoSync ? 'ON' : 'OFF'}</div>
      </div>

      <div
        className={`upload-dropzone ${dragActive ? 'active' : ''} ${uploading ? 'disabled' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <div className="dropzone-inner">
          <div className="dropzone-icon">📁</div>
          <div className="dropzone-line">Drag & drop file here</div>
          <div className="dropzone-subline">or click to browse • .xlsx .xls .csv .json .pdf</div>
          <div className="dropzone-note">Max 50MB</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.json,.pdf"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={uploading}
        />
      </div>

      <div className="live-source-panel">
        <div className="panel-title">Live Source Sync</div>
        <input
          type="text"
          className="live-source-input"
          placeholder="Paste direct Excel/CSV/JSON URL"
          value={liveUrl}
          onChange={(e) => setLiveUrl(e.target.value)}
          disabled={uploading}
        />
        <div className="live-actions-row">
          <div className="refresh-block">
            <input
              type="number"
              min="60"
              max="3600"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Math.max(60, Math.min(3600, Number(e.target.value) || 300)))}
              disabled={uploading || autoSync}
            />
            <span>sec refresh</span>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => { e.target.checked ? handleStartSync() : handleStopSync(); }}
              disabled={uploading || !liveUrl}
            />
            Auto-sync
          </label>
        </div>
        <div className="button-row">
          <button className="btn btn-primary" onClick={handleSetUrl} disabled={uploading || !liveUrl}>Configure</button>
          <button className="btn btn-secondary" onClick={handleSyncNow} disabled={uploading || !liveUrl}>Sync Now</button>
          <button className="btn btn-clear" onClick={handleStopSync} disabled={uploading || !autoSync}>Stop</button>
        </div>
        <div className="last-sync">Last sync: {lastSync}</div>
      </div>

      <div className="uploads-list">
        <div className="uploads-title">Uploaded PDFs</div>
        {uploads.length ? (
          <ul>
            {uploads.map((file) => (
              <li key={file}>
                <a href={`http://localhost:3001/data/${file}`} target="_blank" rel="noreferrer">{file}</a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="uploads-empty">No uploaded PDFs yet</div>
        )}
      </div>

      {message && (
        <div className={`upload-alert ${messageType}`}>{message}</div>
      )}

      <style>{`
        .upload-card { background: rgba(13,17,23,.94); border: 1px solid var(--b1); border-radius: 14px; padding: 20px; margin-bottom: 1.5rem; box-shadow: 0 0 40px rgba(0,0,0,.1); }
        .upload-card-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:20px; }
        .upload-card-header h2 { margin:0;font-size:18px;color:var(--t1); }
        .upload-card-header p { margin:6px 0 0;color:var(--t3);font-size:12px;max-width:560px; }
        .status-chip { padding:6px 12px;border-radius:999px;border:1px solid var(--b2);background:rgba(0,229,180,.08);color:var(--acc);font-family:var(--mono);font-size:11px; }
        .upload-dropzone { border:2px dashed rgba(0,153,255,.35); border-radius:16px; padding:28px; text-align:center; transition:all .2s ease; cursor:pointer; background:rgba(0,0,0,.15); margin-bottom:20px; }
        .upload-dropzone.active { border-color:var(--acc); background:rgba(0,229,180,.08); }
        .upload-dropzone.disabled { opacity:.65; cursor:not-allowed; }
        .dropzone-inner { display:flex; flex-direction:column; align-items:center; gap:10px; }
        .dropzone-icon { font-size:32px; }
        .dropzone-line { font-size:14px; font-weight:600; color:var(--t1); }
        .dropzone-subline { font-size:11px; color:var(--t2); }
        .dropzone-note { font-size:10px; color:var(--t3); }
        .live-source-panel { background:rgba(7,9,13,.8); border:1px solid var(--b1); border-radius:12px; padding:18px; margin-bottom:20px; }
        .panel-title { font-family:var(--mono); font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--t3); margin-bottom:12px; }
        .live-source-input { width:100%; padding:12px 14px; border-radius:10px; border:1px solid var(--b2); background:var(--bg4); color:var(--t1); font-family:var(--mono); font-size:12px; margin-bottom:14px; outline:none; }
        .live-actions-row { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:14px; }
        .refresh-block { display:flex; align-items:center; gap:8px; color:var(--t3); font-size:11px; }
        .refresh-block input { width:90px; padding:10px 12px; border-radius:8px; border:1px solid var(--b2); background:var(--bg4); color:var(--t1); font-family:var(--mono); font-size:12px; }
        .checkbox-label { display:flex; align-items:center; gap:8px; color:var(--t2); font-size:12px; -webkit-user-select:none; user-select:none; }
        .checkbox-label input { accent-color:var(--acc); }
        .button-row { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:10px; }
        .btn { border:1px solid var(--b2); border-radius:10px; padding:10px 16px; font-family:var(--mono); font-size:12px; cursor:pointer; transition:all .18s; }
        .btn-primary { background:var(--acc); color:#000; border-color:transparent; }
        .btn-secondary { background:rgba(0,153,255,.12); color:var(--t1); }
        .btn-clear { background:transparent; color:var(--danger); }
        .btn:hover { transform:translateY(-1px); }
        .btn:disabled { opacity:.55; cursor:not-allowed; transform:none; }
        .last-sync { color:var(--t3); font-size:11px; }
        .uploads-list { border:1px solid var(--b1); border-radius:12px; padding:16px; background:rgba(0,0,0,.18); }
        .uploads-title { font-family:var(--mono); font-size:11px; color:var(--t3); margin-bottom:10px; }
        .uploads-list ul { list-style:none; padding-left:0; margin:0; display:grid; gap:10px; }
        .uploads-list li { font-size:12px; color:var(--t2); }
        .uploads-list a { color:var(--acc2); text-decoration:none; }
        .uploads-list a:hover { text-decoration:underline; }
        .uploads-empty { color:var(--t3); font-size:12px; }
        .upload-alert { margin-top:16px; padding:12px 14px; border-radius:12px; font-family:var(--mono); font-size:12px; }
        .upload-alert.success { background:rgba(16,185,129,.12); color:var(--success); border:1px solid rgba(16,185,129,.2); }
        .upload-alert.error { background:rgba(244,63,94,.12); color:var(--danger); border:1px solid rgba(244,63,94,.2); }
      `}</style>
    </div>
  );
}

window.Upload = Upload;

console.log('Upload module loaded');
