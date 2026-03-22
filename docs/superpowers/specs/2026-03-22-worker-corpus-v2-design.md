# Worker Corpus V2 — Bibliothèque Scientifique Profonde

**Date:** 2026-03-22
**Statut:** Approuvé
**Approche:** Évolution incrémentale du worker existant

## Objectif

Transformer le worker corpus en un système capable de :
1. Explorer en profondeur la littérature scientifique sport/musculation via PubMed, Crossref, OpenAlex, PubMed Central et Unpaywall
2. Récupérer le texte complet des études open access quand disponible
3. Produire des fiches structurées détaillées par étude via GPT-4o-mini
4. Synthétiser des principes thématiques riches avec nuances, conditions d'application et références
5. Générer un livret markdown en français consultable par un humain
6. Enrichir le contexte scientifique injecté dans le prompt du LLM de génération de programmes

## Contraintes

- Construire sur le worker existant (connecteurs, lease, quality gates, dashboard)
- Chaque slice est testable et déployable indépendamment
- Le worker continue de fonctionner en prod pendant les améliorations
- Budget OpenAI bootstrap complet < $5, run hebdomadaire < $0.10
- Timeout OpenAI à 60s pour les extractions full-text

## Architecture

### Flux de données

```
[Discovery élargie] → [Ingest paginé] → [Full-text acquisition] → [Extraction GPT structurée] → [Ranking] → [Synthèse thématique GPT] → [Knowledge Bible JSON] → [Livret Markdown FR]
                                                                                                                                              ↓
                                                                                                                                    [Prompt LLM génération programmes]
```

### Couche 1 — Collecte profonde

**Discovery élargie :**
- Passer de 6 queries à 20-30 queries spécialisées couvrant les sous-topics
- Topics existants (progression, hypertrophy-dose, fatigue-readiness, limitations-pain, population-context, exercise-selection) enrichis avec des sous-queries ciblées
- Ajout de topics : périodisation, repos inter-séries, échauffement, nutrition péri-training (limité aux interactions avec la performance), mobilité

**Pagination profonde :**
- Passer de 1 page (20 résultats) à 5 pages par query (100 résultats)
- PubMed : utiliser `retstart` pour paginer esearch + efetch par batch de 20
- OpenAlex : utiliser le paramètre `page` natif
- Crossref : utiliser `offset` pour paginer

**Nouveaux connecteurs :**
- **PubMed Central (PMC)** : API `efetch` avec `db=pmc` pour récupérer le XML full-text des articles open access
- **Unpaywall** : API `https://api.unpaywall.org/v2/{doi}` pour détecter les PDF/HTML open access via DOI — ne nécessite qu'un email comme identifiant

**Objectifs de volume :**
- Run refresh : ~200-400 papers bruts → ~80-120 normalisés → ~30-50 sélectionnés pour extraction
- Bootstrap (3-5 runs) : ~1000-1500 papers indexés au total
- Full-text disponible estimé : ~20-30% des papers (open access)

### Couche 2 — Extraction structurée profonde

**Fiche structurée par étude :**

```typescript
type StudyCard = {
  recordId: string;
  title: string;
  authors: string;          // premiers auteurs + "et al."
  year: number;
  journal: string;
  doi: string | null;
  
  // Extraction structurée
  studyType: 'rct' | 'meta-analysis' | 'systematic-review' | 'cohort' | 'case-study' | 'guideline' | 'narrative-review';
  population: {
    description: string;    // "32 hommes entraînés, 20-30 ans, >1 an d'expérience"
    size: number | null;
    trainingLevel: 'novice' | 'intermediate' | 'advanced' | 'mixed' | null;
  };
  protocol: {
    duration: string;       // "12 semaines"
    intervention: string;   // "3x/sem squat + bench press, progression linéaire 2.5kg/sem"
    comparison: string | null; // "groupe contrôle : charge fixe"
  };
  results: {
    primary: string;        // "Augmentation significative de la force 1RM (+12% vs +4%)"
    secondary: string[];    // résultats secondaires notables
  };
  practicalTakeaways: string[];  // 2-3 bullet points exploitables pour la prescription
  limitations: string[];         // biais, taille d'échantillon, etc.
  safetySignals: string[];       // alertes pertinentes pour la sécurité
  evidenceLevel: 'high' | 'moderate' | 'low';
  topicKeys: string[];           // tags thématiques
  
  // Métadonnées d'extraction
  extractionSource: 'full-text' | 'abstract';
  langueFr: {
    titreFr: string;
    resumeFr: string;       // résumé en français de 3-5 phrases
    conclusionFr: string;   // conclusion pratique en 1-2 phrases
  };
};
```

**Processus d'extraction :**
1. Pour chaque paper sélectionné après ranking, vérifier si le full-text est disponible (PMC ou Unpaywall)
2. Si full-text : envoyer les sections clés (abstract, methods, results, discussion, conclusion) à GPT-4o-mini avec le schema `StudyCard`
3. Si abstract seulement : extraction plus légère mais même format de sortie
4. Validation du JSON retourné contre le schema strict
5. Lots de 3-4 papers par appel API pour optimiser le débit

### Couche 3 — Synthèse thématique + livrables

**Synthèse thématique :**

Pour chaque topic (progression, hypertrophie-dose, fatigue-readiness, etc.) :
1. Rassembler toutes les StudyCards du topic
2. Envoyer à GPT-4o-mini avec prompt de consolidation
3. Produire un `ThematicSynthesis` :

```typescript
type ThematicSynthesis = {
  topicKey: string;
  topicLabel: string;
  principlesFr: Array<{
    id: string;
    title: string;
    statement: string;      // 2-3 phrases : le principe avec nuances
    conditions: string[];   // quand ça s'applique, quand ça ne s'applique pas
    guardrail: 'SAFE-01' | 'SAFE-02' | 'SAFE-03';
    evidenceLevel: 'strong' | 'moderate' | 'emerging';
    sourceCardIds: string[];
  }>;
  summaryFr: string;        // synthèse narrative 1 paragraphe
  gapsFr: string[];         // ce qu'on ne sait pas encore / controverses
  studyCount: number;
  lastUpdated: string;
};
```

**Knowledge Bible JSON enrichie :**

Le `knowledge-bible.json` publié contiendra :
- Les `ThematicSynthesis` par topic (principes détaillés, conditions, niveaux d'évidence)
- Les `StudyCard` référencées (fiches études complètes)
- Un index par tag pour la recherche rapide
- Les métadonnées de couverture (topics couverts, nombre d'études, fraîcheur)

**Livret Markdown FR :**

Document généré automatiquement depuis les mêmes données :
```
# Bibliothèque Scientifique — Coach Musculation IA
## Généré le {date} — {n} études analysées

### 1. Progression et Surcharge Progressive
#### Synthèse
{summaryFr du topic}

#### Principes
- **Principe 1 : {title}** — {statement}
  - Conditions d'application : {conditions}
  - Niveau d'évidence : {evidenceLevel}

#### Études de référence
| Étude | Type | Population | Résultat principal | Takeaway |
|-------|------|------------|-------------------|----------|
| {titreFr} ({year}) | {studyType} | {population} | {primary result} | {takeaway} |

### 2. Volume et Dose d'Entraînement
...

### Bibliographie complète
- {doi} — {title} ({year}), {journal}
```

### Lien avec la génération de programmes

**Enrichissement du prompt :**

`loadCoachKnowledgeBible()` sera adapté pour :
- Charger les `ThematicSynthesis` pertinentes pour le profil (filtrées par tags : goal, limitations, niveau)
- Sélectionner les `StudyCard` les plus pertinentes avec leurs `practicalTakeaways`
- Passer de `principleLimit: 4, sourceLimit: 4` à `principleLimit: 6, sourceLimit: 8`
- Injecter les conditions d'application pour que le LLM sache quand appliquer ou ne pas appliquer un principe

**Validation de provenance :**

Le LLM de génération devra référencer des `evidencePrincipleIds` et `evidenceSourceIds` existants dans la bible. Ça garantit que chaque choix de programme est traçable vers une étude scientifique réelle.

## Slices d'implémentation

1. **Discovery élargie + pagination** — sous-queries par topic, pagination multi-pages, budgets augmentés
2. **Connecteurs PMC + Unpaywall** — récupération full-text open access
3. **Extraction GPT structurée (StudyCards)** — fiches détaillées par étude avec schema strict
4. **Synthèse thématique GPT** — consolidation par topic en principes riches
5. **Livret markdown FR** — génération automatique du document lisible
6. **Enrichissement prompt génération programmes** — intégration knowledge bible v2 dans le flux de génération

## Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Rate limiting APIs sources | Collecte lente | Retry avec backoff, budget par run borné |
| Coût OpenAI dépasse budget | Dépassement financier | Budget cap par run, lots bornés |
| Full-text non disponible (paywall) | Extraction superficielle | Fallback abstract, Unpaywall en complément |
| Qualité extraction GPT variable | Fiches incohérentes | Schema strict + validation, rejet des fiches invalides |
| Prompt trop long pour génération | Token overflow | Sélection par pertinence, résumés compacts |
