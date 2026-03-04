# Coach Virtuel Musculation IA

## What This Is

Assistant de coaching sportif spécialisé en musculation, pensé pour un usage personnel et déployé sur VPS avec un dashboard web. Le produit génère des programmes, suit l'exécution journalière et adapte les séances selon le profil, la progression, la fatigue et les retours utilisateur. L'IA agit comme recommandation assistée: elle propose des ajustements fiables que l'utilisateur peut valider.

## Core Value

Fournir un coaching musculation personnalisé, sûr et adaptatif au quotidien, sans perdre la simplicité d'usage.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Générer un programme de musculation personnalisé selon profil, objectifs et disponibilité.
- [ ] Permettre le suivi journalier des séances (exercices, charges, répétitions, ressenti).
- [ ] Adapter automatiquement les recommandations de séance en fonction de la progression et de la fatigue déclarée.
- [ ] Fournir un dashboard web clair pour visualiser plan, historique et prochaines actions.
- [ ] Déployer l'application complète sur un VPS avec une exploitation simple.

### Out of Scope

- Monétisation (abonnement, freemium, paiements) — projet personnel non commercial en V1.
- Fonctionnalités communautaires (social, challenges, classements) — non essentielles à la valeur cœur de coaching individuel.
- Module nutrition complet — reporté pour garder une V1 focalisée sur la musculation.

## Context

Le besoin principal est un coach augmenté par IA capable de couvrir les situations courantes de coaching en musculation tout en tenant compte de paramètres utilisateur variés (niveau, objectif, fatigue, contraintes de temps, historique d'entraînement). Le produit cible en priorité un public débutant/intermédiaire avec une expérience web orientée action quotidienne. La qualité attendue est la fiabilité des recommandations avant la sophistication fonctionnelle.

## Constraints

- **Safety**: Recommandations fiables et prudentes — priorité explicite donnée à la sécurité d'entraînement.
- **Scope**: V1 limitée à programme + suivi + adaptation — éviter la dispersion produit.
- **Deployment**: Hébergement VPS requis — architecture déployable de bout en bout sans dépendance plateforme propriétaire.
- **Business**: Projet personnel non commercial — pas d'exigence de billing ni growth features.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cibler débutants/intermédiaires en V1 | Réduire la complexité et maximiser la clarté du coaching | — Pending |
| IA en mode recommandation assistée | Garder l'humain en contrôle et limiter les erreurs d'automatisation | — Pending |
| Prioriser fiabilité/sécurité plutôt que vitesse pure | Produit de coaching: la confiance prime sur la vélocité | — Pending |
| Exclure la monétisation en V1 | Projet personnel, objectif principal = efficacité coaching | — Pending |
| Déployer sur VPS avec dashboard web | Contrainte explicite de déploiement et d'usage | — Pending |

---
*Last updated: 2026-03-04 after initialization*
