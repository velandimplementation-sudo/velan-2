'use strict';
const XLSX = require('xlsx');

const COL = { SNO:0, PO_NO:1, PO_DATE:2, CUSTOMER:3, CUST_NAME:4, PRODUCT:5, QTY:6, STATUS1:7, STATUS2:8, LOCATION:9, OP:10, TIMESTAMP:11, NOTES:12 };

const SAE_CHAINS = {
  'BASE PLATE':     { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'TOP PLATE':      { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'BOTTOM PLATE':   { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'ANGLE PLATE':    { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'RAIL PLATE':     { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'SQUARE PLATE':   { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'LOCKING PLATE':  { steps:['RM','MILL','SG','BLK'],                days:[2,1,1,1] },
  'L PLATE':        { steps:['RM','PT','MILL','SG','JIGBORE','BLK'], days:[2,2,1,1,1,1] },
  'T PLATE':        { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,2,1,1] },
  'LOCATOR':        { steps:['RM','PT','MILL','HT','SG','CG','BLK'], days:[1,2,1,1,1,1,1] },
  'JIG FEET':       { steps:['RM','MILL','SG','BLK'],                days:[2,1,1,1] },
  'ANVIL':          { steps:['RM','SPARK','BRAZE','CG'],             days:[2,2,1,1] },
  'BUSH':           { steps:['RM','LATHE','SG'],                     days:[1,1,1] },
  'MASTER':         { steps:['RM','PT','HT','BLK','SG','CG'],        days:[1,2,1,1,1,1] },
  'PROBE HOLDER':   { steps:['RM','PT','MILL','SG','BLK'],           days:[2,2,1,1,1] },
  'PROBE ACTUATOR': { steps:['RM','LATHE','CG','SG','BLK'],          days:[1,1,1,1,1] },
  'SHEET METAL':    { steps:['RM','MILL','POWDER COAT'],             days:[2,1,1] },
  'ANVIL HOLDER':   { steps:['RM','LATHE','MILL','CG','SG','BLK'],  days:[1,1,1,1,1,1] },
};

const OP_TO_STEP = { 'RM':'RM','PTV':'PT','LATHE':'LATHE','M1':'MILL','HTV':'HT','SG':'SG','CG':'CG','BLV':'BLK','BLI':'BLK','ASS':'ASS','PRE ASS':'PRE ASS','SPI':'SPARK','BRI':'BRAZE','JBI':'JIGBORE','STOCK':'STOCK','READY':'READY' };

function excelToDate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  return new Date((serial - 25569) * 86400 * 1000);
}

function cleanLocation(raw) {
  if (!raw) return 'INHOUSE';
  const s = String(raw).trim().toUpperCase().replace(/\s+/g,'');
  if (s.startsWith('WITH') || s === 'WITHVENDOR') return 'WITH VENDOR';
  return 'INHOUSE';
}

function matchSAEChain(product) {
  if (!product) return null;
  const u = product.toUpperCase();
  for (const [key, chain] of Object.entries(SAE_CHAINS)) {
    if (u.includes(key)) return { component: key, ...chain };
  }
  return null;
}

function calcProgress(sae, op) {
  if (!sae) return null;
  const step = OP_TO_STEP[op] || op;
  const idx  = sae.steps.indexOf(step);
  const si   = idx === -1 ? 0 : idx;
  return {
    pct:            Math.round((si / sae.steps.length) * 100),
    step_index:     si,
    total_steps:    sae.steps.length,
    steps:          sae.steps,
    days:           sae.days,
    days_remaining: sae.days.slice(si).reduce((a,b)=>a+b,0),
    current_step:   sae.steps[si] || op,
    next_step:      sae.steps[si+1] || 'COMPLETE',
    found:          idx !== -1,
  };
}

function parseProject2(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:null, raw:true, header:1 });

  const headerIdx = rows.findIndex(r => r && r[0] === 'SNO');
  const dataRows  = rows.slice(headerIdx + 2);

  let orderId=null, poNo=null, poDate=null, customer=null, deliveryNote=null;
  const items = [];

  dataRows.forEach((row, i) => {
    if (!row) return;
    const product = String(row[COL.PRODUCT]||'').trim();
    const op      = String(row[COL.OP]     ||'').trim();
    if (!product) return;
    if (['ACCESSORIES (BOUGHT OUT)','VELAN METROLOGY'].some(k=>product.toUpperCase().includes(k))) return;
    if (!op && !row[COL.STATUS1] && !row[COL.STATUS2]) return;

    if (row[COL.SNO] != null && String(row[COL.SNO]).trim()) {
      orderId=row[COL.SNO]; poNo=row[COL.PO_NO];
      poDate=row[COL.PO_DATE]; customer=row[COL.CUSTOMER]; deliveryNote=null;
    }
    const poCell = String(row[COL.PO_NO]||'');
    if (/may/i.test(poCell)) deliveryNote=poCell.trim();
    if (row[COL.CUSTOMER]) customer=row[COL.CUSTOMER];

    const ts        = row[COL.TIMESTAMP];
    const timestamp = excelToDate(ts);
    const dwell_h = timestamp ? Math.max(0, Math.round(((Date.now()-timestamp.getTime())/3600000)*10)/10) : null;
    const location  = cleanLocation(row[COL.LOCATION]);
    const sae       = matchSAEChain(product);

    const s1 = String(row[COL.STATUS1]||'').trim();
    const s2 = String(row[COL.STATUS2]||'').trim();
    const nt = String(row[COL.NOTES]  ||'').trim();

    items.push({
      row_index:     i,
      order_id:      orderId,
      po_number:     String(poNo||'').trim(),
      po_date:       poDate ? excelToDate(poDate)?.toISOString().split('T')[0] : null,
      delivery_note: deliveryNote,
      customer:      String(customer||'VELAN').trim(),
      product_name:  product,
      qty:           String(row[COL.QTY]||'').trim(),
      status1: s1, status2: s2, notes: nt,
      location,
      current_op:    op,
      timestamp:     timestamp?.toISOString()||null,
      dwell_hours:   dwell_h,
      is_blocked:    op==='TO BE ORDER'||/to be order/i.test(s2),
      is_rework:     /rework/i.test(s2)||/rework/i.test(s1),
      sae_component: sae?.component||null,
      progress:      sae ? calcProgress(sae,op) : null,
    });
  });

  return items;
}

module.exports = { parseProject2 };
