# Phase 5: Adaptive Coaching and Safety Guardrails - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Produire des ajustements conservateurs et explicables pour la seance suivante (progress/hold/deload/substitution), avec controle utilisateur sur les changements a fort impact et garde-fous de securite actifs. Cette phase couvre la logique de recommandation, la gouvernance de decision, et son rendu dashboard (forecast), sans ouvrir de nouvelles capacites hors perimetre roadmap.

</domain>

<decisions>
## Implementation Decisions

### Cerveau coaching (LLM-first)
- Le **LLM est le decideur principal** des recommandations (exercices, reps, charge, action progress/hold/deload/substitution).
- Les decisions doivent etre **interconnectees**: profil athlete, contraintes, limitations/douleurs, historique recent, adherence, feedback fatigue/readiness.
- Le systeme conserve une posture prudente: recommandations conservatrices par defaut en cas d'incertitude.

### Gouvernance scientifique
- La logique coaching doit etre fondee sur une documentation scientifique reconnue du milieu sport/sport science.
- Politique retenue: **mix large** (consensus/guidelines + revues/travaux de reference + expertise pratique reputee) avec tracabilite des principes utilises.
- Le savoir scientifique/expertise est stocke dans un **dossier local versionne** (Markdown/JSON) pour auditabilite et reproductibilite.
- Alimentation du corpus via **agent dedie**: recherche web de litterature sport pertinente, synthese structuree, et controles de coherence.
- Gouvernance retenue: **mise a jour automatique** avec verification reguliere de la qualite du corpus.

### Confirmations utilisateur (ADAP-03)
- Confirmation obligatoire pour changements a fort impact: **deload** et **substitution**.
- Les progressions standards dans les bornes SAFE-01 ne sont pas traitees comme "fort impact".
- Validite de confirmation: **seance suivante uniquement**.
- Surface dashboard: **banniere explicite** avec raison, impact, et actions Accepter/Refuser.

### Garde-fous securite (SAFE-01/02/03 + DASH-03)
- SAFE-01: bornes de progression **strictes moderees** (pas de saut agressif).
- SAFE-02: en conflit limitation/douleur, **alerter mais autoriser** la decision utilisateur.
- SAFE-03: si sortie LLM invalide/indisponible ou confiance insuffisante, fallback: **conserver la derniere recommandation appliquee uniquement si elle reste conservative (SAFE-01), sinon hold conservateur**.
- DASH-03: afficher une **carte "Prevision prudente"** quand warning/fallback est actif.

### Acces connaissance et explications
- Acces du LLM au corpus via **RAG top-k** contraint par regles de priorite et garde-fous.
- Les explications utilisateur doivent inclure **2-3 raisons** et une **source abregee** (guide/revue/expertise) pour transparence.

### Claude's Discretion
- Seuils numeriques exacts des bornes "strictes moderees" tant qu'ils restent prudents.
- Microcopy exacte des raisons/alertes et du message "Prevision prudente".
- Modele de presentation des justifications (2-3 raisons actionnables) dans le dashboard.

</decisions>

<specifics>
## Specific Ideas

- Le cerveau coaching attendu doit prendre beaucoup de decisions via LLM, pas seulement expliquer.
- La recommandation doit relier automatiquement les caracteristiques athlete et les donnees de seance pour proposer les exos/reps/poids adequats.
- L'approche doit rester scientifiquement defendable et lisible pour l'utilisateur.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/program/planner.ts`: base deterministe existante, utile comme cadre de bornage/backup autour du decideur LLM.
- `src/lib/program/contracts.ts`: schemas/parse helpers Zod pour contractualiser recommandations, raisons, warnings, et forecast.
- `src/server/dal/program.ts`: primitives account-scoped et historiques de seance reutilisables pour fournir le contexte athlete au moteur de decision.
- `src/app/(private)/dashboard/page.tsx` + composants dashboard: points d'integration pour banniere de confirmation et carte forecast.

### Established Patterns
- Validation stricte d'entrees/sorties via contrats explicites.
- Isolation par compte et masquage ownership deja etablis.
- UX dashboard compacte et orientee action.

### Integration Points
- Ajouter une couche "adaptive-coaching" qui orchestre le contexte athlete + appel LLM + garde-fous.
- Exposer endpoint(s) de recommandation et endpoint de confirmation impact eleve.
- Integrer rendu dashboard pour justification, warning securite, et forecast prudent.
- Ajouter un pipeline knowledge pour generer/mettre a jour les fichiers Markdown/JSON du corpus scientifique et expertise reputee.

</code_context>

<deferred>
## Deferred Ideas

- Recommandation 100% autonome sans garde-fous de securite.
- Extension hors perimetre phase 5 (tendances avancees phase 6, nutrition, social, etc.).

</deferred>

---

*Phase: 05-adaptive-coaching-and-safety-guardrails*
*Context gathered: 2026-03-05*
