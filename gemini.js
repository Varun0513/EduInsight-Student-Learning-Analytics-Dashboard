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

    let url;
    if (key && key !== 'YOUR_API_KEY_HERE') {
        url = `${GEMINI_ENDPOINT}?key=${key}`;
    } else {
        url = '/api/gemini';
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        let errMsg = `Gemini API error ${res.status}`;
        try {
            const err = await res.json();
            errMsg = err?.error?.message || errMsg;
        } catch (e) { }

        if (url === '/api/gemini' && res.status === 404) {
            throw new Error('On Vercel, ensure GEMINI_API_KEY is in Environment Variables. Locally, add it to config.js.');
        }

        throw new Error(errMsg);
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





