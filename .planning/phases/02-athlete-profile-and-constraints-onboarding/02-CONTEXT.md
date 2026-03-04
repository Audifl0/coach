# Phase 2: Athlete Profile and Constraints Onboarding - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Capturer et permettre l'edition des informations profil necessaires au coaching securise: objectif d'entrainement, contraintes de disponibilite/duree/equipement, et limitations physiques exploitables ensuite par les verifications de securite. La generation de programme reste hors phase.

</domain>

<decisions>
## Implementation Decisions

### Parcours d'onboarding
- L'onboarding se declenche des la premiere connexion authentifiee si le profil n'est pas complete.
- Le parcours est une page unique avec sections (pas un wizard multi-etapes).
- Les champs critiques sont obligatoires au premier passage; le reste est editable ensuite.
- Apres sauvegarde reussie, l'utilisateur est redirige vers le dashboard.

### Modele des contraintes profil
- Objectif: choix unique parmi trois valeurs (`hypertrophy`, `strength`, `recomposition`).
- Disponibilite: capture via nombre cible de seances par semaine.
- Duree de seance: choix via plages predefinies (pas saisie libre brute).
- Equipement: checklist de categories structurees.

### Capture des limitations physiques
- Format principal: checklist de zones corporelles avec statut douleur/limitation.
- Intensite: echelle simple 0-3 (`none`, `mild`, `moderate`, `severe`).
- Temporalite: distinction explicite temporaire vs chronique.
- En edition, on conserve l'existant et les changements sont explicites (pas de reset implicite).

### Claude's Discretion
- Le wording exact des labels/aides inline.
- L'ordre visuel fin des sections dans la page unique.
- Le niveau exact de feedback UX (messages succes/erreur) tant que les decisions ci-dessus restent respectees.

</decisions>

<specifics>
## Specific Ideas

- Le flux vise une saisie rapide et pragmatique, sans surcharge initiale.
- Les choix doivent rester simples a modifier plus tard dans le profil.
- Les limitations doivent etre structurees pour alimenter les garde-fous de securite des phases suivantes.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/auth/session-gate.ts`: validation de session reutilisable pour proteger l'acces onboarding/profile.
- `src/server/dal/account-scope.ts`: garde-fous de scope utilisateur pour persister/lire les donnees profil en isolation stricte.
- `src/lib/auth/contracts.ts`: pattern Zod de validation d'entree a etendre avec des contrats profil.
- `src/app/(public)/login/page.tsx` et `src/app/(public)/signup/page.tsx`: pattern de formulaire client (pending + erreurs inline).

### Established Patterns
- Validation serveur explicite avec schemas Zod et erreurs controlees.
- Routes API Next.js orientees payload JSON + statuts HTTP clairs.
- Separation UX/authoritative checks: middleware pour prefiltre UX, validation forte cote serveur.
- Isolation de compte imposee par helpers DAL dedies.

### Integration Points
- Ajout de champs/profil dans `prisma/schema.prisma` lies au `User` existant.
- Nouveaux endpoints profil sous `src/app/api/...` suivant les patterns auth existants.
- Redirection post-login existante vers `/dashboard` a enrichir pour imposer completion onboarding.
- Dashboard prive (`src/app/(private)/dashboard/page.tsx`) comme point d'entree apres completion.

</code_context>

<deferred>
## Deferred Ideas

Aucune - la discussion est restee dans le perimetre de la phase.

</deferred>

---

*Phase: 02-athlete-profile-and-constraints-onboarding*
*Context gathered: 2026-03-04*
