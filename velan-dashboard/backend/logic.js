'use strict';

const DONE_OPS = ['READY','STORES','STOCK'];
const VENDOR_THRESHOLD_H = 48;

function stagePipeline(items) {
  const counts = {};
  items.forEach(i => {
    if (!i.current_op) return;
    counts[i.current_op] = (counts[i.current_op] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);
}

function bottlenecks(items) {
  const byStage = {};
  items.forEach(i => {
    if (!i.current_op || i.dwell_hours == null) return;
    if (!byStage[i.current_op]) byStage[i.current_op] = [];
    byStage[i.current_op].push(i.dwell_hours);
  });
  return Object.entries(byStage).map(([stage, dwells]) => {
    const avg = dwells.reduce((a,b)=>a+b,0) / dwells.length;
    const max = Math.max(...dwells);
    return {
      stage,
      item_count:      dwells.length,
      avg_dwell_hours: Math.round(avg * 10) / 10,
      max_dwell_hours: Math.round(max * 10) / 10,
      is_bottleneck:   dwells.length >= 3 || avg > 24,
    };
  }).sort((a, b) => b.avg_dwell_hours - a.avg_dwell_hours);
}

function orderSummary(items) {
  const byOrder = {};
  items.forEach(i => {
    const key = String(i.order_id || 'MISC');
    if (!byOrder[key]) {
      byOrder[key] = {
        order_id:      i.order_id,
        po_number:     i.po_number,
        customer:      i.customer,
        po_date:       i.po_date,
        delivery_note: i.delivery_note,
        total: 0, done: 0, vendor: 0, max_days_remaining: 0,
      };
    }
    const o = byOrder[key];
    o.total++;
    if (DONE_OPS.includes(i.current_op)) o.done++;
    if (i.location === 'WITH VENDOR') o.vendor++;
    if (i.progress && i.progress.days_remaining > o.max_days_remaining)
      o.max_days_remaining = i.progress.days_remaining;
  });

  const MAY5 = new Date('2025-05-05');
  const daysToMay5 = Math.round((MAY5 - Date.now()) / 86400000);

  return Object.values(byOrder).map(o => {
    const pct  = Math.round((o.done / o.total) * 100);
    let risk = 'ON_TRACK';
    if (o.max_days_remaining > daysToMay5 + 1) risk = 'OVERDUE';
    else if (o.max_days_remaining >= daysToMay5 - 1) risk = 'AT_RISK';
    return { ...o, pct, wip: o.total - o.done, risk, days_to_deadline: daysToMay5 };
  });
}

function vendorItems(items) {
  return items
    .filter(i => i.location === 'WITH VENDOR')
    .map(i => ({ ...i, overdue: (i.dwell_hours || 0) > VENDOR_THRESHOLD_H }))
    .sort((a, b) => (b.dwell_hours || 0) - (a.dwell_hours || 0));
}

function kpiSummary(items, orders) {
  const total     = items.length;
  const inprog    = items.filter(i => !DONE_OPS.includes(i.current_op)).length;
  const done      = items.filter(i => DONE_OPS.includes(i.current_op)).length;
  const withVend  = items.filter(i => i.location === 'WITH VENDOR').length;
  const bn = bottlenecks(items).filter(b => b.is_bottleneck);

  const MAY5 = new Date('2025-05-05');
  const daysLeft = Math.round((MAY5 - Date.now()) / 86400000);

  return { total, inprog, done, withVend,
           bottleneck_count: bn.length,
           top_bottleneck: bn[0]?.stage || null,
           days_to_may5: daysLeft,
           active_orders: orders.length };
}

module.exports = { stagePipeline, bottlenecks, orderSummary, vendorItems, kpiSummary };

