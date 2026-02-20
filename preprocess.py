"""
Student Learning Analytics - Preprocessing Script
Reads Student_data.csv, performs:
  - K-Means clustering (k=5) -> Learner Personas
  - Risk scoring (composite disengagement risk)
  - Pearson correlation with Exam_Score
  - Aggregate summaries
Outputs: data.js (embedded in the dashboard)
"""

import csv
import json
import math
import random
import os
from typing import Any, Dict, List, Tuple

CSV_PATH = os.path.join(os.path.dirname(__file__), 'Student_data.csv')
OUT_PATH = os.path.join(os.path.dirname(__file__), 'data.js')

# ── 1. Load CSV ────────────────────────────────────────────────────────────────
def load_csv(path: str) -> List[Dict[str, str]]:
    rows = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

def clean(rows: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    cleaned = []
    for r in rows:
        try:
            row: Dict[str, Any] = {
                'Hours_Studied': float(r['Hours_Studied']),
                'Attendance': float(r['Attendance']),
                'Parental_Involvement': r['Parental_Involvement'].strip(),
                'Access_to_Resources': r['Access_to_Resources'].strip(),
                'Extracurricular_Activities': r['Extracurricular_Activities'].strip(),
                'Sleep_Hours': float(r['Sleep_Hours']),
                'Previous_Scores': float(r['Previous_Scores']),
                'Motivation_Level': r['Motivation_Level'].strip(),
                'Internet_Access': r['Internet_Access'].strip(),
                'Tutoring_Sessions': float(r['Tutoring_Sessions']),
                'Family_Income': r['Family_Income'].strip(),
                'Teacher_Quality': r['Teacher_Quality'].strip() if r['Teacher_Quality'].strip() else 'Medium',
                'School_Type': r['School_Type'].strip(),
                'Peer_Influence': r['Peer_Influence'].strip(),
                'Physical_Activity': float(r['Physical_Activity']),
                'Learning_Disabilities': r['Learning_Disabilities'].strip(),
                'Parental_Education_Level': r['Parental_Education_Level'].strip() if r['Parental_Education_Level'].strip() else 'High School',
                'Distance_from_Home': r['Distance_from_Home'].strip() if r['Distance_from_Home'].strip() else 'Near',
                'Gender': r['Gender'].strip(),
                'Exam_Score': float(r['Exam_Score'])
            }
            cleaned.append(row)
        except (ValueError, KeyError):
            continue
    return cleaned

# ── 2. K-Means Clustering (k=5) ───────────────────────────────────────────────
CLUSTER_FEATURES = [
    'Hours_Studied', 'Attendance', 'Sleep_Hours', 
    'Previous_Scores', 'Tutoring_Sessions', 'Physical_Activity'
]

def normalize(data: List[Dict[str, Any]], features: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Tuple[float, float]]]:
    stats: Dict[str, Tuple[float, float]] = {}
    for f in features:
        vals = [float(r[f]) for r in data]
        mn, mx = min(vals), max(vals)
        stats[f] = (mn, mx - mn if mx != mn else 1.0)
    
    for r in data:
        r['_norm'] = [(float(r[f]) - stats[f][0]) / stats[f][1] for f in features]
    return data, stats

def dist(a: List[float], b: List[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

def kmeans(data: List[Dict[str, Any]], k: int = 5, iters: int = 30) -> Tuple[List[int], List[List[float]]]:
    random.seed(42)
    centers = [data[i]['_norm'][:] for i in random.sample(range(len(data)), k)]
    labels = [0] * len(data)
    
    for _ in range(iters):
        for i, r in enumerate(data):
            dists = [dist(r['_norm'], c) for c in centers]
            labels[i] = dists.index(min(dists))
            
        new_centers = []
        for c in range(k):
            members = [data[i]['_norm'] for i in range(len(data)) if labels[i] == c]
            if members:
                new_centers.append([sum(x[j] for x in members) / len(members) for j in range(len(CLUSTER_FEATURES))])
            else:
                new_centers.append(centers[c])
        centers = new_centers
        
    return labels, centers

PERSONA_PROFILES = [
    {
        'name': 'Driven Achiever',
        'icon': '🚀',
        'color': '#7C3AED',
        'description': 'High study hours, excellent attendance, strong motivation. These students consistently perform at the top.',
        'strategies': [
            'Offer advanced challenge projects and enrichment tasks to maintain engagement.',
            'Assign peer mentoring roles to reinforce their own learning through teaching.',
            'Provide access to competitions (Olympiads, subject fairs) and external programs.',
            'Give autonomy in project-based learning — they thrive with creative freedom.',
            'Regularly celebrate milestones to sustain intrinsic motivation long-term.'
        ]
    },
    {
        'name': 'Consistent Worker',
        'icon': '📚',
        'color': '#0EA5E9',
        'description': 'Steady attendance and moderate study hours. Reliable performers who respond well to structured learning.',
        'strategies': [
            'Use structured study plans and weekly goal-setting exercises.',
            'Introduce spaced repetition tools (flashcards, quizzes) for retention.',
            'Leverage collaborative study groups — they excel when paired with peers.',
            'Offer regular, specific feedback to help them identify precise gaps.',
            'Introduce slightly harder problems progressively to build confidence.'
        ]
    },
    {
        'name': 'Passive Coaster',
        'icon': '🌊',
        'color': '#F59E0B',
        'description': 'Average attendance and minimal study effort. These students coast without clear academic direction.',
        'strategies': [
            'Connect curriculum topics to real-world interests and career relevance.',
            'Use gamified learning (points, leaderboards) to spark engagement.',
            'Check in one-on-one to understand hidden barriers or personal challenges.',
            'Break tasks into short, achievable micro-goals to build momentum.',
            'Introduce choice in assignments to restore a sense of ownership.'
        ]
    },
    {
        'name': 'Struggling Learner',
        'icon': '🆘',
        'color': '#EF4444',
        'description': 'Low attendance, lower previous scores, and limited resources. High risk of falling behind without support.',
        'strategies': [
            'Assign a dedicated mentor or tutor for weekly one-on-one sessions.',
            'Coordinate with parents/guardians to reinforce learning at home.',
            'Use multi-modal teaching (videos, hands-on activities) to suit diverse styles.',
            'Ensure access to school resources: library, devices, tutoring programs.',
            'Create safe, judgment-free classroom environments to reduce anxiety.'
        ]
    },
    {
        'name': 'Potential Bloomer',
        'icon': '🌱',
        'color': '#10B981',
        'description': 'High previous scores but lower current engagement or attendance. Untapped potential waiting to be unlocked.',
        'strategies': [
            'Investigate recent disengagement — personal, social, or academic triggers.',
            'Reignite curiosity with exploratory, discovery-based learning activities.',
            'Connect them with inspiring role models or alumni in their interest area.',
            'Flexible deadlines and project alternatives reduce pressure triggers.',
            'Offer leadership roles (class rep, project lead) to rebuild confidence.'
        ]
    }
]

def assign_persona_by_score(data: List[Dict[str, Any]]) -> List[int]:
    """
    Assign persona labels using the same score-first rules as resolvePersona() in app.js.
    
    Persona IDs:
      0 = Driven Achiever    — high current exam score + solid attendance
      1 = Consistent Worker  — solid attendance, moderate-good scores
      2 = Passive Coaster    — mid-range metrics, coasting
      3 = Struggling Learner — low score / low attendance / at-risk
      4 = Potential Bloomer  — high previous score but underperforming now
    
    Cluster averages (for reference):
      DA:  avg_score ~70, avg_attend ~90%
      CW:  avg_score ~68, avg_attend ~89%
      PC:  avg_score ~68, avg_attend ~88%
      SL:  avg_score ~65, avg_attend ~69%
      PB:  avg_score ~66, avg_attend ~70%
    """
    labels = []
    for r in data:
        score  = float(r['Exam_Score'])
        attend = float(r['Attendance'])
        prev   = float(r['Previous_Scores'])

        # Score < 63 → never a Driven Achiever or Consistent Worker
        if score < 63:
            if prev >= 78:
                labels.append(4)  # Potential Bloomer (had strong past, slipped)
            else:
                labels.append(3)  # Struggling Learner

        # Score 63–69 → at most Consistent Worker
        elif score < 70:
            if attend >= 85:
                labels.append(1)  # Consistent Worker (high attend saves them)
            elif prev >= 80 and score < prev - 8:
                labels.append(4)  # Potential Bloomer (was once much better)
            elif attend >= 75:
                labels.append(2)  # Passive Coaster
            elif attend < 72:
                labels.append(3)  # Struggling Learner (low attend + low score)
            else:
                labels.append(2)  # Passive Coaster (default mid-range)

        # Score 70–74 → DA only with solid attendance
        elif score < 75:
            if attend >= 82:
                labels.append(0)  # Driven Achiever
            elif attend >= 72:
                labels.append(1)  # Consistent Worker
            elif prev >= 78:
                labels.append(4)  # Potential Bloomer (dropping from past highs)
            else:
                labels.append(3)  # Struggling Learner

        # Score ≥ 75 → Driven Achiever unconditionally
        else:
            labels.append(0)

    return labels


# ── 3. Risk Scoring ────────────────────────────────────────────────────────────
def compute_risk(row: Dict[str, Any]) -> Tuple[int, str]:
    score = 0
    if row['Attendance'] < 70.0:
        score += 2
    elif row['Attendance'] < 80.0:
        score += 1
        
    if row['Motivation_Level'] == 'Low':
        score += 2
    elif row['Motivation_Level'] == 'Medium':
        score += 1
        
    if row['Exam_Score'] < 62.0:
        score += 2
    elif row['Exam_Score'] < 67.0:
        score += 1
        
    if row['Internet_Access'] == 'No':
        score += 1
    if row['Learning_Disabilities'] == 'Yes':
        score += 1
    if row['Hours_Studied'] < 10.0:
        score += 1
    if row['Peer_Influence'] == 'Negative':
        score += 1
        
    risk_label = 'High' if score >= 5 else ('Medium' if score >= 3 else 'Low')
    return score, risk_label

# ── 4. Pearson Correlation ─────────────────────────────────────────────────────
def pearson(xs: List[float], ys: List[float]) -> float:
    n = len(xs)
    if n == 0:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return num / den if den != 0 else 0.0

def encode_cat(vals: List[str], order: List[str]) -> List[float]:
    return [float(order.index(v)) if v in order else 0.0 for v in vals]

def compute_correlations(data: List[Dict[str, Any]]) -> Dict[str, float]:
    scores = [float(r['Exam_Score']) for r in data]
    features: Dict[str, List[float]] = {
        'Hours Studied': [float(r['Hours_Studied']) for r in data],
        'Attendance': [float(r['Attendance']) for r in data],
        'Sleep Hours': [float(r['Sleep_Hours']) for r in data],
        'Previous Scores': [float(r['Previous_Scores']) for r in data],
        'Tutoring Sessions': [float(r['Tutoring_Sessions']) for r in data],
        'Physical Activity': [float(r['Physical_Activity']) for r in data],
        'Motivation': encode_cat([str(r['Motivation_Level']) for r in data], ['Low', 'Medium', 'High']),
        'Parental Involvement': encode_cat([str(r['Parental_Involvement']) for r in data], ['Low', 'Medium', 'High']),
        'Access to Resources': encode_cat([str(r['Access_to_Resources']) for r in data], ['Low', 'Medium', 'High']),
        'Peer Influence': encode_cat([str(r['Peer_Influence']) for r in data], ['Negative', 'Neutral', 'Positive']),
        'Internet Access': encode_cat([str(r['Internet_Access']) for r in data], ['No', 'Yes']),
        'Teacher Quality': encode_cat([str(r['Teacher_Quality']) for r in data], ['Low', 'Medium', 'High']),
        'Family Income': encode_cat([str(r['Family_Income']) for r in data], ['Low', 'Medium', 'High']),
        'Extracurricular': encode_cat([str(r['Extracurricular_Activities']) for r in data], ['No', 'Yes']),
        'School Type': encode_cat([str(r['School_Type']) for r in data], ['Public', 'Private']),
    }
    corr = {name: round(pearson(vals, scores), 4) for name, vals in features.items()}
    return dict(sorted(corr.items(), key=lambda x: abs(x[1]), reverse=True))

# ── 5. Aggregates ──────────────────────────────────────────────────────────────
def avg(lst: List[float]) -> float:
    return round(sum(lst) / len(lst), 2) if lst else 0.0

def score_distribution(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    buckets = list(range(55, 102, 3))
    counts = [0] * len(buckets)
    for r in data:
        s = float(r['Exam_Score'])
        for i, b in enumerate(buckets):
            if s <= float(b) or i == len(buckets) - 1:
                counts[i] += 1
                break
    return {'labels': [str(b) for b in buckets], 'counts': counts}

def group_by(data: List[Dict[str, Any]], key: str, allowed: List[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for r in data:
        v = str(r[key])
        if allowed and v not in allowed:
            v = 'Other'
        groups.setdefault(v, []).append(r)
    return groups

# ── 6. Main ────────────────────────────────────────────────────────────────────
def main() -> None:
    print("Loading CSV...")
    raw = load_csv(CSV_PATH)
    data = clean(raw)
    print(f"  {len(data)} students loaded")

    print("Normalizing + clustering...")
    data, norm_stats = normalize(data, CLUSTER_FEATURES)
    labels, centers = kmeans(data, k=5, iters=40)

    # Assign personas using score-based rules (same as resolvePersona() in app.js)
    persona_labels = assign_persona_by_score(data)

    # Keep K-means centers for the live prediction form — map raw cluster → best persona
    # We still need a rough mapping for the scatter chart coloring
    from collections import Counter
    cluster_to_persona = {}
    for raw_lbl, p_lbl in zip(labels, persona_labels):
        cluster_to_persona.setdefault(raw_lbl, []).append(p_lbl)
    # Pick the most common persona per cluster
    cluster_to_persona = {c: Counter(ps).most_common(1)[0][0] for c, ps in cluster_to_persona.items()}
    mapped_centers = {cluster_to_persona.get(i, i): centers[i] for i in range(5)}

    for i, r in enumerate(data):
        r['persona'] = persona_labels[i]

    print("Computing risk scores...")
    risk_counts = {'High': 0, 'Medium': 0, 'Low': 0}
    for r in data:
        risk_score, risk_label = compute_risk(r)
        r['risk_score'] = risk_score
        r['risk_label'] = risk_label
        risk_counts[risk_label] += 1

    print("Computing correlations...")
    correlations = compute_correlations(data)

    # Cluster summaries — based on score-assigned persona labels
    cluster_summaries = []
    for p_idx in range(5):
        members = [r for r in data if r['persona'] == p_idx]
        profile = PERSONA_PROFILES[p_idx]
        cluster_summaries.append({
            'id': p_idx,
            'name': profile['name'],
            'icon': profile['icon'],
            'color': profile['color'],
            'description': profile['description'],
            'strategies': profile['strategies'],
            'count': len(members),
            'avg_score': avg([float(m['Exam_Score']) for m in members]),
            'avg_hours': avg([float(m['Hours_Studied']) for m in members]),
            'avg_attend': avg([float(m['Attendance']) for m in members]),
            'avg_tutor': avg([float(m['Tutoring_Sessions']) for m in members]),
            'avg_sleep': avg([float(m['Sleep_Hours']) for m in members]),
            'avg_prev': avg([float(m['Previous_Scores']) for m in members]),
            'risk_high': sum(1 for m in members if m['risk_label'] == 'High'),
        })

    # Score distribution
    score_dist = score_distribution(data)

    # Group summaries
    by_school = {k: {'count': len(v), 'avg_score': avg([float(r['Exam_Score']) for r in v]),
                     'avg_hours': avg([float(r['Hours_Studied']) for r in v]),
                     'avg_attend': avg([float(r['Attendance']) for r in v])}
                 for k, v in group_by(data, 'School_Type').items()}

    by_gender = {k: {'count': len(v), 'avg_score': avg([float(r['Exam_Score']) for r in v]),
                     'avg_hours': avg([float(r['Hours_Studied']) for r in v])}
                 for k, v in group_by(data, 'Gender').items()}

    by_motiv = {k: {'count': len(v), 'avg_score': avg([float(r['Exam_Score']) for r in v]),
                    'avg_attend': avg([float(r['Attendance']) for r in v])}
                for k, v in group_by(data, 'Motivation_Level', ['Low', 'Medium', 'High']).items()}

    by_parent = {k: {'count': len(v), 'avg_score': avg([float(r['Exam_Score']) for r in v])}
                 for k, v in group_by(data, 'Parental_Involvement', ['Low', 'Medium', 'High']).items()}

    by_income = {k: {'count': len(v), 'avg_score': avg([float(r['Exam_Score']) for r in v])}
                 for k, v in group_by(data, 'Family_Income', ['Low', 'Medium', 'High']).items()}

    by_resources = {k: {'count': len(v), 'avg_score': avg([float(r['Exam_Score']) for r in v])}
                    for k, v in group_by(data, 'Access_to_Resources', ['Low', 'Medium', 'High']).items()}

    # Attendance buckets vs score
    attend_buckets = [
        {'label': '<60%', 'min': 0.0, 'max': 60.0},
        {'label': '60-70%', 'min': 60.0, 'max': 70.0},
        {'label': '70-80%', 'min': 70.0, 'max': 80.0},
        {'label': '80-90%', 'min': 80.0, 'max': 90.0},
        {'label': '90%+', 'min': 90.0, 'max': 101.0},
    ]
    attend_score = []
    for b in attend_buckets:
        grp = [float(r['Exam_Score']) for r in data if b['min'] <= float(r['Attendance']) < b['max']]
        attend_score.append({'label': b['label'], 'avg_score': avg(grp), 'count': len(grp)})

    # Hours vs score
    hour_buckets = [
        {'label': '0-10h', 'min': 0.0, 'max': 10.0},
        {'label': '10-20h', 'min': 10.0, 'max': 20.0},
        {'label': '20-30h', 'min': 20.0, 'max': 30.0},
        {'label': '30-40h', 'min': 30.0, 'max': 40.0},
        {'label': '40h+', 'min': 40.0, 'max': 999.0},
    ]
    hour_score = []
    for b in hour_buckets:
        grp = [float(r['Exam_Score']) for r in data if b['min'] <= float(r['Hours_Studied']) < b['max']]
        hour_score.append({'label': b['label'], 'avg_score': avg(grp), 'count': len(grp)})

    # Scatter data (sample 600 for performance)
    random.seed(0)
    sample = random.sample(data, min(600, len(data)))
    scatter_data = [{'x': round(float(r['Attendance']), 1), 'y': round(float(r['Exam_Score']), 1),
                     'hours': r['Hours_Studied'], 'persona': r['persona'],
                     'risk': r['risk_label']} for r in sample]

    # Top risk students table
    high_risk = sorted([r for r in data if r['risk_label'] == 'High'],
                       key=lambda r: float(r['risk_score']), reverse=True)
    risk_table = [{
        'id': i + 1,
        'gender': r['Gender'],
        'school': r['School_Type'],
        'score': r['Exam_Score'],
        'attend': r['Attendance'],
        'hours': r['Hours_Studied'],
        'motiv': r['Motivation_Level'],
        'risk': r['risk_label'],
        'risk_score': r['risk_score'],
        'persona': r['persona'],
        'internet': r['Internet_Access'],
        'tutor': r['Tutoring_Sessions'],
        'prev': r['Previous_Scores'],
        'disability': r['Learning_Disabilities'],
        'peer': r['Peer_Influence'],
    } for i, r in enumerate(high_risk)]

    # All students table (for full-roster view in dashboard)
    all_students_sorted = sorted(data, key=lambda r: float(r['Exam_Score']), reverse=True)
    all_students = [{
        'id': i + 1,
        'gender': r['Gender'],
        'school': r['School_Type'],
        'score': r['Exam_Score'],
        'attend': r['Attendance'],
        'hours': r['Hours_Studied'],
        'motiv': r['Motivation_Level'],
        'risk': r['risk_label'],
        'risk_score': r['risk_score'],
        'persona': r['persona'],
        'internet': r['Internet_Access'],
        'tutor': r['Tutoring_Sessions'],
        'prev': r['Previous_Scores'],
        'disability': r['Learning_Disabilities'],
        'peer': r['Peer_Influence'],
    } for i, r in enumerate(all_students_sorted)]

    kpis = {
        'total': len(data),
        'avg_score': avg([float(r['Exam_Score']) for r in data]),
        'avg_attend': avg([float(r['Attendance']) for r in data]),
        'avg_hours': avg([float(r['Hours_Studied']) for r in data]),
        'high_risk': risk_counts['High'],
        'medium_risk': risk_counts['Medium'],
        'low_risk': risk_counts['Low'],
        'top_cluster': cluster_summaries[0]['name'] if cluster_summaries else '',
        'top_cluster_pct': round((cluster_summaries[0]['count'] / len(data) * 100.0) if cluster_summaries else 0.0, 1),
    }

    # Final output object
    output = {
        'kpis': kpis,
        'norm_stats': norm_stats,
        'centers': mapped_centers,
        'clusters': cluster_summaries,
        'correlations': correlations,
        'score_dist': score_dist,
        'by_school': by_school,
        'by_gender': by_gender,
        'by_motiv': by_motiv,
        'by_parent': by_parent,
        'by_income': by_income,
        'by_resources': by_resources,
        'attend_score': attend_score,
        'hour_score': hour_score,
        'scatter': scatter_data,
        'risk_table': risk_table,
        'all_students': all_students,
        'personas': PERSONA_PROFILES,
    }

    js_content = f"// Auto-generated by preprocess.py — do not edit manually\nconst ANALYTICS = {json.dumps(output, indent=2)};\n"
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    file_kb = len(js_content) // 1024
    print(f"  Written to {OUT_PATH} ({file_kb}KB)")
    print("Done! ✅")

if __name__ == '__main__':
    main()
