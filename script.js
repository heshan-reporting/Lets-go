/* ===================================================
   KL Facebook Ads Dashboard — script.js
   =================================================== */

"use strict";

// ─── STATE ──────────────────────────────────────────
let activeWeek = 'current';
let searchQuery = '';
let typeFilter = 'all';
let tableTypeFilter = 'all';
let tableSortCol = 'spend';
let tableSortDir = 'desc';
let tablePage = 1;
const TABLE_PAGE_SIZE = 8;

// Chart instances
let chartCPL = null;
let chartCampaign = null;
let chartTrend = null;
let chartCPLbyCamp = null;
let chartLeadVol = null;
let chartReachGrowth = null;
let chartCPMTrend = null;

let cplMode = 'daily';
let campMetric = 'cpm';

// ─── FORMATTERS ─────────────────────────────────────
const fmt = {
  currency: v => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v.toFixed(2)}`,
  currencyFull: v => `$${v.toLocaleString('en-AU', {minimumFractionDigits:2, maximumFractionDigits:2})}`,
  number: v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(1)}K` : `${Math.round(v)}`,
  numberFull: v => v.toLocaleString('en-AU'),
  pct: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
  freq: v => `${v.toFixed(2)}×`,
};

function deltaDir(metric, pct) {
  const lowerIsBetter = ['cpl','cpm','frequency'];
  if (pct === null || !isFinite(pct)) return 'neutral';
  if (lowerIsBetter.includes(metric)) return pct < 0 ? 'up' : pct > 0 ? 'down' : 'neutral';
  return pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral';
}

function calcPct(cur, prev) {
  if (!prev || prev === 0) return null;
  return (cur - prev) / prev * 100;
}

function getWeekData(week) {
  return dashboardData.weekly[week];
}

function getPrevWeek(week) {
  return week === 'current' ? 'previous' : 'current';
}

// ─── COUNT-UP ANIMATION ─────────────────────────────
function countUp(el, endVal, duration, prefix, suffix, isFloat) {
  if (!el) return;
  const start = performance.now();
  const startVal = 0;
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const val = startVal + (endVal - startVal) * ease;
    let display;
    if (isFloat) {
      display = prefix + val.toFixed(2) + suffix;
    } else if (endVal >= 1000000) {
      display = prefix + (val/1000000).toFixed(1) + 'M' + suffix;
    } else if (endVal >= 1000) {
      display = prefix + (val/1000).toFixed(1) + 'K' + suffix;
    } else {
      display = prefix + Math.round(val) + suffix;
    }
    el.textContent = display;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── SPARKLINE SVG ─────────────────────────────────
function drawSparkline(svgEl, values, color) {
  if (!svgEl || !values || values.length < 2) return;
  svgEl.innerHTML = '';
  const W = 60, H = 32, pad = 3;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - minV) / range) * (H - pad * 2);
    return `${x},${y}`;
  });
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', pts.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', color || '#4F6EF7');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.appendChild(polyline);

  // Dot at last point
  const lastPt = pts[pts.length - 1].split(',');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', lastPt[0]);
  circle.setAttribute('cy', lastPt[1]);
  circle.setAttribute('r', '2.5');
  circle.setAttribute('fill', color || '#4F6EF7');
  svgEl.appendChild(circle);
}

// ─── KPI CARDS ──────────────────────────────────────
function renderKPIs() {
  const d = dashboardData;
  const wk = activeWeek;
  const prev = getPrevWeek(wk);
  const cur = d.weekly[wk];
  const prv = d.weekly[prev];

  const metrics = [
    { key:'spend', label:'kpi-spend', prefix:'$', suffix:'', float:false, sparkColor:'#4F6EF7' },
    { key:'leads', label:'kpi-leads', prefix:'', suffix:'', float:false, sparkColor:'#10B981' },
    { key:'cpl',   label:'kpi-cpl',   prefix:'$', suffix:'', float:true,  sparkColor:'#F59E0B' },
    { key:'cpm',   label:'kpi-cpm',   prefix:'$', suffix:'', float:true,  sparkColor:'#8B5CF6' },
    { key:'reach', label:'kpi-reach', prefix:'', suffix:'',  float:false, sparkColor:'#06B6D4' },
  ];

  const sparkData = {
    spend:  [d.weekly.previous.spend, d.weekly.current.spend],
    leads:  [d.weekly.previous.leads, d.weekly.current.leads],
    cpl:    [d.weekly.previous.cpl, d.weekly.current.cpl],
    cpm:    [d.weekly.previous.cpm, d.weekly.current.cpm],
    reach:  [d.weekly.previous.reach, d.weekly.current.reach],
  };

  metrics.forEach(m => {
    const curVal = cur[m.key] || 0;
    const prvVal = prv[m.key] || 0;
    const pct = calcPct(curVal, prvVal);
    const dir = deltaDir(m.key, pct);

    // Primary value
    const el = document.getElementById(m.label);
    if (el) countUp(el, curVal, 800, m.prefix, '', m.float);

    // Comparison row
    const compEl = document.getElementById('comp-' + m.key);
    if (compEl) {
      const prvFmt = m.float ? `${m.prefix}${prvVal.toFixed(2)}` : m.prefix + fmt.number(prvVal);
      const deltaStr = pct !== null ? fmt.pct(pct) : 'No prior data';
      const col = dir === 'up' ? 'var(--success)' : dir === 'down' ? 'var(--danger)' : 'var(--text-secondary)';
      compEl.innerHTML = `<span class="comp-val">vs ${prvFmt} last week</span> <span class="comp-delta" style="color:${col}">${deltaStr}</span>`;
    }

    // Delta pill
    const pillEl = document.getElementById('pill-' + m.key);
    if (pillEl && pct !== null) {
      pillEl.className = `delta-pill ${dir}`;
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
      pillEl.textContent = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
    }

    // Sparkline
    drawSparkline(document.getElementById('spark-' + m.key), sparkData[m.key], m.sparkColor);

    // Back face
    const curFmt = m.float ? `${m.prefix}${curVal.toFixed(2)}` : m.prefix + fmt.number(curVal);
    const prvFmtB = m.float ? `${m.prefix}${prvVal.toFixed(2)}` : m.prefix + fmt.number(prvVal);
    const absDiff = curVal - prvVal;
    const absFmt = m.float ? `${m.prefix}${absDiff >= 0 ? '+' : ''}${absDiff.toFixed(2)}` : `${m.prefix}${absDiff >= 0 ? '+' : ''}${fmt.number(Math.abs(absDiff))}`;
    setEl('back-' + m.key + '-cur', curFmt);
    setEl('back-' + m.key + '-prev', prvFmtB);
    setEl('back-' + m.key + '-abs', absFmt);
    setEl('back-' + m.key + '-pct', pct !== null ? fmt.pct(pct) : 'N/A');
  });
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── SNAPSHOT CARDS ─────────────────────────────────
function renderSnapshot() {
  const wk = activeWeek;
  const prev = getPrevWeek(wk);
  const cur = dashboardData.weekly[wk];
  const prv = dashboardData.weekly[prev];

  const cards = [
    { key:'impressions', valId:'snap-impressions', compId:'snap-impressions-comp', pillId:'snap-pill-impressions', curBar:'bar-imp-cur', prevBar:'bar-imp-prev' },
    { key:'frequency',   valId:'snap-frequency',   compId:'snap-frequency-comp',   pillId:'snap-pill-frequency',   curBar:'bar-freq-cur', prevBar:'bar-freq-prev' },
    { key:'linkClicks',  valId:'snap-linkclicks',  compId:'snap-linkclicks-comp',  pillId:'snap-pill-linkclicks',  curBar:'bar-lk-cur',   prevBar:'bar-lk-prev' },
    { key:'landingPageViews', valId:'snap-lpv', compId:'snap-lpv-comp', pillId:'snap-pill-lpv', curBar:'bar-lpv-cur', prevBar:'bar-lpv-prev' },
  ];

  cards.forEach(c => {
    const curVal = cur[c.key] || 0;
    const prvVal = prv[c.key] || 0;
    const pct = calcPct(curVal, prvVal);
    const dir = deltaDir(c.key === 'frequency' ? 'frequency' : 'other', pct);

    const el = document.getElementById(c.valId);
    if (el) {
      if (c.key === 'frequency') {
        countUp(el, curVal, 800, '', '×', true);
      } else {
        countUp(el, curVal, 800, '', '', false);
      }
    }

    const compEl = document.getElementById(c.compId);
    if (compEl) {
      const prvFmt = c.key === 'frequency' ? `${prvVal.toFixed(2)}×` : fmt.number(prvVal);
      compEl.textContent = `vs ${prvFmt} last week`;
    }

    const pillEl = document.getElementById(c.pillId);
    if (pillEl && pct !== null) {
      pillEl.className = `delta-pill ${dir}`;
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
      pillEl.textContent = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
    }

    // Mini bars
    const maxVal = Math.max(curVal, prvVal, 1);
    setTimeout(() => {
      const curBarEl = document.getElementById(c.curBar);
      const prevBarEl = document.getElementById(c.prevBar);
      if (curBarEl) curBarEl.style.width = `${(curVal/maxVal)*100}%`;
      if (prevBarEl) prevBarEl.style.width = `${(prvVal/maxVal)*100}%`;
    }, 400);
  });
}

// ─── TYPEWRITER EFFECT ────────────────────────────────
function typeWriter(el, text, speed, onDone) {
  el.textContent = '';
  if (text.length > 400) {
    el.textContent = text;
    el.style.opacity = 0;
    el.style.transition = 'opacity 0.6s ease';
    setTimeout(() => { el.style.opacity = 1; if (onDone) onDone(); }, 50);
    return;
  }
  let cursor = document.createElement('span');
  cursor.className = 'summary-cursor';
  el.after(cursor);
  let i = 0;
  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    } else {
      cursor.remove();
      if (onDone) onDone();
    }
  }
  tick();
}

function renderSummaryCard() {
  const textEl = document.getElementById('summaryText');
  if (!textEl) return;
  typeWriter(textEl, dashboardData.weeklySummary, 12, () => {
    // Animate pills in
    document.querySelectorAll('.summary-pill').forEach((p, i) => {
      setTimeout(() => {
        p.style.transform = 'scale(1)';
        p.style.opacity = '1';
        p.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease';
      }, i * 100);
    });
  });
}

// ─── CHART DEFAULTS ──────────────────────────────────
const chartDefaults = {
  color: 'rgba(240,240,245,0.8)',
  borderColor: '#2A2A38',
  gridColor: '#2A2A38',
};

Chart.defaults.color = chartDefaults.color;
Chart.defaults.borderColor = chartDefaults.borderColor;

function darkTooltip() {
  return {
    backgroundColor: '#1E1E28',
    borderColor: '#2A2A38',
    borderWidth: 1,
    titleColor: '#F0F0F5',
    bodyColor: '#8A8A9A',
    padding: 10,
  };
}

function destroyChart(ref) {
  if (ref) { try { ref.destroy(); } catch(e) {} }
  return null;
}

// ─── CHART 1: CPL TREND ─────────────────────────────
function buildCPLChart() {
  chartCPL = destroyChart(chartCPL);
  const canvas = document.getElementById('chartCPL');
  if (!canvas) return;
  const data = cplMode === 'daily' ? dashboardData.cplDailyTrend : aggregateCPLWeekly();
  const labels = data.map(d => d.date);
  const cpls = data.map(d => d.cpl);
  const leads = data.map(d => d.leads);

  chartCPL = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'True CPL (AUD)',
          data: cpls,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#10B981',
          tension: 0.35,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'Daily Leads',
          data: leads,
          borderColor: '#4F6EF7',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5,3],
          pointRadius: 3,
          pointBackgroundColor: '#4F6EF7',
          tension: 0.35,
          fill: false,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...darkTooltip(),
          callbacks: {
            label: ctx => {
              if (ctx.dataset.yAxisID === 'y') return `CPL: $${ctx.parsed.y.toFixed(2)}`;
              return `Leads: ${ctx.parsed.y}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', font: { size: 11 } } },
        y: {
          type: 'linear', position: 'left',
          grid: { color: '#2A2A38' },
          ticks: { color: '#8A8A9A', callback: v => `$${v.toFixed(2)}`, font: { size: 11 } }
        },
        y1: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#8A8A9A', font: { size: 11 } }
        }
      }
    }
  });
}

function aggregateCPLWeekly() {
  // Already weekly-level data, return as-is
  return dashboardData.cplDailyTrend;
}

// ─── CHART 2: CAMPAIGN PERFORMANCE ──────────────────
const campColors = ['#4F6EF7','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4','#EC4899','#84CC16'];

function buildCampaignChart() {
  chartCampaign = destroyChart(chartCampaign);
  const canvas = document.getElementById('chartCampaign');
  if (!canvas) return;
  const wk = activeWeek;

  // Get top 8 campaigns sorted by metric
  let camps = [...dashboardData.campaigns]
    .filter(c => c.weekly[wk].spend > 0)
    .sort((a, b) => b.weekly[wk][campMetric] - a.weekly[wk][campMetric])
    .slice(0, 8);

  const labels = camps.map(c => c.name.length > 18 ? c.name.slice(0, 18) + '…' : c.name);
  const values = camps.map(c => c.weekly[wk][campMetric] || 0);
  const colors = camps.map((_, i) => campColors[i % campColors.length]);

  const yLabel = campMetric === 'leads' ? '' : '$';

  chartCampaign = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: campMetric.toUpperCase(),
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...darkTooltip(),
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return campMetric === 'leads' ? `Leads: ${v}` : `${campMetric.toUpperCase()}: $${v.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#2A2A38' },
          ticks: { color: '#8A8A9A', font: { size: 11 }, maxRotation: -35, minRotation: -35 }
        },
        y: {
          grid: { color: '#2A2A38' },
          ticks: {
            color: '#8A8A9A',
            font: { size: 11 },
            callback: v => campMetric === 'leads' ? v : `$${v}`
          }
        }
      }
    }
  });
}

// ─── CHART 3: SPEND & REACH TREND ───────────────────
function buildTrendChart() {
  chartTrend = destroyChart(chartTrend);
  const canvas = document.getElementById('chartTrend');
  if (!canvas) return;
  const data = dashboardData.dailyTrend;
  const labels = data.map(d => d.date);

  chartTrend = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Spend (AUD)',
          data: data.map(d => d.spend),
          borderColor: '#4F6EF7',
          backgroundColor: 'rgba(79,110,247,0.08)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'Total Reach',
          data: data.map(d => d.reach),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y1',
        },
        {
          label: 'Leads',
          data: data.map(d => d.leads),
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0.4,
          fill: false,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...darkTooltip(),
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Total Spend (AUD)') return `Spend: $${ctx.parsed.y.toLocaleString()}`;
              if (ctx.dataset.label === 'Total Reach') return `Reach: ${ctx.parsed.y.toLocaleString()}`;
              return `Leads: ${ctx.parsed.y}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: '#1E1E28' }, ticks: { color: '#8A8A9A', font: { size: 11 } } },
        y: {
          type: 'linear', position: 'left',
          grid: { color: '#1E1E28' },
          ticks: { color: '#4F6EF7', callback: v => `$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`, font: { size: 11 } }
        },
        y1: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#10B981', callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v, font: { size: 11 } }
        }
      }
    }
  });
}

// ─── CHART 4: CPL by Campaign (Lead Gen section) ────
function buildCPLbyCampChart() {
  chartCPLbyCamp = destroyChart(chartCPLbyCamp);
  const canvas = document.getElementById('chartCPLbyCamp');
  if (!canvas) return;
  const wk = activeWeek;
  const prev = getPrevWeek(wk);
  const leadCamps = dashboardData.campaigns.filter(c => c.type === 'lead_gen');
  const labels = leadCamps.map(c => c.name.length > 22 ? c.name.slice(0,22)+'…' : c.name);

  chartCPLbyCamp = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Current Week',
          data: leadCamps.map(c => c.weekly[wk].cpl),
          backgroundColor: '#4F6EF7',
          borderRadius: 5,
        },
        {
          label: 'Previous Week',
          data: leadCamps.map(c => c.weekly[prev].cpl),
          backgroundColor: '#333344',
          borderRadius: 5,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { labels: { color: '#8A8A9A', font: { size: 11 } } },
        tooltip: { ...darkTooltip(), callbacks: { label: ctx => `CPL: $${ctx.parsed.y.toFixed(2)}` } }
      },
      scales: {
        x: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', font: { size: 10 }, maxRotation: -30 } },
        y: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', callback: v => `$${v}`, font: { size: 11 } } }
      }
    }
  });
}

// ─── CHART 5: Lead Volume ────────────────────────────
function buildLeadVolChart() {
  chartLeadVol = destroyChart(chartLeadVol);
  const canvas = document.getElementById('chartLeadVol');
  if (!canvas) return;
  const wk = activeWeek;
  const prev = getPrevWeek(wk);
  const leadCamps = dashboardData.campaigns.filter(c => c.type === 'lead_gen');
  const labels = leadCamps.map(c => c.name.length > 22 ? c.name.slice(0,22)+'…' : c.name);

  chartLeadVol = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Current Week',
          data: leadCamps.map(c => c.weekly[wk].leads),
          backgroundColor: '#10B981',
          borderRadius: 5,
          stack: 'a',
        },
        {
          label: 'Previous Week',
          data: leadCamps.map(c => c.weekly[prev].leads),
          backgroundColor: '#333344',
          borderRadius: 5,
          stack: 'b',
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { labels: { color: '#8A8A9A', font: { size: 11 } } },
        tooltip: { ...darkTooltip() }
      },
      scales: {
        x: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', font: { size: 10 }, maxRotation: -30 } },
        y: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', font: { size: 11 } } }
      }
    }
  });
}

// ─── CHART 6: Reach Growth ────────────────────────────
function buildReachGrowthChart() {
  chartReachGrowth = destroyChart(chartReachGrowth);
  const canvas = document.getElementById('chartReachGrowth');
  if (!canvas) return;
  const labels = dashboardData.dailyTrend.map(d => d.date);

  chartReachGrowth = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Reach',
          data: dashboardData.dailyTrend.map(d => d.reach),
          backgroundColor: '#10B981',
          borderRadius: 5,
        },
        {
          label: 'Impressions',
          data: dashboardData.dailyTrend.map(d => d.impressions),
          backgroundColor: '#4F6EF7',
          borderRadius: 5,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { labels: { color: '#8A8A9A', font: { size: 11 } } },
        tooltip: { ...darkTooltip(), callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', font: { size: 11 } } },
        y: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'K', font: { size: 11 } } }
      }
    }
  });
}

// ─── CHART 7: CPM Trend ───────────────────────────────
function buildCPMTrendChart() {
  chartCPMTrend = destroyChart(chartCPMTrend);
  const canvas = document.getElementById('chartCPMTrend');
  if (!canvas) return;
  const labels = dashboardData.dailyTrend.map(d => d.date);

  chartCPMTrend = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Account CPM',
        data: dashboardData.dailyTrend.map(d => d.cpm),
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245,158,11,0.1)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#F59E0B',
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { ...darkTooltip(), callbacks: { label: ctx => `CPM: $${ctx.parsed.y.toFixed(2)}` } }
      },
      scales: {
        x: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', font: { size: 11 } } },
        y: { grid: { color: '#2A2A38' }, ticks: { color: '#8A8A9A', callback: v => `$${v.toFixed(2)}`, font: { size: 11 } } }
      }
    }
  });
}

// ─── CAMPAIGN CARDS ──────────────────────────────────
function makeCampaignCard(c, wk) {
  const prev = getPrevWeek(wk);
  const cur = c.weekly[wk];
  const prv = c.weekly[prev];
  const spendPct = calcPct(cur.spend, prv.spend);
  const statusClass = c.status.toLowerCase() === 'active' ? 'active' : 'inactive';
  const sparkVals = [prv.spend, cur.spend];

  const sparkSvg = `<svg class="campaign-sparkline" width="100%" height="28" viewBox="0 0 100 28">
    ${prv.spend > 0 || cur.spend > 0 ? `<polyline points="10,${28 - (prv.spend/Math.max(prv.spend,cur.spend,1))*22} 90,${28 - (cur.spend/Math.max(prv.spend,cur.spend,1))*22}" fill="none" stroke="#4F6EF7" stroke-width="2" stroke-linecap="round"/>` : ''}
  </svg>`;

  const metricA = c.type === 'lead_gen' ? { label:'Leads', cur: cur.leads, prev: prv.leads, fmt: v => v }
                                         : { label:'Reach', cur: cur.reach, prev: prv.reach, fmt: v => fmt.number(v) };

  return `
    <div class="campaign-card searchable-item" data-name="${escHtml(c.name)}" data-type="${c.type}">
      <div class="campaign-card-head">
        <div class="campaign-type-dot ${c.type}"></div>
        <div class="campaign-name">${escHtml(c.name)}</div>
        <span class="campaign-status-badge ${statusClass}">${c.status}</span>
      </div>
      <div class="campaign-metrics">
        <div class="campaign-metric-item">
          <div class="campaign-metric-label">Spend</div>
          <div class="campaign-metric-value">${fmt.currency(cur.spend)}</div>
          <div class="campaign-metric-prev">vs ${fmt.currency(prv.spend)}</div>
        </div>
        <div class="campaign-metric-item">
          <div class="campaign-metric-label">${metricA.label}</div>
          <div class="campaign-metric-value">${metricA.fmt(metricA.cur)}</div>
          <div class="campaign-metric-prev">vs ${metricA.fmt(metricA.prev)}</div>
        </div>
        <div class="campaign-metric-item">
          <div class="campaign-metric-label">CPL</div>
          <div class="campaign-metric-value">${cur.cpl > 0 ? '$'+cur.cpl.toFixed(2) : '—'}</div>
          <div class="campaign-metric-prev">vs ${prv.cpl > 0 ? '$'+prv.cpl.toFixed(2) : '—'}</div>
        </div>
        <div class="campaign-metric-item">
          <div class="campaign-metric-label">CPM</div>
          <div class="campaign-metric-value">$${cur.cpm.toFixed(2)}</div>
          <div class="campaign-metric-prev">vs $${prv.cpm.toFixed(2)}</div>
        </div>
      </div>
      ${sparkSvg}
      ${c.flag ? `<div class="campaign-flag">${c.flag}</div>` : ''}
    </div>
  `;
}

function renderCampaignGrid(containerId, filterFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const q = searchQuery.toLowerCase();
  const tf = typeFilter;
  const camps = dashboardData.campaigns.filter(c => {
    const matchQ = !q || c.name.toLowerCase().includes(q);
    const matchT = tf === 'all' || c.type === tf;
    return filterFn(c) && matchQ && matchT;
  });
  el.innerHTML = camps.length ? camps.map(c => makeCampaignCard(c, activeWeek)).join('') : '<div class="empty-state">No campaigns match your filters.</div>';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── CAMPAIGNS TABLE ─────────────────────────────────
let tableData = [];
let sortCol = 'spend';
let sortDir = 'desc';

function buildTableData() {
  const wk = activeWeek;
  const prev = getPrevWeek(wk);
  tableData = dashboardData.campaigns.map(c => {
    const cur = c.weekly[wk];
    const prv = c.weekly[prev];
    const spendPct = calcPct(cur.spend, prv.spend);
    return { ...c, _cur: cur, _prv: prv, _wow: spendPct };
  });
}

function filterTableData() {
  const q = searchQuery.toLowerCase();
  const tf = tableTypeFilter;
  return tableData.filter(c => {
    const matchQ = !q || c.name.toLowerCase().includes(q);
    const matchT = tf === 'all' || c.type === tf;
    return matchQ && matchT;
  });
}

function sortTableData(data) {
  return [...data].sort((a, b) => {
    let av, bv;
    if (sortCol === 'name') { av = a.name; bv = b.name; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortCol === 'type') { av = a.type; bv = b.type; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
    const colMap = { spend:'spend', impressions:'impressions', reach:'reach', frequency:'frequency', cpm:'cpm', leads:'leads', cpl:'cpl', wow:'_wow' };
    const key = colMap[sortCol] || sortCol;
    av = key === '_wow' ? (a._wow || 0) : (a._cur[key] || 0);
    bv = key === '_wow' ? (b._wow || 0) : (b._cur[key] || 0);
    return sortDir === 'asc' ? av - bv : bv - av;
  });
}

function renderTable() {
  buildTableData();
  const filtered = sortTableData(filterTableData());
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
  if (tablePage > pages) tablePage = pages;
  const slice = filtered.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

  setEl('tableInfo', `${total} campaign${total !== 1 ? 's' : ''} · Page ${tablePage} of ${pages}`);

  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = slice.map((c, i) => {
    const cur = c._cur;
    const prv = c._prv;
    const wow = c._wow;
    const wowStr = wow === null ? '—' : `${wow >= 0 ? '▲' : '▼'} ${Math.abs(wow).toFixed(1)}%`;
    const wowClass = wow === null ? '' : wow >= 0 ? 'wow-up' : 'wow-down';
    const cplClass = cur.cpl <= 0 ? '' : cur.cpl < 10 ? 'cpl-green' : cur.cpl < 30 ? 'cpl-yellow' : 'cpl-red';
    const freqClass = cur.frequency >= 3.5 ? 'freq-red' : cur.frequency >= 2.0 ? 'freq-orange' : '';

    return `<tr style="animation-delay:${i*0.02}s">
      <td class="campaign-name-cell" title="${escHtml(c.name)}">${escHtml(c.name)}</td>
      <td><span class="type-chip ${c.type}">${c.type.replace('_',' ')}</span></td>
      <td>$${cur.spend.toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td>${cur.impressions.toLocaleString()}</td>
      <td>${cur.reach.toLocaleString()}</td>
      <td class="${freqClass}">${cur.frequency.toFixed(2)}×</td>
      <td>$${cur.cpm.toFixed(2)}</td>
      <td>${cur.leads}</td>
      <td class="cpl-cell ${cplClass}">${cur.cpl > 0 ? '$'+cur.cpl.toFixed(2) : '—'}</td>
      <td class="${wowClass}">${wowStr}</td>
    </tr>`;
  }).join('');

  renderPagination(pages);
  updateSortHeaders();
}

function renderPagination(pages) {
  const el = document.getElementById('pagination');
  if (!el) return;
  let html = `<span class="pagination-info"></span>`;
  html += `<button class="page-btn" onclick="goPage(${tablePage-1})" ${tablePage<=1?'disabled':''}>‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && Math.abs(p - tablePage) > 2 && p !== 1 && p !== pages) {
      if (p === tablePage - 3 || p === tablePage + 3) html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${p===tablePage?'active':''}" onclick="goPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${tablePage+1})" ${tablePage>=pages?'disabled':''}>›</button>`;
  el.innerHTML = html;
}

function goPage(p) {
  tablePage = p;
  renderTable();
}
window.goPage = goPage;

function updateSortHeaders() {
  document.querySelectorAll('#campaignTable thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortCol) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ─── ALERTS ────────────────────────────────────────
function renderAlerts() {
  const el = document.getElementById('alertsGrid');
  if (!el) return;
  el.innerHTML = dashboardData.alerts.map(a => `
    <div class="alert-card ${a.type}">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-message">${a.message}</div>
        <div class="alert-action">→ ${a.action}</div>
      </div>
    </div>
  `).join('');
}

// ─── RECOMMENDATIONS ─────────────────────────────────
function renderRecommendations() {
  const el = document.getElementById('recsList');
  if (!el) return;
  el.innerHTML = dashboardData.recommendations.map(r => `
    <div class="rec-card">
      <div class="rec-priority">${r.priority}</div>
      <div class="rec-body">
        <div class="rec-title">${r.title}</div>
        <div class="rec-desc">${r.description}</div>
        <div class="rec-badges">
          <span class="rec-badge effort-${r.effort.toLowerCase()}">Effort: ${r.effort}</span>
          <span class="rec-badge impact-${r.impact.toLowerCase()}">Impact: ${r.impact}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── SECTION NAVIGATION ──────────────────────────────
const sectionNames = {
  overview: 'Overview',
  leadgen: 'Lead Generation',
  awareness: 'Reach & Awareness',
  campaigns: 'All Campaigns',
  alerts: 'Alerts & Actions',
  recommendations: 'Recommendations',
};

let currentSection = 'overview';

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('section-' + id);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${id}"]`);
  if (nav) nav.classList.add('active');
  setEl('headerTitle', sectionNames[id] || id);
  currentSection = id;

  // Rebuild section-specific charts
  if (id === 'leadgen') { buildCPLbyCampChart(); buildLeadVolChart(); renderCampaignGrid('leadgenGrid', c => c.type === 'lead_gen'); }
  if (id === 'awareness') { buildReachGrowthChart(); buildCPMTrendChart(); renderCampaignGrid('awarenessGrid', c => c.type === 'awareness' || c.type === 'traffic'); }
  if (id === 'campaigns') { renderCampaignGrid('allCampaignGrid', () => true); renderTable(); }
  if (id === 'alerts') renderAlerts();
  if (id === 'recommendations') renderRecommendations();

  // Close sidebar on mobile
  if (window.innerWidth < 900) closeSidebar();
}

// ─── SEARCH ──────────────────────────────────────────
let searchDebounce = null;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = e.target.value.trim();
    refreshCurrentSection();
  }, 120);
});

document.getElementById('typeFilter').addEventListener('change', e => {
  typeFilter = e.target.value;
  refreshCurrentSection();
});

document.getElementById('tableTypeFilter').addEventListener('change', e => {
  tableTypeFilter = e.target.value;
  tablePage = 1;
  renderTable();
});

document.getElementById('tableSortSelect').addEventListener('change', e => {
  sortCol = e.target.value;
  tablePage = 1;
  renderTable();
});

function refreshCurrentSection() {
  if (currentSection === 'campaigns') { renderCampaignGrid('allCampaignGrid', () => true); renderTable(); }
  if (currentSection === 'leadgen') renderCampaignGrid('leadgenGrid', c => c.type === 'lead_gen');
  if (currentSection === 'awareness') renderCampaignGrid('awarenessGrid', c => c.type === 'awareness' || c.type === 'traffic');
}

// ─── WEEK TOGGLE ─────────────────────────────────────
document.getElementById('weekSelector').addEventListener('change', e => {
  activeWeek = e.target.value;
  const label = activeWeek === 'current' ? dashboardData.meta.currentWeek : dashboardData.meta.previousWeek;
  setEl('weekLabel', label);
  renderKPIs();
  renderSnapshot();
  buildCPLChart();
  buildCampaignChart();
  refreshCurrentSection();
});

// ─── TABLE SORT ───────────────────────────────────────
document.querySelectorAll('#campaignTable thead th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (!col) return;
    if (sortCol === col) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortCol = col;
      sortDir = 'desc';
    }
    tablePage = 1;
    renderTable();
  });
});

// ─── CPL TOGGLE ──────────────────────────────────────
document.getElementById('cplToggle').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#cplToggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cplMode = btn.dataset.mode;
  buildCPLChart();
});

// ─── CAMPAIGN METRIC TOGGLE ───────────────────────────
document.getElementById('campToggle').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#campToggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  campMetric = btn.dataset.metric;
  buildCampaignChart();
});

// ─── SIDEBAR NAV ──────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => showSection(item.dataset.section));
});

// ─── HAMBURGER ────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

document.getElementById('hamburgerBtn').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', closeSidebar);

// ─── INIT ─────────────────────────────────────────────
function init() {
  renderKPIs();
  renderSnapshot();
  renderSummaryCard();
  buildCPLChart();
  buildCampaignChart();
  buildTrendChart();
  renderAlerts();
  renderRecommendations();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
