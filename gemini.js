// ── Gemini API Helper ─────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';


const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Call the Gemini API.
 * @param {string}   userPrompt   — the user message text
 * @param {string}   systemCtx    — optional system instruction block
 * @param {Array}    history      — [{role, parts:[{text}]}] for multi-turn
 * @returns {Promise<string>} response text
 */
async function callGemini(userPrompt, systemCtx = '', history = []) {
    const key = window.GEMINI_API_KEY;
    if (!key || key === 'YOUR_API_KEY_HERE') {
        throw new Error('No API key — open config.js and add your Gemini key.');
    }

    const body = {
        contents: [
            ...history,
            { role: 'user', parts: [{ text: userPrompt }] }
        ],
        generationConfig: {
            temperature: 1,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 }
        }

    };

    // Use systemInstruction when provided (cleaner than embedding it in user message)
    if (systemCtx) {
        body.systemInstruction = { parts: [{ text: systemCtx }] };
    }

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(No response)';
}

/**
 * Compact dashboard context for the chat assistant.
 */
function buildDashboardContext() {
    const k = ANALYTICS.kpis;
    const cs = ANALYTICS.clusters;

    const personaSummary = cs.map(c =>
        `${c.name}: ${c.count} students, avg score ${c.avg_score}, attendance ${c.avg_attend}%, high-risk ${c.risk_high}`
    ).join(' | ');

    return `You are EduInsight AI, a teaching assistant for school educators.
Dataset: ${k.total} students | avg score ${k.avg_score} | avg attendance ${k.avg_attend}% | high-risk ${k.high_risk} | medium-risk ${k.medium_risk} | low-risk ${k.low_risk} | avg study hours ${k.avg_hours}h/wk
Personas: ${personaSummary}
Be concise, practical, and supportive. Answer only from the data above when relevant.`;
}





