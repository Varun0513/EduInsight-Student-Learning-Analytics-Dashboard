// ── Gemini 2.0 Flash API Helper ───────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Call the Gemini API with a prompt string.
 * @param {string} prompt
 * @param {Array}  history  — optional [{role:'user'|'model', parts:[{text}]}]
 * @returns {Promise<string>} response text
 */
async function callGemini(prompt, history = []) {
    const key = window.GEMINI_API_KEY;
    if (!key || key === 'YOUR_API_KEY_HERE') {
        throw new Error('Gemini API key not set. Open config.js and add your key.');
    }

    const contents = [
        ...history,
        { role: 'user', parts: [{ text: prompt }] }
    ];

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 512,
            }
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(No response)';
}

/**
 * Build a system context string summarising the current dashboard data.
 * Sent at the start of every chat message so Gemini knows the dataset.
 */
function buildDashboardContext() {
    const k = ANALYTICS.kpis;
    const clusters = ANALYTICS.clusters;
    const clusterSummary = clusters.map(c =>
        `  • ${c.name}: ${c.count.toLocaleString()} students (avg score ${c.avg_score}, avg attend ${c.avg_attend}%, high-risk: ${c.risk_high})`
    ).join('\n');

    return `You are an AI assistant embedded in EduInsight, a learning analytics dashboard for school educators.

CURRENT DATASET SUMMARY:
- Total students: ${k.total.toLocaleString()}
- Average exam score: ${k.avg_score}
- Average attendance: ${k.avg_attend}%
- High-risk students: ${k.high_risk.toLocaleString()} (${((k.high_risk / k.total) * 100).toFixed(1)}%)
- Medium-risk: ${k.medium_risk.toLocaleString()}
- Low-risk: ${k.low_risk.toLocaleString()}
- Average study hours: ${k.avg_hours}h/week
- Largest persona group: ${k.top_cluster} (${k.top_cluster_pct}%)

LEARNER PERSONAS:
${clusterSummary}

Answer questions using this data where relevant. Be concise, practical, and supportive in tone. If you don't have specific data requested, say so honestly.`;
}
