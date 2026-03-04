# Pitfalls Research

**Domain:** AI coaching musculation (web app personnelle)
**Researched:** 2026-03-04
**Confidence:** MEDIUM-HIGH

## Critical Pitfalls

### Pitfall 1: Progression trop agressive qui dépasse la capacité de récupération

**What goes wrong:**
Les charges/volumes augmentent trop vite (ou sans deload), la fatigue s'accumule, la technique se dégrade et l'utilisateur stagne ou se blesse.

**Why it happens:**
Le moteur de recommandation optimise la "progression" sans garde-fous explicites (fatigue, RPE, sommeil, douleur, fréquence réelle).

**How to avoid:**
- Encadrer la progression par des règles de sécurité: paliers max de charge/volume par semaine, deload périodique, seuils RPE/RIR.
- Rendre l'adaptation conservative par défaut pour débutants/intermédiaires.
- Imposer des alternatives automatiques (réduction charge/sets, substitution exercice) quand fatigue/douleur monte.

**Warning signs:**
- Hausse simultanée de fatigue perçue + baisse performance sur 2-3 séances.
- Complétion des séances qui chute.
- Douleurs articulaires récurrentes signalées sur un même pattern (ex: squat/press).

**Phase to address:**
Phase 2 (Moteur de plan + règles de progression) et Phase 4 (Boucle d'adaptation quotidienne).

---

### Pitfall 2: Coaching "halluciné" ou non fondé (consignes confidentes mais erronées)

**What goes wrong:**
L'IA fournit des conseils plausibles mais inexacts (technique, récupération, contre-indications), ce qui dégrade sécurité et confiance.

**Why it happens:**
Usage direct d'un LLM génératif sans couche de contraintes métier, sans validation des sorties et sans policy de refus.

**How to avoid:**
- Utiliser un moteur hybride: règles déterministes + LLM limité au wording/explication.
- Mettre en place des "hard constraints" de sécurité (pas de diagnostics médicaux, pas de prescriptions extrêmes).
- Introduire des checks automatiques avant affichage (bornes de volume/intensité, cohérence avec profil).

**Warning signs:**
- Recommandations contradictoires entre jours similaires.
- Conseils hors scope (médical, supplémentation agressive, protocoles avancés non adaptés).
- Multiplication des overrides manuels utilisateur.

**Phase to address:**
Phase 1 (Safety policy & guardrails) et Phase 3 (Orchestrateur IA avec validation des sorties).

---

### Pitfall 3: Personnalisation faible malgré promesse IA

**What goes wrong:**
Le produit répète des plans génériques, ignore contraintes réelles (temps, matériel, niveau), et l'adhérence chute.

**Why it happens:**
Modèle de données incomplet (profil, historique, disponibilité) ou adaptation non branchée sur les données de suivi réelles.

**How to avoid:**
- Schéma de données riche dès le départ: objectifs, niveau, blessures/limitations, matériel, calendrier.
- Règles explicites de substitution par contrainte (temps court, matériel indisponible, fatigue haute).
- Mesurer la "qualité de personnalisation" (taux de séances adaptées et acceptées).

**Warning signs:**
- Nombre élevé de modifications manuelles des séances proposées.
- Séances recommandées incompatibles avec durée déclarée.
- Taux d'abandon précoce après 2-3 semaines.

**Phase to address:**
Phase 2 (Modélisation profil + plan initial) et Phase 4 (Adaptation continue pilotée par feedback).

---

### Pitfall 4: Données de suivi non fiables (garbage in, garbage out)

**What goes wrong:**
Recommandations dérivent car les logs d'entraînement sont incomplets/incohérents (unités, reps, charge, ressenti).

**Why it happens:**
UX de saisie trop lourde, absence de validations de données, et pas de stratégie pour données manquantes.

**How to avoid:**
- Saisie ultra-rapide (defaults intelligents, duplication de séance, mobile-first).
- Validation stricte: plages plausibles, unités explicites, détection d'anomalies.
- Gestion explicite des données manquantes (fallback conservateur plutôt que supposition optimiste).

**Warning signs:**
- Forte variabilité impossible (ex: +30% charge d'une séance à l'autre sans contexte).
- Champs critiques manquants fréquents (RPE/fatigue).
- Écarts entre ressenti et progression proposée.

**Phase to address:**
Phase 3 (Tracking journalier robuste) et Phase 4 (Adaptation avec quality gates sur les données).

---

### Pitfall 5: Sécurité/réglementation des données santé traitée trop tard

**What goes wrong:**
Le projet collecte des données sensibles (santé, habitudes, parfois localisation) sans gouvernance minimale; le risque légal et de confiance explose.

**Why it happens:**
Projet perso => priorité à la feature delivery, sécurité reportée en "phase finale".

**How to avoid:**
- Privacy by design: minimisation des données, base légale claire, rétention limitée.
- Séparer identifiants et données d'entraînement, chiffrer en transit/au repos.
- Journaliser accès/admin actions et préparer suppression/export utilisateur.

**Warning signs:**
- Accès base brute trop large en interne.
- Logs applicatifs contenant données santé en clair.
- Absence de procédure de suppression compte/données.

**Phase to address:**
Phase 1 (Fondations sécurité et conformité) puis Phase 5 (Hardening VPS, observabilité, runbook incidents).

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adapter uniquement sur performance (sans fatigue/RPE) | Time-to-market rapide | Recommandations risquées, mauvaise récupération | Jamais en production |
| Mettre toute la logique dans les prompts LLM | Implémentation initiale rapide | Non-déterminisme, debug difficile, régressions silencieuses | Prototype interne court |
| Modèle de données minimal (pas de contraintes/limitations) | Schéma simple | Personnalisation faible, refonte coûteuse | MVP très court avec migration planifiée |
| Pas de deload automatique | Plus de "progression" visible | Plateau, sur-fatigue, churn | Jamais si public débutant/intermédiaire |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LLM API | Utiliser sortie brute comme vérité coaching | Validation déterministe + policy de refus + bornes métiers |
| Wearables/sources externes | Supposer précision uniforme des métriques | Marquer confiance par source + fallback manuel utilisateur |
| Auth/session web | Tokens longs et scopes larges | Rotation, scopes minimaux, session invalidation explicite |
| Email/notifications | Nudges excessifs | Fréquence adaptative selon adhérence et préférence user |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recalcul complet du plan à chaque événement | Latence dashboard, coûts IA élevés | Calcul incrémental + cache + jobs async | Dès quelques centaines d'updates/jour |
| Requêtes historiques non indexées | Dashboard lent sur historique | Index temps/utilisateur + agrégations pré-calculées | 6-12 mois de logs actifs |
| Génération IA synchrone dans parcours critique | UX bloquée en saisie post-séance | Queue + réponse fallback immédiate | Usage quotidien régulier |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Stocker données santé en clair (DB/logs/backups) | Exposition de données sensibles | Chiffrement, masquage logs, politique de backup sécurisée |
| Confondre coaching et conseil médical | Risque sécurité utilisateur + conformité | Disclaimers explicites + refus des cas médicaux + escalade pro |
| Secrets VPS dans repo ou `.env` non protégé | Compromission infra et données | Secret manager/permissions strictes + rotation |
| Pas de rate limiting sur endpoints IA | Abus et coûts imprévisibles | Limites par utilisateur/IP + quotas journaliers |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Trop de champs après séance | Friction, abandon de logging | Journal rapide en 60-90s + mode avancé optionnel |
| Recommandations non expliquées | Faible confiance, faible adoption | Donner raison claire: "ajusté car fatigue=8/10" |
| Pas d'option "journée difficile" | Utilisateur décroche quand imprévu | Bouton fallback: séance allégée/express instantanée |
| Feedback ignoré pendant plusieurs jours | Sentiment d'inutilité de l'app | SLA produit: adaptation visible sous 24h |

## "Looks Done But Isn't" Checklist

- [ ] **Programme généré:** vérifier qu'il respecte contraintes temps/matériel réels.
- [ ] **Adaptation automatique:** vérifier qu'elle plafonne la progression en cas de fatigue élevée.
- [ ] **Tracking quotidien:** vérifier gestion des données manquantes sans recommandations agressives.
- [ ] **Dashboard historique:** vérifier lisibilité tendances fatigue/performance par semaine.
- [ ] **Sécurité:** vérifier suppression compte + export données + logs sans données sensibles.
- [ ] **VPS deployment:** vérifier sauvegardes restaurables et procédure incident documentée.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Progression trop agressive | MEDIUM | Geler progression 1-2 semaines, deload global, recalibrer 1RM/charges de travail |
| Conseils IA erronés | HIGH | Désactiver flow IA fautif via feature flag, fallback règles, audit prompts/validateurs |
| Personnalisation insuffisante | MEDIUM | Recollecter contraintes utilisateur, regénérer baseline plan, ajouter règles de substitution |
| Données incohérentes | MEDIUM | Lancer routine de nettoyage + marquage "low confidence" + mode conservateur |
| Incident données | HIGH | Rotation secrets, isolation service, notification utilisateur, post-mortem et patch |

## Pitfall-to-Phase Mapping (Recommended)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Progression trop agressive | Phase 2: Rules Engine de programmation | Tests UAT avec profils fatigue élevée -> charge/volume réduits automatiquement |
| Hallucinations coaching | Phase 1: Safety policy + Phase 3: IA orchestrée | Suite de prompts adversariaux sans sortie dangereuse |
| Personnalisation faible | Phase 2: Profiling et génération initiale | Taux d'acceptation plan initial et faible taux d'override manuel |
| Données non fiables | Phase 3: Tracking et validation données | Taux d'erreurs saisie < seuil défini + anomalies détectées |
| Sécurité/réglementation tardive | Phase 1 puis Phase 5: Hardening prod | Audit accès/logs + test suppression/export + checklists incident |
| Chute d'adhérence utilisateur | Phase 4: Boucle adaptation + UX quotidienne | Rétention S2/S4 et complétion hebdo au-dessus des cibles |

## Recommended Phase Mapping

1. **Phase 1 - Safety & Data Governance Foundation**
   - Guardrails IA, règles d'exclusion médicale, privacy by design, auth/sécurité de base.
2. **Phase 2 - Coaching Core (Profil + Programme + Progression sûre)**
   - Moteur de plan personnalisé, progression bornée, deload/substitution.
3. **Phase 3 - Daily Tracking + IA Orchestration Reliability**
   - Journal de séance robuste, validation de données, orchestration LLM avec validateurs.
4. **Phase 4 - Adaptive Loop + Engagement**
   - Ajustements quotidiens explicables, fallback "journée difficile", nudges maîtrisés.
5. **Phase 5 - Production Hardening on VPS**
   - Observabilité, incident response, backup/restore, audits sécurité/conformité.

## Sources

- ACSM position stand sur modèles de progression en résistance (Med Sci Sports Exerc, 2009): https://pubmed.ncbi.nlm.nih.gov/19204579/
- WHO Guidelines on Physical Activity and Sedentary Behaviour (2020): https://www.who.int/publications/i/item/9789240015128
- ACSM preparticipation screening update (2015): https://pubmed.ncbi.nlm.nih.gov/26473759/
- WHO Ethics and Governance of AI for Health (2021): https://www.who.int/publications/i/item/9789240029200
- NIST AI Risk Management Framework 1.0: https://www.nist.gov/itl/ai-risk-management-framework
- NIST Generative AI Profile (2024): https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- EDPB guidance on processing health data (GDPR context): https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines_en
- Case study privacy leak via fitness heatmaps (Strava): https://www.theverge.com/2018/1/28/16942610/strava-heatmap-military-base-location-gps

---
*Pitfalls research for: AI fitness/musculation coaching*
*Researched: 2026-03-04*
