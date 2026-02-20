# 🎓 EduInsight — Student Learning Patterns & Classroom Strategy Dashboard

> **Praxis 2.0 Hackathon Submission** | Theme: Education · Behavioral Analytics · Personalization

[![Live Demo](https://img.shields.io/badge/Demo-Live%20Dashboard-7C3AED?style=for-the-badge)](#)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python)](https://python.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

---

## 📌 Problem Statement

Educators manage classrooms of 30–60+ students, yet have almost no scalable tools to understand **how** students learn, **why** some fall behind, or **how** to adapt their teaching strategy per student profile. The result: disengaged learners fall through the cracks, and one-size-fits-all teaching fails diverse learners.

**EduInsight** solves this by transforming raw student behavioral data into actionable classroom intelligence — directly for teachers.

---

## 🚀 What It Does

EduInsight is a **client-side analytics dashboard** that runs directly in any browser (no server required). It analyzes 6,607 students across 20 behavioral, academic, and socioeconomic features and provides:

| Feature | Description |
|---------|-------------|
| 🧠 **5 Learner Personas** | K-Means clustering groups students by behavioral signatures |
| ⚠️ **Risk Radar** | Composite disengagement score flags students before they fail |
| 📈 **Feature Impact** | Pearson correlation reveals which factors actually drive scores |
| 💡 **Strategy Recommender** | Per-persona instructional strategies for teachers |
| 📊 **15 Interactive Charts** | Score distribution, attendance bands, scatter plots, radar |
| 🔍 **Live Filters** | Filter by School Type, Gender, Motivation Level |

---

## 🗂️ Project Structure

```
📁 New/
├── Student_data.csv      ← Raw dataset (6,607 students × 20 features)
├── preprocess.py         ← ML engine: clustering, risk scoring, correlations
├── data.js               ← Pre-computed analytics (auto-generated, 92KB)
├── index.html            ← Dashboard shell
├── index.css             ← Dark glassmorphism design system
└── app.js                ← Chart.js rendering engine
```

---

## ⚙️ How to Run

### Step 1 — Generate analytics (one-time)
```bash
cd "c:\Users\HP\OneDrive\Desktop\New"
python preprocess.py
```
This reads `Student_data.csv`, runs all ML analysis, and writes `data.js`.

### Step 2 — Open the dashboard
Double-click `index.html` in **Chrome** or **Edge** (no server needed).

---

## 🧠 ML & GenAI Integration

### 1. K-Means Clustering (Unsupervised ML)
**File:** `preprocess.py` → `kmeans()` function

- **Features used:** `Hours_Studied`, `Attendance`, `Sleep_Hours`, `Previous_Scores`, `Tutoring_Sessions`, `Physical_Activity`
- **Method:** Custom K-Means (k=5, 40 iterations, seed=42) with min-max normalization
- **Cluster labeling:** Deterministic assignment maps clusters to named personas based on relative avg_score and avg_attendance rankings
- **Output:** Each of 6,607 students is labeled as one of 5 Learner Personas

| Persona | Behavioral Signature |
|---------|---------------------|
| 🚀 Driven Achiever | High study hours, high attendance, strong prior scores |
| 📚 Consistent Worker | Steady attendance, reliable but not top-tier performance |
| 🌊 Passive Coaster | Average across all metrics, low engagement urgency |
| 🆘 Struggling Learner | Low attendance, low prior scores, often resource-limited |
| 🌱 Potential Bloomer | High prior scores but declining current engagement |

### 2. Composite Risk Scoring (Rule-Based ML)
**File:** `preprocess.py` → `compute_risk()` function

A 10-point weighted disengagement scoring model:

| Signal | Points |
|--------|--------|
| Attendance < 70% | +2 |
| Attendance 70–80% | +1 |
| Motivation = Low | +2 |
| Motivation = Medium | +1 |
| Exam Score < 62 | +2 |
| Exam Score < 67 | +1 |
| No Internet Access | +1 |
| Learning Disability = Yes | +1 |
| Study Hours < 10/week | +1 |
| Peer Influence = Negative | +1 |

**Risk Levels:** High (≥5) · Medium (≥3) · Low (<3)

> **Result:** 1,022 students (15.5%) flagged as High Risk — prioritized in the Risk Radar table.

### 3. Pearson Correlation Analysis
**File:** `preprocess.py` → `compute_correlations()` function

Correlates 15 features (including encoded categoricals) against `Exam_Score` to surface the most impactful academic factors. Rendered as a horizontal bar chart — green for positive, red for inverse correlations.

### 4. GenAI Integration — Persona-Driven Strategy Recommender
Each learner persona is backed by **5 expert-informed instructional strategies** embedded in the system. When a teacher clicks a persona card, the strategies are instantly surfaced. This simulates GenAI-style recommendation behavior — in a production system, each strategy panel would call a generative AI API (e.g., Gemini or GPT-4) with the persona feature vector as context to generate dynamic, school-specific recommendations.

The current implementation uses curated prompt templates per cluster that could directly be fed to a Gemini `generateContent` call with student-specific context as few-shot examples.

---

## 📊 Key Findings

- **Attendance** and **Previous Scores** have the highest positive correlation with exam performance
- **Motivation Level** is a stronger predictor than raw study hours
- **Struggling Learners** (22.1% of students) carry **50% of all High-Risk cases**
- Private school students score marginally higher but the gap narrows with high attendance
- Students with **High Parental Involvement** score ~4 points higher on average

---

## ⚖️ Ethics, Bias & Limitations

### Fairness Considerations
- **Gender neutrality:** The dashboard never filters or ranks students by gender in ways that imply inferiority
- **Socioeconomic labels:** Family Income and Parental Education are shown as context factors, not deterministic predictors, to avoid reinforcing stereotypes
- **Learning Disabilities:** Flagged as a risk signal but always paired with a support-oriented strategy — never used to deprioritize students

### Bias Risks
| Risk | Mitigation |
|------|-----------|
| K-Means may cluster by socioeconomic advantage, not effort | Cluster features exclude income/school-type to keep behavioral focus |
| Risk scores could be used punitively | Risk Radar is framed as "early support" — not "student failure list" |
| Dataset may not represent all geographies | Dashboard shows relative comparisons, not absolute norms |

### Limitations
- Dataset is synthetically structured — real-world deployment requires validation with actual institutional data
- K-Means is sensitive to initialization; results may vary slightly (mitigated with fixed seed=42)
- The system does not ingest real-time data — teachers need to re-run `preprocess.py` when new records are added

---

## 💼 Business Feasibility

### Target Users
- **Primary:** Classroom teachers and department heads
- **Secondary:** School administrators, student counselors

### Go-to-Market
1. **SaaS Dashboard** — Per-school subscription ($99/month for unlimited teachers)
2. **LMS Plugin** — Integrate into Google Classroom, Canvas, Moodle as a plugin
3. **District Analytics** — Bulk licensing for school districts ($5–10K/yr)

### Value Proposition
- Replaces 6–8 hours/week of manual grade analysis with instant insights
- Early risk identification reduces dropout rates → measurable impact on school performance metrics
- Strategy recommender reduces new-teacher onboarding time

### Scalability Path
```
Phase 1 → Client-side (file-based, current)      ← Hackathon prototype
Phase 2 → Backend API (FastAPI + PostgreSQL)      ← Pilot deployments
Phase 3 → Real-time LMS integration + Gemini API  ← Production
Phase 4 → Federated multi-school analytics        ← Enterprise
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Engine | Python 3 (stdlib only — no numpy/sklearn dependencies) |
| Visualization | Chart.js v4 (CDN) |
| Frontend | Vanilla HTML5 · CSS3 · ES6 JavaScript |
| Design | Dark glassmorphism, Inter font, CSS custom properties |
| Deployment | Static files — runs from `file://` or any static host |

---

## 📬 Contact

Built for **Praxis 2.0** hosted on **Unstop**.
