import React, { useState, useRef, useEffect } from 'react';

export default function Upload({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Live Tracker State
  const [liveUrl, setLiveUrl] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(300);
  const [autoSync, setAutoSync] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState({});
  const [lastSync, setLastSync] = useState('--');
  const [uploads, setUploads] = useState([]);
  const syncCheckInterval = useRef(null);

  // Load tracker status on mount
  useEffect(() => {
    fetchTrackerStatus();
    fetchUploads();
    syncCheckInterval.current = setInterval(fetchTrackerStatus, 5000);
    return () => clearInterval(syncCheckInterval.current);
  }, []);

  const fetchUploads = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/uploads');
      const data = await res.json();
      if (data.ok) setUploads(data.pdfs || []);
    } catch (e) {
      console.error('Error fetching uploads:', e);
    }
  };

  const fetchTrackerStatus = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/live-tracker/status');
      const data = await res.json();
      setTrackerStatus(data);
      if (data.url) setLiveUrl(data.url);
      if (data.interval) setRefreshInterval(data.interval);
      if (data.autoSync) setAutoSync(data.autoSync);
      if (data.lastSync) {
        const d = new Date(data.lastSync);
        setLastSync(d.toLocaleString());
      }
    } catch (e) {
      console.error('Error fetching tracker status:', e);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.json', '.pdf'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setMessageType('error');
      setMessage('❌ Only .xlsx, .xls, .csv, .json, and .pdf files allowed');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setMessageType('error');
      setMessage('❌ File size must be less than 50MB');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    setUploading(true);
    setMessage('⏳ Uploading...');
    setMessageType('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.ok) {
        setMessageType('success');
        if (data.type === 'pdf') {
          setMessage(`✅ PDF uploaded: ${data.filename}`);
          fetchUploads();
        } else {
          setMessage(`✅ ${data.type.toUpperCase()} loaded! ${data.count} items, ${data.orders} orders`);
          fetchUploads();
        }
        if (onUploadSuccess) onUploadSuccess(data);
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessageType('error');
        setMessage(`❌ Error: ${data.error || 'Upload failed'}`);
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (error) {
      setMessageType('error');
      setMessage(`❌ Error: ${error.message}`);
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetUrl = async () => {
    if (!liveUrl.trim()) {
      setMessageType('error');
      setMessage('❌ Please enter a valid URL');
      setTimeout(() => setMessage(''), 3000);
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
        setMessageType('success');
        setMessage('✅ Live URL configured');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessageType('error');
        setMessage('❌ ' + data.error);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (e) {
      setMessageType('error');
      setMessage('❌ Error: ' + e.message);
      setTimeout(() => setMessage(''), 3000);
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
        setMessageType('success');
        setMessage('✅ Auto-sync started every ' + refreshInterval + 's');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessageType('error');
        setMessage('❌ ' + data.error);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (e) {
      setMessageType('error');
      setMessage('❌ Error: ' + e.message);
      setTimeout(() => setMessage(''), 3000);
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
        setMessageType('success');
        setMessage('✅ Auto-sync stopped');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessageType('error');
        setMessage('❌ ' + data.error);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (e) {
      setMessageType('error');
      setMessage('❌ Error: ' + e.message);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSyncNow = async () => {
    try {
      setMessage('⏳ Syncing...');
      setMessageType('');
      const res = await fetch('http://localhost:3001/api/live-tracker/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.ok) {
        setMessageType('success');
        setMessage('✅ Sync #' + data.syncCount + ' successful - ' + new Date().toLocaleTimeString());
        setLastSync(new Date(data.lastSync).toLocaleString());
        setTimeout(() => setMessage(''), 4000);
        if (onUploadSuccess) onUploadSuccess(data);
      } else {
        setMessageType('error');
        setMessage('❌ Sync failed: ' + data.error);
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (e) {
      setMessageType('error');
      setMessage('❌ Error: ' + e.message);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleClear = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/live-tracker/set-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: null }),
      });
      const data = await res.json();
      if (data.ok) {
        setLiveUrl('');
        setAutoSync(false);
        setLastSync('--');
        setMessageType('success');
        setMessage('✅ Live tracker cleared');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (e) {
      setMessageType('error');
      setMessage('❌ Error: ' + e.message);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <div className="upload-module">
      <div className="upload-header">
        <h3>📤 Upload New Data</h3>
        <p className="upload-subtitle">Excel • CSV • JSON • PDF</p>
      </div>
      <div
        className={`upload-dropzone ${dragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="dropzone-content">
          <div className="upload-icon">📁</div>
          <p className="dropzone-title">Drag &amp; drop your file here</p>
          <p className="dropzone-subtitle">or click to browse</p>
          <p className="file-types">Excel • CSV • JSON • PDF (Max 50MB)</p>
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
      <div className="live-source-section">
        <h4>🔗 Live Source Sync</h4>
        <input
          type="text"
          placeholder="Paste direct .xlsx/.csv/.json URL"
          className="url-input"
          value={liveUrl}
          onChange={(e) => setLiveUrl(e.target.value)}
          disabled={uploading || autoSync}
        />
        <div className="sync-controls">
          <input
            type="number"
            placeholder="300"
            min="60"
            max="3600"
            className="refresh-interval"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Math.max(60, Math.min(3600, parseInt(e.target.value) || 300)))}
            disabled={uploading || autoSync}
          />
          <span className="sec-label">seconds</span>
          <label className="auto-sync">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => {
                if (e.target.checked) handleStartSync();
                else handleStopSync();
              }}
              disabled={uploading || !liveUrl}
            />
            Auto-Sync
          </label>
          {autoSync && <span className="sync-badge">● LIVE</span>}
        </div>
        <div className="action-buttons">
          <button className="btn-sync" onClick={handleSetUrl} disabled={uploading || !liveUrl}>⚙️ Configure</button>
          <button className="btn-manual" onClick={handleSyncNow} disabled={uploading || !liveUrl}>⚡ Sync Now</button>
          <button className="btn-clear" onClick={handleClear} disabled={uploading || !liveUrl}>🗑️ Clear</button>
        </div>
        <p className="last-sync">
          <span style={{ color: 'var(--t3)' }}>Last sync:</span>
          <span style={{ color: autoSync ? 'var(--acc)' : 'var(--t2)', fontWeight: autoSync ? 600 : 400 }}>{lastSync}</span>
        </p>
      </div>
      <div className="uploads-list">
        <h4>Uploaded PDFs</h4>
        {uploads.length === 0 && <div className="empty">No PDFs uploaded yet</div>}
        {uploads.length > 0 && (
          <ul>
            {uploads.map((f) => (
              <li key={f}>
                <a href={'http://localhost:3001/data/' + f} target="_blank" rel="noreferrer">
                  {f}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {message && <div className={`upload-message ${messageType}`}>{message}</div>}
    </div>
  );
}
