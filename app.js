/* ═══════════════════════════════════════════════════════════════
   EduInsight — app.js  (Rendering Engine)
   Requires: data.js (ANALYTICS global), Chart.js v4
   ═══════════════════════════════════════════════════════════════ */
'use strict';

// ── Chart defaults ───────────────────────────────────────────────────────────
Chart.defaults.color = '#94A3B8';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 12;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(13,19,38,0.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;

// ── Chart registry ───────────────────────────────────────────────────────────
const charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ── Filter state ─────────────────────────────────────────────────────────────
const state = { school: 'All', gender: 'All', motiv: 'All' };

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = {
    purple: '#7C3AED', blue: '#0EA5E9', teal: '#06B6D4',
    amber: '#F59E0B', red: '#EF4444', green: '#10B981',
    indigo: '#6366F1', pink: '#EC4899',
};

const PERSONA_COLORS = ANALYTICS.clusters.map(c => c.color);

// ── Scatter persona color map ─────────────────────────────────────────────────
const scatterColors = {
    0: 'rgba(124,58,237,0.7)',
    1: 'rgba(14,165,233,0.7)',
    2: 'rgba(245,158,11,0.7)',
    3: 'rgba(239,68,68,0.7)',
    4: 'rgba(16,185,129,0.7)',
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILTERING LOGIC — in a real implementation we'd re-run analytics on filtered
// data. Here we use pre-computed global stats and filter the scatter/risk table.
// ═══════════════════════════════════════════════════════════════════════════════

/** Filter scatter data by current state */
function filteredScatter() {
    return ANALYTICS.scatter.filter(r => {
        const ok_school = state.school === 'All'; // scatter has no school field — skip
        return true; // scatter is a sample; we render it as-is for performance
    });
}

/** Filter risk table */
function filteredRisk() {
    return ANALYTICS.risk_table.filter(r => {
        if (state.school !== 'All' && r.school !== state.school) return false;
        if (state.gender !== 'All' && r.gender !== state.gender) return false;
        if (state.motiv !== 'All' && r.motiv !== state.motiv) return false;
        return true;
    });
}

/** Approximate student count from filter (proportional) */
function estimateCount() {
    const tot = ANALYTICS.kpis.total;
    let frac = 1;
    if (state.school !== 'All') {
        const s = ANALYTICS.by_school[state.school];
        frac *= s ? s.count / tot : 1;
    }
    if (state.gender !== 'All') {
        const g = ANALYTICS.by_gender[state.gender];
        frac *= g ? g.count / tot : 1;
    }
    if (state.motiv !== 'All') {
        const m = ANALYTICS.by_motiv[state.motiv];
        frac *= m ? m.count / tot : 1;
    }
    return Math.round(tot * frac);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: KPI Cards
// ═══════════════════════════════════════════════════════════════════════════════
function renderKPIs() {
    const kpi = ANALYTICS.kpis;
    document.getElementById('kv-total').textContent = Number(estimateCount()).toLocaleString();
    document.getElementById('kv-score').textContent = kpi.avg_score;
    document.getElementById('kv-attend').textContent = kpi.avg_attend + '%';
    document.getElementById('kv-risk').textContent = kpi.high_risk.toLocaleString();
    document.getElementById('kv-hours').textContent = kpi.avg_hours + 'h';
    document.getElementById('kv-cluster').textContent = kpi.top_cluster;
    document.getElementById('student-count').textContent = Number(estimateCount()).toLocaleString() + ' students';
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: Persona Cards
// ═══════════════════════════════════════════════════════════════════════════════
let activePersona = null;

function renderPersonas() {
    const grid = document.getElementById('persona-grid');
    grid.innerHTML = '';
    ANALYTICS.clusters.forEach(c => {
        const pct = ((c.count / ANALYTICS.kpis.total) * 100).toFixed(1);
        const div = document.createElement('div');
        div.className = 'persona-card';
        div.dataset.id = c.id;
        div.style.setProperty('--accent-color', c.color);
        div.innerHTML = `
      <span class="persona-icon">${c.icon}</span>
      <div class="persona-name">${c.name}</div>
      <div class="persona-desc">${c.description}</div>
      <div class="persona-stats">
        <div class="persona-stat">
          <span class="persona-stat-label">Avg Score</span>
          <span class="persona-stat-val">${c.avg_score}</span>
        </div>
        <div class="persona-stat">
          <span class="persona-stat-label">Avg Attendance</span>
          <span class="persona-stat-val">${c.avg_attend}%</span>
        </div>
        <div class="persona-stat">
          <span class="persona-stat-label">Study Hours</span>
          <span class="persona-stat-val">${c.avg_hours}h/wk</span>
        </div>
        <div class="persona-stat">
          <span class="persona-stat-label">High-Risk</span>
          <span class="persona-stat-val" style="color:#fca5a5">${c.risk_high}</span>
        </div>
      </div>
      <div class="persona-count-badge">${c.count.toLocaleString()} students · ${pct}%</div>
    `;
        div.addEventListener('click', () => selectPersona(c));
        grid.appendChild(div);
    });
}

function selectPersona(c) {
    // If same card clicked, toggle off
    if (activePersona === c.id) {
        activePersona = null;
        document.querySelectorAll('.persona-card').forEach(el => el.classList.remove('active'));
        document.getElementById('strategy-section').style.display = 'none';
        return;
    }
    activePersona = c.id;
    document.querySelectorAll('.persona-card').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.id) === c.id);
    });
    // Render strategy panel
    document.getElementById('strategy-icon').textContent = c.icon;
    document.getElementById('strategy-title').textContent = `Teaching Strategies: ${c.name}`;
    document.getElementById('strategy-subtitle').textContent = c.description;
    const tips = document.getElementById('strategy-tips');
    tips.innerHTML = c.strategies.map((s, i) => `
    <div class="strategy-tip">
      <div class="tip-num">${i + 1}</div>
      <div class="tip-text">${s}</div>
    </div>
  `).join('');
    document.getElementById('strategy-section').style.display = '';
    document.getElementById('strategy-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('close-strategy').addEventListener('click', () => {
    activePersona = null;
    document.querySelectorAll('.persona-card').forEach(el => el.classList.remove('active'));
    document.getElementById('strategy-section').style.display = 'none';
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: Risk Table
// ═══════════════════════════════════════════════════════════════════════════════
function renderRiskSummary() {
    document.getElementById('risk-high-count').textContent = ANALYTICS.kpis.high_risk.toLocaleString();
    document.getElementById('risk-med-count').textContent = ANALYTICS.kpis.medium_risk.toLocaleString();
    document.getElementById('risk-low-count').textContent = ANALYTICS.kpis.low_risk.toLocaleString();
}

function renderRiskTable() {
    const rows = filteredRisk();
    const tbody = document.getElementById('risk-tbody');
    tbody.innerHTML = rows.map((r, i) => {
        const p = ANALYTICS.clusters[r.persona];
        return `<tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td>
        <span style="margin-right:4px">${p.icon}</span>
        <span style="color:${p.color};font-weight:600;font-size:0.73rem">${p.name}</span>
      </td>
      <td>${r.school}</td>
      <td>${r.gender}</td>
      <td style="font-weight:700;color:${r.score < 62 ? '#fca5a5' : 'var(--text-primary)'}">${r.score}</td>
      <td style="color:${r.attend < 70 ? '#fcd34d' : 'var(--text-secondary)'}">${r.attend}%</td>
      <td>${r.hours}h</td>
      <td><span class="motiv-pill ${r.motiv}">${r.motiv}</span></td>
      <td><span class="net-dot ${r.internet}"></span>${r.internet}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:${r.risk_score * 8}px;height:6px;background:linear-gradient(90deg,#ef4444,#fca5a5);border-radius:99px;min-width:4px"></div>
          <span style="font-weight:700">${r.risk_score}</span>
        </div>
      </td>
      <td><span class="risk-pill ${r.risk}">${r.risk}</span></td>
    </tr>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: All Charts
// ═══════════════════════════════════════════════════════════════════════════════

const gridOpts = {
    color: 'rgba(255,255,255,0.05)',
    drawBorder: false,
};

function makeBar(id, labels, datasets, opts = {}) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: opts.horizontal ? 'bar' : 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: opts.horizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: opts.legend ?? false },
                tooltip: { mode: 'index', intersect: false },
            },
            scales: {
                x: { grid: gridOpts, ticks: { color: '#94A3B8' }, ...(opts.xScale || {}) },
                y: { grid: gridOpts, ticks: { color: '#94A3B8' }, ...(opts.yScale || {}) },
            },
            animation: { duration: 600, easing: 'easeOutQuart' },
        }
    });
}

function chartCorrelation() {
    const corr = ANALYTICS.correlations;
    const labels = Object.keys(corr);
    const values = Object.values(corr);
    const colors = values.map(v =>
        v > 0.2 ? 'rgba(16,185,129,0.8)' :
            v > 0.05 ? 'rgba(14,165,233,0.7)' :
                v < -0.1 ? 'rgba(239,68,68,0.75)' :
                    'rgba(148,163,184,0.5)'
    );
    makeBar('chart-correlation', labels,
        [{
            label: 'Correlation', data: values, backgroundColor: colors,
            borderRadius: 6, borderSkipped: false
        }],
        {
            horizontal: true,
            yScale: { ticks: { font: { size: 11 } } },
            xScale: {
                min: -0.4, max: 0.5,
                ticks: { callback: v => v.toFixed(2) }
            }
        }
    );
}

function chartScoreDist() {
    const d = ANALYTICS.score_dist;
    makeBar('chart-score-dist', d.labels, [{
        label: 'Students',
        data: d.counts,
        backgroundColor: 'rgba(124,58,237,0.6)',
        borderColor: 'rgba(167,139,250,0.9)',
        borderWidth: 1,
        borderRadius: 5,
        borderSkipped: false,
    }], { xScale: { ticks: { font: { size: 10 } } } });
}

function chartAttendScore() {
    const d = ANALYTICS.attend_score;
    makeBar('chart-attend-score',
        d.map(x => x.label),
        [{
            label: 'Avg Score',
            data: d.map(x => x.avg_score),
            backgroundColor: d.map(x =>
                x.label === '<60%' ? 'rgba(239,68,68,0.7)' :
                    x.label === '60-70%' ? 'rgba(245,158,11,0.7)' :
                        x.label === '70-80%' ? 'rgba(14,165,233,0.7)' :
                            x.label === '80-90%' ? 'rgba(16,185,129,0.65)' :
                                'rgba(16,185,129,0.85)'
            ),
            borderRadius: 8, borderSkipped: false,
        }],
        { yScale: { min: 60, max: 80 } }
    );
}

function chartHourScore() {
    const d = ANALYTICS.hour_score;
    makeBar('chart-hour-score',
        d.map(x => x.label),
        [{
            label: 'Avg Score',
            data: d.map(x => x.avg_score),
            backgroundColor: 'rgba(6,182,212,0.65)',
            borderColor: 'rgba(6,182,212,0.9)',
            borderWidth: 1,
            borderRadius: 8, borderSkipped: false,
        }],
        { yScale: { min: 60, max: 80 } }
    );
}

function chartScatter() {
    destroyChart('chart-scatter');
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    const byPersona = {};
    ANALYTICS.scatter.forEach(r => {
        if (!byPersona[r.persona]) byPersona[r.persona] = [];
        byPersona[r.persona].push({ x: r.x, y: r.y });
    });
    const datasets = Object.entries(byPersona).map(([pid, pts]) => ({
        label: ANALYTICS.clusters[+pid]?.name || `Persona ${pid}`,
        data: pts,
        backgroundColor: scatterColors[+pid] || 'rgba(255,255,255,0.4)',
        pointRadius: 3,
        pointHoverRadius: 5,
    }));
    charts['chart-scatter'] = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
                tooltip: {
                    callbacks: { label: ctx => `Attendance: ${ctx.parsed.x}% | Score: ${ctx.parsed.y}` }
                }
            },
            scales: {
                x: {
                    grid: gridOpts, title: { display: true, text: 'Attendance (%)', color: '#64748b' },
                    min: 55, max: 100, ticks: { color: '#94A3B8' }
                },
                y: {
                    grid: gridOpts, title: { display: true, text: 'Exam Score', color: '#64748b' },
                    min: 55, ticks: { color: '#94A3B8' }
                },
            },
            animation: { duration: 500 },
        }
    });
}

function chartRiskDonut() {
    destroyChart('chart-risk-donut');
    const ctx = document.getElementById('chart-risk-donut').getContext('2d');
    const kpi = ANALYTICS.kpis;
    charts['chart-risk-donut'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['High Risk', 'Medium Risk', 'Low Risk'],
            datasets: [{
                data: [kpi.high_risk, kpi.medium_risk, kpi.low_risk],
                backgroundColor: ['rgba(239,68,68,0.75)', 'rgba(245,158,11,0.7)', 'rgba(16,185,129,0.7)'],
                borderColor: ['rgba(239,68,68,0.2)', 'rgba(245,158,11,0.2)', 'rgba(16,185,129,0.2)'],
                borderWidth: 1,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } } },
            animation: { duration: 600 }
        }
    });
}

function chartRiskPersona() {
    const labels = ANALYTICS.clusters.map(c => c.name);
    const values = ANALYTICS.clusters.map(c => c.risk_high);
    const colors = ANALYTICS.clusters.map(c => c.color + 'AA');
    makeBar('chart-risk-persona', labels,
        [{
            label: 'High-Risk Students', data: values, backgroundColor: colors,
            borderRadius: 6, borderSkipped: false
        }],
        { xScale: { ticks: { font: { size: 10 } } } }
    );
}

function chartSchool() {
    const d = ANALYTICS.by_school;
    const labels = Object.keys(d);
    makeBar('chart-school', labels, [
        {
            label: 'Avg Score', data: labels.map(k => d[k].avg_score),
            backgroundColor: ['rgba(124,58,237,0.7)', 'rgba(14,165,233,0.7)'],
            borderRadius: 8, borderSkipped: false
        },
        {
            label: 'Avg Hours', data: labels.map(k => d[k].avg_hours),
            backgroundColor: ['rgba(124,58,237,0.3)', 'rgba(14,165,233,0.3)'],
            borderRadius: 8, borderSkipped: false
        },
    ], { legend: true, yScale: { min: 0 } });
}

function chartGender() {
    const d = ANALYTICS.by_gender;
    const labels = Object.keys(d);
    makeBar('chart-gender', labels, [
        {
            label: 'Avg Score', data: labels.map(k => d[k].avg_score),
            backgroundColor: ['rgba(99,102,241,0.75)', 'rgba(236,72,153,0.75)'],
            borderRadius: 8, borderSkipped: false
        },
        {
            label: 'Avg Hours', data: labels.map(k => d[k].avg_hours),
            backgroundColor: ['rgba(99,102,241,0.3)', 'rgba(236,72,153,0.3)'],
            borderRadius: 8, borderSkipped: false
        },
    ], { legend: true, yScale: { min: 0 } });
}

function chartMotiv() {
    const d = ANALYTICS.by_motiv;
    const order = ['Low', 'Medium', 'High'];
    const labels = order.filter(k => d[k]);
    makeBar('chart-motiv', labels, [
        {
            label: 'Avg Score', data: labels.map(k => d[k].avg_score),
            backgroundColor: ['rgba(239,68,68,0.7)', 'rgba(245,158,11,0.7)', 'rgba(16,185,129,0.7)'],
            borderRadius: 8, borderSkipped: false
        },
        {
            label: 'Avg Attend', data: labels.map(k => d[k].avg_attend),
            backgroundColor: ['rgba(239,68,68,0.25)', 'rgba(245,158,11,0.25)', 'rgba(16,185,129,0.25)'],
            borderRadius: 8, borderSkipped: false
        },
    ], { legend: true, yScale: { min: 0 } });
}

function chartParent() {
    const d = ANALYTICS.by_parent;
    const order = ['Low', 'Medium', 'High'];
    const labels = order.filter(k => d[k]);
    makeBar('chart-parent', labels, [
        {
            label: 'Avg Score', data: labels.map(k => d[k].avg_score),
            backgroundColor: [
                'rgba(239,68,68,0.7)', 'rgba(14,165,233,0.7)', 'rgba(16,185,129,0.7)'
            ],
            borderRadius: 8, borderSkipped: false
        },
    ], { yScale: { min: 60, max: 80 } });
}

function chartIncome() {
    const d = ANALYTICS.by_income;
    const order = ['Low', 'Medium', 'High'];
    const labels = order.filter(k => d[k]);
    makeBar('chart-income', labels, [
        {
            label: 'Avg Score', data: labels.map(k => d[k].avg_score),
            backgroundColor: ['rgba(239,68,68,0.7)', 'rgba(245,158,11,0.7)', 'rgba(16,185,129,0.7)'],
            borderRadius: 8, borderSkipped: false
        },
    ], { yScale: { min: 60, max: 80 } });
}

function chartResources() {
    const d = ANALYTICS.by_resources;
    const order = ['Low', 'Medium', 'High'];
    const labels = order.filter(k => d[k]);
    makeBar('chart-resources', labels, [
        {
            label: 'Avg Score', data: labels.map(k => d[k].avg_score),
            backgroundColor: ['rgba(239,68,68,0.7)', 'rgba(245,158,11,0.7)', 'rgba(16,185,129,0.7)'],
            borderRadius: 8, borderSkipped: false
        },
    ], { yScale: { min: 60, max: 80 } });
}

function chartRadar() {
    destroyChart('chart-radar');
    const ctx = document.getElementById('chart-radar').getContext('2d');
    // Normalize cluster values to 0-100 scale for radar
    const features = ['avg_score', 'avg_attend', 'avg_hours', 'avg_tutor', 'avg_sleep', 'avg_prev'];
    const fLabels = ['Exam Score', 'Attendance', 'Study Hours', 'Tutoring', 'Sleep Hours', 'Prev Scores'];
    const maxVals = features.map(f => Math.max(...ANALYTICS.clusters.map(c => c[f])));
    const minVals = features.map(f => Math.min(...ANALYTICS.clusters.map(c => c[f])));
    const normalize = (v, i) => {
        const range = maxVals[i] - minVals[i] || 1;
        return Math.round(((v - minVals[i]) / range) * 100);
    };
    const datasets = ANALYTICS.clusters.map(c => ({
        label: c.icon + ' ' + c.name,
        data: features.map((f, i) => normalize(c[f], i)),
        borderColor: c.color,
        backgroundColor: c.color + '22',
        pointBackgroundColor: c.color,
        pointRadius: 4,
        borderWidth: 2,
    }));
    charts['chart-radar'] = new Chart(ctx, {
        type: 'radar',
        data: { labels: fLabels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0, max: 100,
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { display: false },
                    pointLabels: { color: '#94A3B8', font: { size: 11 } },
                    angleLines: { color: 'rgba(255,255,255,0.06)' },
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 10 } } }
            },
            animation: { duration: 700 }
        }
    });
}

function chartPersonaScore() {
    const labels = ANALYTICS.clusters.map(c => c.icon + ' ' + c.name);
    const values = ANALYTICS.clusters.map(c => c.avg_score);
    const colors = ANALYTICS.clusters.map(c => c.color + 'BB');
    makeBar('chart-persona-score', labels, [
        {
            label: 'Avg Exam Score', data: values, backgroundColor: colors,
            borderRadius: 10, borderSkipped: false
        }
    ], { yScale: { min: 60, max: 80 }, xScale: { ticks: { font: { size: 10 } } } });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL RENDER
// ═══════════════════════════════════════════════════════════════════════════════
function renderAll() {
    renderKPIs();
    renderRiskSummary();
    renderRiskTable();
    chartCorrelation();
    chartScoreDist();
    chartAttendScore();
    chartHourScore();
    chartScatter();
    chartRiskDonut();
    chartRiskPersona();
    chartSchool();
    chartGender();
    chartMotiv();
    chartParent();
    chartIncome();
    chartResources();
    chartRadar();
    chartPersonaScore();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('filter-school').addEventListener('change', e => {
    state.school = e.target.value;
    renderAll();
});
document.getElementById('filter-gender').addEventListener('change', e => {
    state.gender = e.target.value;
    renderAll();
});
document.getElementById('filter-motiv').addEventListener('change', e => {
    state.motiv = e.target.value;
    renderAll();
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    renderPersonas();
    renderAll();
});
