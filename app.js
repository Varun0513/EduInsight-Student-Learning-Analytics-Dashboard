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
        <button class="btn-pdf-export" data-index="${displayIndex - 1}" title="Download Student Report" style="padding: 2px 6px; font-size: 0.8rem; background: transparent; border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); cursor: pointer;">
          📄 PDF
        </button>
      </td>
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

// Event Delegation for PDF Buttons
document.getElementById('risk-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-pdf-export');
    if (!btn) return;
    const rowIndex = parseInt(btn.dataset.index);
    let rows = filteredRisk();

    // We must rebuild the exact sorted rows to get the correct student
    rows.sort((a, b) => {
        let valA = a[riskSortCol];
        let valB = b[riskSortCol];

        if (riskSortCol === 'persona') {
            const rank = {
                'Driven Achiever': 0, 'Consistent Worker': 1, 'Potential Bloomer': 2,
                'Passive Coaster': 3, 'Struggling Learner': 4
            };
            valA = rank[ANALYTICS.clusters[resolvePersona(a, a.persona)]?.name] ?? 5;
            valB = rank[ANALYTICS.clusters[resolvePersona(b, b.persona)]?.name] ?? 5;
        } else if (riskSortCol === 'risk') {
            const m = { 'Low Risk': 0, 'Medium Risk': 1, 'High Risk': 2 };
            valA = m[a.risk] || 0; valB = m[b.risk] || 0;
        } else if (riskSortCol === 'internet') {
            valA = a.internet === 'Yes' ? 1 : 0; valB = b.internet === 'Yes' ? 1 : 0;
        } else if (riskSortCol === 'motiv') {
            const m = { 'Low': 0, 'Medium': 1, 'High': 2 };
            valA = m[a.motiv] || 0; valB = m[b.motiv] || 0;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return riskSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (valA < valB) return riskSortAsc ? -1 : 1;
        if (valA > valB) return riskSortAsc ? 1 : -1;
        return 0;
    });

    const student = rows[rowIndex];
    if (student) {
        generateStudentPDF(student);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION (jsPDF)
// ═══════════════════════════════════════════════════════════════════════════════
function generateStudentPDF(student) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const resolvedId = resolvePersona(student, student.persona);
    const p = ANALYTICS.clusters[resolvedId];

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("EduInsight Student Report", 14, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

    // Main stats
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("Academic Profile", 14, 40);

    doc.autoTable({
        startY: 45,
        theme: 'grid',
        headStyles: { fillColor: [14, 165, 233] },
        head: [['Metric', 'Value']],
        body: [
            ['School', student.school],
            ['Gender', student.gender],
            ['Exam Score', student.score + ' / 100'],
            ['Attendance', student.attend + '%'],
            ['Study Hours', student.hours + ' hrs/wk'],
            ['Motivation', student.motiv],
            ['Internet Access', student.internet]
        ],
    });

    // Risk & Persona
    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Risk & Persona Analysis", 14, finalY + 15);

    doc.autoTable({
        startY: finalY + 20,
        theme: 'grid',
        headStyles: { fillColor: [124, 58, 237] },
        head: [['Analysis Area', 'Result']],
        body: [
            ['Risk Score', student.risk_score],
            ['Risk Level', student.risk],
            ['Persona Cluster', p.name],
            ['Persona Description', p.description]
        ],
    });

    // Strategies
    const stratY = doc.lastAutoTable.finalY || 160;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Recommended Interventions", 14, stratY + 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    let yPos = stratY + 25;
    p.strategies.forEach((strat, idx) => {
        const textLines = doc.splitTextToSize(`${idx + 1}. ${strat}`, 180);
        doc.text(textLines, 14, yPos);
        yPos += textLines.length * 6 + 2;
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("CONFIDENTIAL // EDUINSIGHT", 14, 285);

    doc.save(`Student_Report_${student.score}_${student.risk.replace(' ', '_')}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: All Charts
// ═══════════════════════════════════════════════════════════════════════════════

const gridOpts = {
    color: 'rgba(0,0,0,0.05)',
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

    // 4. Show result as a popup card
    const popup = document.getElementById('pred-popup');

    document.getElementById('pred-pop-icon').textContent = predictedPersona.icon;
    document.getElementById('pred-pop-name').textContent = predictedPersona.name;
    document.getElementById('pred-pop-name').style.color = predictedPersona.color;
    document.getElementById('pred-pop-desc').textContent = predictedPersona.description;

    // Risk badge
    const riskColors = { 'High Risk': '#fca5a5', 'Medium Risk': '#fcd34d', 'Low': '#6ee7b7' };
    const riskBg = { 'High Risk': 'rgba(239,68,68,0.15)', 'Medium Risk': 'rgba(245,158,11,0.15)', 'Low': 'rgba(16,185,129,0.15)' };
    document.getElementById('pred-pop-risk-label').textContent = risk_label;
    document.getElementById('pred-pop-risk-label').style.color = riskColors[risk_label] || '#6ee7b7';
    document.getElementById('pred-pop-risk-label').style.background = riskBg[risk_label] || 'rgba(16,185,129,0.15)';
    document.getElementById('pred-pop-risk-score').textContent = risk_score + ' / 10';
    document.getElementById('pred-pop-risk-score').style.color = riskColors[risk_label] || '#6ee7b7';

    // Score bar fill
    document.getElementById('pred-pop-bar-fill').style.width = (risk_score / 10 * 100) + '%';
    document.getElementById('pred-pop-bar-fill').style.background =
        risk_score >= 5 ? 'linear-gradient(90deg,#ef4444,#fca5a5)'
            : risk_score >= 3 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)'
                : 'linear-gradient(90deg,#10b981,#6ee7b7)';

    // Key stats grid
    document.getElementById('pred-pop-score-val').textContent = student.Exam_Score;
    document.getElementById('pred-pop-attend-val').textContent = student.Attendance + '%';
    document.getElementById('pred-pop-hours-val').textContent = student.Hours_Studied + 'h';
    document.getElementById('pred-pop-motiv-val').textContent = student.Motivation_Level;

    // ── Teaching strategies section ──────────────────────────────────────────
    let stratSection = document.getElementById('pred-pop-strategy-section');
    if (!stratSection) {
        stratSection = document.createElement('div');
        stratSection.id = 'pred-pop-strategy-section';
        stratSection.className = 'pred-pop-strategies-wrap';
        popup.querySelector('.pred-popup-card').appendChild(stratSection);
    }

    // Helper to render numbered tips
    const renderTips = (tips, isAI = false) => {
        const badge = isAI ? '<span class="ai-badge">✨ AI</span>' : '';
        stratSection.innerHTML = `
            <div class="pred-pop-label" style="margin-bottom:0.7rem">
                📋 Teaching Strategies ${badge}
            </div>
            <div class="pred-pop-strategies">
                ${tips.map((s, i) => `
                    <div class="pred-pop-tip">
                        <div class="pred-pop-tip-num">${i + 1}</div>
                        <div class="pred-pop-tip-text">${s}</div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    // Show static strategies first (instant feedback)
    renderTips(predictedPersona.strategies || []);

    // Try to enhance with AI-personalized advice (async, non-blocking)
    const hasApiKey = window.GEMINI_API_KEY && window.GEMINI_API_KEY !== 'YOUR_API_KEY_HERE';
    if (hasApiKey) {
        // Show loading state
        stratSection.innerHTML = `
            <div class="pred-pop-label" style="margin-bottom:0.7rem">📋 Teaching Strategies <span class="ai-badge">✨ AI</span></div>
            <div class="ai-loading">
                <div class="ai-spinner"></div>
                <span>Generating personalised advice…</span>
            </div>
        `;
        const sysCtx = `You are an expert school teacher giving SPECIFIC, actionable classroom strategies for ONE student.
Rules:
- Output ONLY 4 numbered strategies. No intro, no extra text.
- Every strategy must directly reference the student's actual numbers (score, attendance %, hours).
- Strategies must be different from each other (academic, behavioural, motivational, parental/support).
- Be concrete: name specific techniques, tools, or actions a teacher can do this week.
- Do NOT give generic advice like "talk to the student" or "assign extra work".
Format:
1. [strategy]
2. [strategy]
3. [strategy]
4. [strategy]`;

        const personaDesc = predictedPersona.description || '';
        const aiPrompt = `Struggling student profile:
- Learner Persona: ${predictedPersona.name} — ${personaDesc}
- Exam Score: ${student.Exam_Score}/100 (${student.Exam_Score < 50 ? 'critically low' : student.Exam_Score < 65 ? 'below average' : 'borderline'})
- Attendance: ${student.Attendance}% (${student.Attendance < 60 ? 'severe absenteeism' : student.Attendance < 80 ? 'concerning absenteeism' : 'acceptable'})
- Weekly Study Hours: ${student.Hours_Studied}h (${student.Hours_Studied < 5 ? 'very low effort' : student.Hours_Studied < 10 ? 'below recommended' : 'adequate'})
- Motivation Level: ${student.Motivation_Level}
- Disengagement Risk: ${risk_label} (${risk_score}/10)
- Previous Scores: ${student.Previous_Scores || 'N/A'}

Based SPECIFICALLY on this student's exact numbers above, give 4 classroom strategies the teacher should implement now.`;


        callGemini(aiPrompt, sysCtx).then(text => {
            console.log('[AI Strategies] Raw response:', text);

            // Robust parser: try numbered list, then bullet, then line-split
            let tips = [];

            // Match "1. tip" or "1) tip" patterns
            const numbered = [...text.matchAll(/^\s*\d+[\.\)]\s*(.+)/gm)]
                .map(m => m[1].trim())
                .filter(t => t.length > 8);

            if (numbered.length >= 2) {
                tips = numbered.slice(0, 4);
            } else {
                // Match bullet points: "• tip" or "- tip" or "* tip"
                const bullets = [...text.matchAll(/^\s*[•\-\*]\s*(.+)/gm)]
                    .map(m => m[1].trim())
                    .filter(t => t.length > 8);
                if (bullets.length >= 2) {
                    tips = bullets.slice(0, 4);
                } else {
                    // Fallback: split by newlines, keep non-empty lines
                    tips = text.split(/\n+/)
                        .map(l => l.replace(/^\s*\d+[\.\)]\s*/, '').trim())
                        .filter(l => l.length > 15)
                        .slice(0, 4);
                }
            }

            console.log('[AI Strategies] Parsed tips:', tips);

            if (tips.length >= 2) {
                renderTips(tips, true);
            } else {
                renderTips(predictedPersona.strategies || [], false);
            }
        }).catch(err => {
            console.error('[AI Strategies] Error:', err);
            renderTips(predictedPersona.strategies || [], false);
        });

    }

    // Close add-student modal and show popup
    addModal.style.display = 'none';
    popup.style.display = 'flex';
    requestAnimationFrame(() => popup.querySelector('.pred-popup-card').classList.add('visible'));
});

// Close prediction popup
document.getElementById('pred-popup-close').addEventListener('click', () => {
    const popup = document.getElementById('pred-popup');
    popup.querySelector('.pred-popup-card').classList.remove('visible');
    setTimeout(() => popup.style.display = 'none', 250);
});
document.getElementById('pred-popup').addEventListener('click', (e) => {
    if (e.target === document.getElementById('pred-popup')) {
        const popup = document.getElementById('pred-popup');
        popup.querySelector('.pred-popup-card').classList.remove('visible');
        setTimeout(() => popup.style.display = 'none', 250);
    }
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

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE — PDF REPORT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-export-pdf').addEventListener('click', generatePDF);

function generatePDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { alert('PDF library not loaded. Please check your internet connection.'); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();   // 210mm
    const pageH = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 14;
    const col2 = W / 2 + 3;
    let y = 0;

    // ── Colours ──────────────────────────────────────────────────────────────
    const C = {
        bg: [10, 15, 31],
        card: [18, 26, 52],
        accent: [124, 58, 237],
        blue: [14, 165, 233],
        high: [239, 68, 68],
        medium: [245, 158, 11],
        low: [34, 197, 94],
        white: [255, 255, 255],
        muted: [148, 163, 184],
        border: [30, 41, 59],
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    const fillRect = (x, yy, w, h, rgb) => {
        doc.setFillColor(...rgb);
        doc.rect(x, yy, w, h, 'F');
    };
    const setFont = (size, style = 'normal', rgb = C.white) => {
        doc.setFontSize(size);
        doc.setFont('helvetica', style);
        doc.setTextColor(...rgb);
    };
    const text = (str, x, yy, opts = {}) => doc.text(String(str), x, yy, opts);
    const newPage = () => {
        doc.addPage();
        // dark background on every page
        fillRect(0, 0, W, pageH, C.bg);
        y = margin;
    };

    // ════════════════════════════════════════════════
    // PAGE 1
    // ════════════════════════════════════════════════
    fillRect(0, 0, W, pageH, C.bg);
    y = 0;

    // ── Header band ─────────────────────────────────
    fillRect(0, 0, W, 26, C.card);
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.8);
    doc.line(0, 26, W, 26);

    setFont(16, 'bold', C.white);
    text('EduInsight', margin, 11);

    setFont(8, 'normal', C.muted);
    text('Student Learning Analytics Dashboard', margin, 17);

    // Date + filter info right-aligned
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    setFont(7, 'normal', C.muted);
    text('Generated: ' + dateStr, W - margin, 11, { align: 'right' });

    const school = document.getElementById('filter-school')?.value || 'All';
    const gender = document.getElementById('filter-gender')?.value || 'All';
    const motiv = document.getElementById('filter-motiv')?.value || 'All';
    text(`Filters: School=${school}  Gender=${gender}  Motivation=${motiv}`, W - margin, 17, { align: 'right' });

    y = 34;

    // ── KPI Strip ───────────────────────────────────
    const k = ANALYTICS.kpis;
    const kpis = [
        { label: 'Total Students', value: k.total.toLocaleString(), color: C.blue },
        { label: 'Avg Exam Score', value: k.avg_score, color: C.accent },
        { label: 'Avg Attendance', value: k.avg_attend + '%', color: C.low },
        { label: 'High-Risk Students', value: k.high_risk.toLocaleString(), color: C.high },
        { label: 'Avg Study Hours', value: k.avg_hours + 'h/wk', color: C.medium },
    ];
    const kw = (W - margin * 2) / kpis.length - 1.5;
    kpis.forEach((kpi, i) => {
        const kx = margin + i * (kw + 1.5);
        fillRect(kx, y, kw, 20, C.card);
        doc.setDrawColor(...kpi.color);
        doc.setLineWidth(0.5);
        doc.line(kx, y, kx + kw, y);  // top accent
        setFont(11, 'bold', kpi.color);
        text(kpi.value, kx + kw / 2, y + 10, { align: 'center' });
        setFont(5.5, 'normal', C.muted);
        text(kpi.label.toUpperCase(), kx + kw / 2, y + 16, { align: 'center' });
    });
    y += 26;

    // ── Section: Risk Distribution ───────────────────
    setFont(9, 'bold', C.white);
    text('RISK DISTRIBUTION', margin, y);
    y += 5;

    const total = k.total || 1;
    const risks = [
        { label: 'High Risk', count: k.high_risk, pct: ((k.high_risk / total) * 100).toFixed(1), rgb: C.high },
        { label: 'Medium Risk', count: k.medium_risk, pct: ((k.medium_risk / total) * 100).toFixed(1), rgb: C.medium },
        { label: 'Low Risk', count: k.low_risk, pct: ((k.low_risk / total) * 100).toFixed(1), rgb: C.low },
    ];
    const barW = W - margin * 2;
    const barH = 7;
    // coloured bar
    let bx = margin;
    risks.forEach(r => {
        const segW = barW * (r.count / total);
        fillRect(bx, y, segW, barH, r.rgb);
        bx += segW;
    });
    y += barH + 4;

    // legend row
    risks.forEach((r, i) => {
        const lx = margin + i * 60;
        fillRect(lx, y, 4, 4, r.rgb);
        setFont(7, 'normal', C.white);
        text(`${r.label}: ${r.count.toLocaleString()} (${r.pct}%)`, lx + 6, y + 3.5);
    });
    y += 12;

    // ── Section: Learner Personas ────────────────────
    setFont(9, 'bold', C.white);
    text('LEARNER PERSONAS', margin, y);
    y += 4;

    const clusters = ANALYTICS.clusters;
    const colW = (W - margin * 2) / 2 - 2;
    clusters.forEach((c, i) => {
        const cx = margin + (i % 2) * (colW + 4);
        const cy = y + Math.floor(i / 2) * 28;
        fillRect(cx, cy, colW, 24, C.card);
        // left accent line
        doc.setFillColor(...C.accent);
        doc.rect(cx, cy, 1.5, 24, 'F');

        setFont(8, 'bold', C.white);
        text(c.name, cx + 5, cy + 7);

        const stats = [
            ['Students', c.count.toLocaleString()],
            ['Avg Score', c.avg_score],
            ['Avg Attend', c.avg_attend + '%'],
            ['High-Risk', c.risk_high],
        ];
        stats.forEach(([lbl, val], si) => {
            const sx = cx + 5 + si * (colW / 4 - 0.5);
            setFont(6, 'normal', C.muted);
            text(lbl.toUpperCase(), sx, cy + 14);
            setFont(7, 'bold', C.blue);
            text(String(val), sx, cy + 20);
        });
    });

    const personaRows = Math.ceil(clusters.length / 2);
    y += personaRows * 28 + 4;

    // ── Footer line ──────────────────────────────────
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 8, W - margin, pageH - 8);
    setFont(6, 'normal', C.muted);
    text('Page 1 of 2  ·  EduInsight — Confidential', W / 2, pageH - 4, { align: 'center' });

    // ════════════════════════════════════════════════
    // PAGE 2 — High-Risk Student Table
    // ════════════════════════════════════════════════
    newPage();

    setFont(11, 'bold', C.white);
    text('HIGH-RISK STUDENTS', margin, y);
    setFont(7, 'normal', C.muted);
    text('Top students ranked by disengagement risk score', margin, y + 5);
    y += 12;

    // Table header
    const cols = [
        { key: 'n', label: '#', w: 8 },
        { key: 'score', label: 'EXAM SCORE', w: 25 },
        { key: 'attend', label: 'ATTENDANCE', w: 25 },
        { key: 'hours', label: 'STUDY HRS', w: 22 },
        { key: 'motiv', label: 'MOTIVATION', w: 25 },
        { key: 'persona', label: 'PERSONA', w: 50 },
        { key: 'risk', label: 'RISK SCORE', w: 25 },
    ];

    // header row
    fillRect(margin, y, W - margin * 2, 7, C.accent);
    let hx = margin;
    cols.forEach(col => {
        setFont(6, 'bold', C.white);
        text(col.label, hx + 2, y + 4.5);
        hx += col.w;
    });
    y += 7;

    // get high-risk students, sorted by risk desc
    const highRisk = filteredStudents
        .filter(s => computeRisk(s).risk_score >= 5)
        .sort((a, b) => computeRisk(b).risk_score - computeRisk(a).risk_score)
        .slice(0, 30);

    highRisk.forEach((s, idx) => {
        if (y > pageH - 18) { newPage(); y = margin; }
        const rowH = 6.5;
        const rowBg = idx % 2 === 0 ? C.card : C.bg;
        fillRect(margin, y, W - margin * 2, rowH, rowBg);

        const risk = computeRisk(s);
        const rColor = risk.risk_score >= 7 ? C.high : risk.risk_score >= 5 ? C.medium : C.low;
        let rx = margin;

        const rowData = [
            idx + 1,
            s.Exam_Score + '/100',
            s.Attendance + '%',
            s.Hours_Studied + 'h',
            s.Motivation_Level,
            risk.persona.name,
            risk.risk_score + '/10',
        ];
        rowData.forEach((val, ci) => {
            const col = cols[ci];
            const textColor = ci === 6 ? rColor : C.white;
            setFont(6, ci === 6 ? 'bold' : 'normal', textColor);
            text(String(val), rx + 2, y + 4.3);
            rx += col.w;
        });
        y += rowH;
    });

    if (highRisk.length === 0) {
        setFont(8, 'normal', C.low);
        text('✓ No high-risk students found with current filters.', margin, y + 8);
    }

    // Footer
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 8, W - margin, pageH - 8);
    setFont(6, 'normal', C.muted);
    text('Page 2 of 2  ·  EduInsight — Confidential', W / 2, pageH - 4, { align: 'center' });

    // ── Save ────────────────────────────────────────
    const filename = `EduInsight_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — AI CHAT ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════════
(function initChatAssistant() {
    const fab = document.getElementById('chat-fab');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close-btn');
    const messages = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    let chatHistory = [];   // Gemini conversation history
    let isTyping = false;

    // ── Toggle panel ──────────────────────────────────────────────────────────
    fab.addEventListener('click', () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'flex';
        if (!open) {
            panel.classList.add('visible');
            input.focus();
        }
    });
    closeBtn.addEventListener('click', () => {
        panel.classList.remove('visible');
        setTimeout(() => panel.style.display = 'none', 250);
    });

    // ── Append message bubble ─────────────────────────────────────────────────
    function appendBubble(role, text) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${role}`;
        if (role === 'ai') {
            div.innerHTML = `<span class="chat-bubble-icon">🤖</span><div class="chat-bubble-text">${text}</div>`;
        } else {
            div.innerHTML = `<div class="chat-bubble-text">${text}</div>`;
        }
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    }

    // ── Typing indicator ──────────────────────────────────────────────────────
    function showTyping() {
        const div = document.createElement('div');
        div.className = 'chat-bubble ai typing-indicator';
        div.id = 'chat-typing';
        div.innerHTML = `<span class="chat-bubble-icon">🤖</span>
            <div class="chat-bubble-text">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }
    function hideTyping() {
        const t = document.getElementById('chat-typing');
        if (t) t.remove();
    }

    // ── Send a message ────────────────────────────────────────────────────────
    async function sendMessage() {
        const text = input.value.trim();
        if (!text || isTyping) return;

        // Check API key (handled by gemini.js fallback to Vercel API now)

        isTyping = true;
        input.value = '';
        input.style.height = 'auto';
        sendBtn.disabled = true;

        appendBubble('user', text);
        showTyping();

        try {
            const systemCtx = buildDashboardContext();
            const response = await callGemini(text, systemCtx, chatHistory);

            // Update history for multi-turn
            chatHistory.push({ role: 'user', parts: [{ text }] });
            chatHistory.push({ role: 'model', parts: [{ text: response }] });

            hideTyping();
            // Convert markdown-ish asterisks to <strong> for display
            const formatted = response
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
            appendBubble('ai', formatted);
        } catch (err) {
            hideTyping();
            appendBubble('ai', `⚠️ ${err.message || 'Something went wrong. Please try again.'}`);
        }

        isTyping = false;
        sendBtn.disabled = false;
        input.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (Night / Day Shift)
// ═══════════════════════════════════════════════════════════════════════════════
(function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');

    // Check local storage
    const currentTheme = localStorage.getItem('eduinsight-theme') || 'light';
    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        icon.textContent = '☀️';
        text.textContent = 'DAY SHIFT';
        Chart.defaults.color = '#e0e7ff';
        gridOpts.color = 'rgba(255,255,255,0.15)';
    } else {
        gridOpts.color = 'rgba(0,0,0,0.05)';
    }

    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');

        if (isDark) {
            icon.textContent = '☀️';
            text.textContent = 'DAY SHIFT';
            localStorage.setItem('eduinsight-theme', 'dark');
            Chart.defaults.color = '#e0e7ff';
            gridOpts.color = 'rgba(255,255,255,0.15)';
        } else {
            icon.textContent = '🌙';
            text.textContent = 'NIGHT SHIFT';
            localStorage.setItem('eduinsight-theme', 'light');
            Chart.defaults.color = '#94A3B8';
            gridOpts.color = 'rgba(0,0,0,0.05)';
        }

        // Re-render charts
        renderAll();
    });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// TOP FOLDER TABS NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════
(function initTabNavigation() {
    const tabs = document.querySelectorAll('.folder-tab');
    const sections = {
        'tab-dashboard': document.body,
        'tab-analytics': document.getElementById('analytics-section'),
        'tab-snapshots': document.getElementById('snapshots-section')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active state
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Scroll to section
            const target = sections[tab.id];
            if (target) {
                if (target === document.body) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    // Offset slightly for header
                    const y = target.getBoundingClientRect().top + window.scrollY - 100;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }
        });
    });

    // Highlight active tab on scroll
    window.addEventListener('scroll', () => {
        const scrollPos = window.scrollY + 150;

        let activeId = 'tab-dashboard';
        ['analytics-section', 'snapshots-section'].forEach(secId => {
            const el = document.getElementById(secId);
            if (el && el.offsetTop <= scrollPos) {
                activeId = 'tab-' + secId.split('-')[0];
            }
        });

        tabs.forEach(t => t.classList.toggle('active', t.id === activeId));
    });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT PDF
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-export-pdf').addEventListener('click', () => {
    // Scroll to the risk table so they can export a specific student
    const target = document.getElementById('risk-table');
    if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: 'smooth' });

        // Small tooltip/alert overlay logic
        const existing = document.getElementById('export-hint');
        if (existing) existing.remove();

        const hint = document.createElement('div');
        hint.id = 'export-hint';
        hint.innerHTML = 'Click the <strong>📄 PDF</strong> button next to a student to download their individual report.';
        hint.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--bg-surface); color:var(--text-primary); border:2px solid var(--border); padding:1rem 2rem; border-radius:8px; z-index:9999; box-shadow:var(--shadow-glow); font-family:var(--font-body); opacity:0; transition:opacity 0.3s; pointer-events:none; filter:url(#squiggly-2);';
        document.body.appendChild(hint);

        setTimeout(() => hint.style.opacity = '1', 10);
        setTimeout(() => {
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 300);
        }, 4000);
    }
});
