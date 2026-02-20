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
// PERSONA CLASSIFICATION — Strict score-first rules aligned to cluster averages:
//   Cluster  │ Avg Score │ Avg Attendance │ Definition
//   ─────────┼───────────┼────────────────┼───────────────────────────────────
//   0 DA     │  70.03    │   89.83 %      │ Current top performer
//   1 CW     │  68.37    │   89.03 %      │ Reliable, consistent, solid attend.
//   2 PC     │  68.23    │   88.14 %      │ Capable but coasting
//   3 SL     │  64.55    │   69.03 %      │ Struggling — low score & attend.
//   4 PB     │  65.84    │   69.76 %      │ High prev score, low current output
// ═══════════════════════════════════════════════════════════════════════════════

function resolvePersona(s, kmeansId) {
    const score = s.score ?? s.Exam_Score ?? 0;
    const attend = s.attend ?? s.Attendance ?? 0;
    const motiv = s.motiv ?? s.Motivation_Level ?? 'Medium';
    const hours = s.hours ?? s.Hours_Studied ?? 20;
    const prev = s.prev ?? s.Previous_Scores ?? 70;

    // ══════════════════════════════════════════════════════════
    // HARD SCORE GATES — applied BEFORE per-cluster logic
    // A student's current exam score is the primary truth signal.
    // ══════════════════════════════════════════════════════════

    // Score < 63 → never a Driven Achiever or Consistent Worker
    if (score < 63) {
        if (prev >= 78) return 4; // Potential Bloomer (had strong past, slipped)
        return 3;                 // Struggling Learner
    }

    // Score 63–69 → cannot be Driven Achiever (cluster avg is 70.03)
    if (score < 70) {
        // High attendance saves them to Consistent Worker
        if (attend >= 85) return 1; // Consistent Worker
        // Was once good (high prev) but now underperforming
        if (prev >= 80 && score < prev - 8) return 4; // Potential Bloomer
        // Typical mid-range
        if (attend >= 75) return 2; // Passive Coaster
        // Low attendance → struggling
        if (attend < 72) return 3; // Struggling Learner
        return 2; // Passive Coaster (default mid-range)
    }

    // Score 70–74 → can be Driven Achiever only with solid attendance
    if (score < 75) {
        if (attend >= 82) return 0; // Driven Achiever
        if (attend >= 72) return 1; // Consistent Worker
        if (prev >= 78) return 4; // Potential Bloomer (dropping in)
        return 3;                   // Struggling Learner
    }

    // Score ≥ 75 → Driven Achiever (regardless of other factors)
    return 0;
}

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

// Toggle: show all students or only high-risk
let showAllStudents = false;

/** Filter risk table — uses all_students when toggle is on */
function filteredRisk() {
    const source = showAllStudents
        ? (ANALYTICS.all_students || ANALYTICS.risk_table)
        : ANALYTICS.risk_table;
    return source.filter(r => {
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

    // Render / update the toggle button group
    const container = document.getElementById('risk-view-toggle');
    if (!container) return;
    const total = (ANALYTICS.all_students || ANALYTICS.risk_table).length;
    container.innerHTML = `
      <button id="btn-view-highrisk" class="view-toggle-btn ${!showAllStudents ? 'active' : ''}"
              title="Show only high-risk students">
        ⚠️ High-Risk Only &nbsp;<span class="toggle-count">${ANALYTICS.kpis.high_risk.toLocaleString()}</span>
      </button>
      <button id="btn-view-all" class="view-toggle-btn ${showAllStudents ? 'active' : ''}"
              title="Show all students">
        👥 All Students &nbsp;<span class="toggle-count">${total.toLocaleString()}</span>
      </button>
    `;
    container.querySelector('#btn-view-highrisk').addEventListener('click', () => {
        if (showAllStudents) { showAllStudents = false; currentRiskPage = 1; renderRiskSummary(); renderRiskTable(); }
    });
    container.querySelector('#btn-view-all').addEventListener('click', () => {
        if (!showAllStudents) { showAllStudents = true; currentRiskPage = 1; renderRiskSummary(); renderRiskTable(); }
    });
}

let riskSortCol = 'risk_score';
let riskSortAsc = false;
let currentRiskPage = 1;
const rowsPerRiskPage = 50;

function renderRiskTable() {
    let rows = filteredRisk();

    // Perform sorting
    rows.sort((a, b) => {
        let valA = a[riskSortCol];
        let valB = b[riskSortCol];

        if (riskSortCol === 'persona') {
            // Sort by resolved persona — rank from best to worst
            const rank = {
                'Driven Achiever': 0,
                'Consistent Worker': 1,
                'Potential Bloomer': 2,
                'Passive Coaster': 3,
                'Struggling Learner': 4
            };
            valA = rank[ANALYTICS.clusters[resolvePersona(a, a.persona)]?.name] ?? 5;
            valB = rank[ANALYTICS.clusters[resolvePersona(b, b.persona)]?.name] ?? 5;
        } else if (riskSortCol === 'risk') {
            const m = { 'Low Risk': 0, 'Medium Risk': 1, 'High Risk': 2 };
            valA = m[a.risk] || 0;
            valB = m[b.risk] || 0;
        } else if (riskSortCol === 'internet') {
            valA = a.internet === 'Yes' ? 1 : 0;
            valB = b.internet === 'Yes' ? 1 : 0;
        } else if (riskSortCol === 'motiv') {
            const m = { 'Low': 0, 'Medium': 1, 'High': 2 };
            valA = m[a.motiv] || 0;
            valB = m[b.motiv] || 0;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return riskSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        if (valA < valB) return riskSortAsc ? -1 : 1;
        if (valA > valB) return riskSortAsc ? 1 : -1;
        return 0;
    });

    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / rowsPerRiskPage);
    if (currentRiskPage > totalPages) currentRiskPage = totalPages;
    if (currentRiskPage < 1) currentRiskPage = 1;

    const startIdx = (currentRiskPage - 1) * rowsPerRiskPage;
    const endIdx = startIdx + rowsPerRiskPage;
    const pageRows = rows.slice(startIdx, endIdx);

    // Update Pagination UI
    document.getElementById('pagination-info').textContent = totalRows > 0
        ? `Showing ${startIdx + 1}-${Math.min(endIdx, totalRows)} of ${totalRows}`
        : 'Showing 0-0 of 0';

    document.getElementById('btn-prev-page').disabled = currentRiskPage === 1;
    document.getElementById('btn-next-page').disabled = currentRiskPage === totalPages || totalPages === 0;

    const tbody = document.getElementById('risk-tbody');
    tbody.innerHTML = pageRows.map((r, i) => {
        const resolvedId = resolvePersona(r, r.persona);
        const p = ANALYTICS.clusters[resolvedId];
        const displayIndex = startIdx + i + 1;
        return `<tr>
      <td style="color:var(--text-muted)">${displayIndex}</td>
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
// ADD STUDENT PREDICITON LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

const addModal = document.getElementById('add-modal');
const btnAdd = document.getElementById('btn-add-student');
const btnClose = document.getElementById('close-modal');

btnAdd.addEventListener('click', () => {
    addModal.style.display = 'flex';
    document.getElementById('prediction-result').style.display = 'none';
});

btnClose.addEventListener('click', () => {
    addModal.style.display = 'none';
});

// Close modal when clicking outside
addModal.addEventListener('click', (e) => {
    if (e.target === addModal) addModal.style.display = 'none';
});

document.getElementById('add-student-form').addEventListener('submit', (e) => {
    e.preventDefault();

    // 1. Collect inputs
    const student = {
        Hours_Studied: parseFloat(document.getElementById('inp-hours').value),
        Attendance: parseFloat(document.getElementById('inp-attend').value),
        Sleep_Hours: parseFloat(document.getElementById('inp-sleep').value),
        Previous_Scores: parseFloat(document.getElementById('inp-prev').value),
        Tutoring_Sessions: parseFloat(document.getElementById('inp-tutor').value),
        Physical_Activity: parseFloat(document.getElementById('inp-phys').value),
        Motivation_Level: document.getElementById('inp-motiv').value,
        Internet_Access: document.getElementById('inp-internet').value,
        Learning_Disabilities: document.getElementById('inp-disable').value,
        Peer_Influence: document.getElementById('inp-peer').value,
        Exam_Score: parseFloat(document.getElementById('inp-score').value)
    };

    // 2. Predict Persona (K-Means distance to centers)
    const features = ['Hours_Studied', 'Attendance', 'Sleep_Hours', 'Previous_Scores', 'Tutoring_Sessions', 'Physical_Activity'];
    const norm_stats = ANALYTICS.norm_stats;
    const centers = ANALYTICS.centers;

    // Normalize input
    const norm_input = features.map(f => {
        const val = student[f];
        const min = norm_stats[f][0];
        const range = norm_stats[f][1];
        return (val - min) / range;
    });

    // Find closest center
    let closestPersonaId = -1;
    let minDistance = Infinity;

    for (const [p_idx, center] of Object.entries(centers)) {
        let distSq = 0;
        for (let i = 0; i < center.length; i++) {
            distSq += Math.pow(norm_input[i] - center[i], 2);
        }
        const dist = Math.sqrt(distSq);
        if (dist < minDistance) {
            minDistance = dist;
            closestPersonaId = p_idx;
        }
    }

    // Validate K-means persona against actual traits
    const studentTraits = {
        score: student.Exam_Score,
        attend: student.Attendance,
        motiv: student.Motivation_Level,
        hours: student.Hours_Studied,
        prev: student.Previous_Scores,
        risk_score: 0 // will calculate below
    };
    closestPersonaId = resolvePersona(studentTraits, +closestPersonaId);
    const predictedPersona = ANALYTICS.personas[closestPersonaId];

    // 3. Predict Risk Score (Rule-based)
    let risk_score = 0;
    if (student.Attendance < 70.0) risk_score += 2;
    else if (student.Attendance < 80.0) risk_score += 1;

    if (student.Motivation_Level === 'Low') risk_score += 2;
    else if (student.Motivation_Level === 'Medium') risk_score += 1;

    if (student.Exam_Score < 62.0) risk_score += 2;
    else if (student.Exam_Score < 67.0) risk_score += 1;

    if (student.Internet_Access === 'No') risk_score += 1;
    if (student.Learning_Disabilities === 'Yes') risk_score += 1;
    if (student.Hours_Studied < 10.0) risk_score += 1;
    if (student.Peer_Influence === 'Negative') risk_score += 1;

    let risk_label = 'Low';
    let risk_color = '#6ee7b7';
    if (risk_score >= 5) { risk_label = 'High Risk'; risk_color = '#fca5a5'; }
    else if (risk_score >= 3) { risk_label = 'Medium Risk'; risk_color = '#fcd34d'; }

    // 4. Update UI Context
    document.getElementById('pred-persona').innerHTML = `<span style="font-size:1.8rem; margin-right:8px">${predictedPersona.icon}</span> <span style="color:${predictedPersona.color}">${predictedPersona.name}</span>`;

    document.getElementById('pred-risk').innerHTML = `
        <div style="font-size:1.5rem; font-weight:900; color:${risk_color}">${risk_score}/10</div>
        <div style="font-size:0.8rem; font-weight:700; color:${risk_color}; margin-top:-2px">${risk_label}</div>
    `;

    document.getElementById('prediction-result').style.display = 'block';
});

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH STUDENT UPLOAD LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

// Tab Switching
document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        const targetId = e.target.getAttribute('data-target');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
    });
});

// CSV Processing
let batchPredictions = [];

document.getElementById('inp-csv').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('csv-filename').textContent = file.name;
    document.getElementById('csv-filename').style.display = 'block';

    const reader = new FileReader();
    reader.onload = function (event) {
        processCSV(event.target.result);
    };
    reader.readAsText(file);
});

function processCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return alert("CSV file seems empty or invalid.");

    const headers = lines[0].split(',').map(h => h.trim());
    const expectedHeaders = [
        'Hours_Studied', 'Attendance', 'Sleep_Hours', 'Previous_Scores',
        'Tutoring_Sessions', 'Physical_Activity', 'Motivation_Level',
        'Internet_Access', 'Learning_Disabilities', 'Peer_Influence', 'Exam_Score'
    ];

    const indices = {};
    for (const header of expectedHeaders) {
        const idx = headers.indexOf(header);
        if (idx === -1) return alert(`CSV is missing required column: ${header}`);
        indices[header] = idx;
    }

    batchPredictions = [];

    for (let i = 1; i < lines.length; i++) {
        // Quick regex to handle CSV splitting preserving quotes if needed, 
        // but simple split is ok for our generated Dataset as there are no commas in fields.
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < expectedHeaders.length) continue;

        const student = {
            Hours_Studied: parseFloat(cols[indices['Hours_Studied']]),
            Attendance: parseFloat(cols[indices['Attendance']]),
            Sleep_Hours: parseFloat(cols[indices['Sleep_Hours']]),
            Previous_Scores: parseFloat(cols[indices['Previous_Scores']]),
            Tutoring_Sessions: parseFloat(cols[indices['Tutoring_Sessions']]),
            Physical_Activity: parseFloat(cols[indices['Physical_Activity']]),
            Motivation_Level: cols[indices['Motivation_Level']],
            Internet_Access: cols[indices['Internet_Access']],
            Learning_Disabilities: cols[indices['Learning_Disabilities']],
            Peer_Influence: cols[indices['Peer_Influence']],
            Exam_Score: parseFloat(cols[indices['Exam_Score']])
        };

        batchPredictions.push(predictStudent(student));
    }
    renderBatchResults();
}

function predictStudent(student) {
    const features = ['Hours_Studied', 'Attendance', 'Sleep_Hours', 'Previous_Scores', 'Tutoring_Sessions', 'Physical_Activity'];
    const norm_stats = ANALYTICS.norm_stats;
    const centers = ANALYTICS.centers;

    const norm_input = features.map(f => {
        const val = student[f] || 0;
        const min = norm_stats[f][0];
        const range = norm_stats[f][1];
        return (val - min) / range;
    });

    let closestPersonaId = -1;
    let minDistance = Infinity;

    for (const [p_idx, center] of Object.entries(centers)) {
        let distSq = 0;
        for (let i = 0; i < center.length; i++) {
            distSq += Math.pow(norm_input[i] - center[i], 2);
        }
        const dist = Math.sqrt(distSq);
        if (dist < minDistance) {
            minDistance = dist;
            closestPersonaId = p_idx;
        }
    }

    // Calculate risk score first so resolvePersona can use it
    let pre_risk = 0;
    if (student.Attendance < 70.0) pre_risk += 2;
    else if (student.Attendance < 80.0) pre_risk += 1;
    if (student.Motivation_Level === 'Low') pre_risk += 2;
    else if (student.Motivation_Level === 'Medium') pre_risk += 1;
    if (student.Exam_Score < 62.0) pre_risk += 2;
    else if (student.Exam_Score < 67.0) pre_risk += 1;
    if (student.Internet_Access === 'No') pre_risk += 1;
    if (student.Learning_Disabilities === 'Yes') pre_risk += 1;
    if (student.Hours_Studied < 10.0) pre_risk += 1;
    if (student.Peer_Influence === 'Negative') pre_risk += 1;

    // Validate K-means persona against actual traits
    const studentTraits = {
        score: student.Exam_Score,
        attend: student.Attendance,
        motiv: student.Motivation_Level,
        hours: student.Hours_Studied,
        prev: student.Previous_Scores,
        risk_score: pre_risk
    };
    closestPersonaId = resolvePersona(studentTraits, +closestPersonaId);
    const predictedPersona = ANALYTICS.personas[closestPersonaId];

    let risk_score = 0;
    if (student.Attendance < 70.0) risk_score += 2;
    else if (student.Attendance < 80.0) risk_score += 1;

    if (student.Motivation_Level === 'Low') risk_score += 2;
    else if (student.Motivation_Level === 'Medium') risk_score += 1;

    if (student.Exam_Score < 62.0) risk_score += 2;
    else if (student.Exam_Score < 67.0) risk_score += 1;

    if (student.Internet_Access === 'No') risk_score += 1;
    if (student.Learning_Disabilities === 'Yes') risk_score += 1;
    if (student.Hours_Studied < 10.0) risk_score += 1;
    if (student.Peer_Influence === 'Negative') risk_score += 1;

    let risk_label = 'Low';
    let risk_pill_class = 'Low';
    if (risk_score >= 5) { risk_label = 'High Risk'; risk_pill_class = 'High'; }
    else if (risk_score >= 3) { risk_label = 'Medium Risk'; risk_pill_class = 'Medium'; }

    return {
        persona: predictedPersona,
        risk_score: risk_score,
        risk_label: risk_label,
        risk_pill_class: risk_pill_class
    };
}

function renderBatchResults() {
    document.getElementById('batch-count').textContent = batchPredictions.length;
    const tbody = document.getElementById('batch-tbody');

    tbody.innerHTML = batchPredictions.map((res, i) => `
        <tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td>
                <span style="font-size:1.2rem; margin-right:4px">${res.persona.icon}</span>
                <span style="font-weight:600; color:${res.persona.color}">${res.persona.name}</span>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:${res.risk_score * 5}px;height:6px;background:linear-gradient(90deg,#ef4444,#fca5a5);border-radius:99px;min-width:4px"></div>
                  <span style="font-weight:700">${res.risk_score}/10</span>
                </div>
            </td>
            <td><span class="risk-pill ${res.risk_pill_class}">${res.risk_label}</span></td>
        </tr>
    `).join('');

    document.getElementById('batch-results').style.display = 'block';
}

// Export Results
document.getElementById('btn-export-batch').addEventListener('click', () => {
    if (batchPredictions.length === 0) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Row_Number,Predicted_Persona,Risk_Score,Risk_Level\n';

    batchPredictions.forEach((res, i) => {
        csvContent += `${i + 1},"${res.persona.name}",${res.risk_score},${res.risk_label}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'EduInsight_Batch_Predictions.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Header Sorting Listeners
    document.querySelectorAll('#risk-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (riskSortCol === col) {
                riskSortAsc = !riskSortAsc;
            } else {
                riskSortCol = col;
                riskSortAsc = false;
            }

            // Update UI classes
            document.querySelectorAll('#risk-table th.sortable').forEach(h => {
                h.classList.remove('asc', 'desc');
            });
            th.classList.add(riskSortAsc ? 'asc' : 'desc');

            currentRiskPage = 1; // Reset to page 1 on sort
            renderRiskTable();
        });
    });

    // Initialize Default Sort UI
    const defaultTh = document.querySelector(`#risk-table th.sortable[data-sort="${riskSortCol}"]`);
    if (defaultTh) defaultTh.classList.add(riskSortAsc ? 'asc' : 'desc');

    // Pagination Listeners
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (currentRiskPage > 1) {
            currentRiskPage--;
            renderRiskTable();
        }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        currentRiskPage++;
        renderRiskTable();
    });
    renderPersonas();
    renderAll();
});
