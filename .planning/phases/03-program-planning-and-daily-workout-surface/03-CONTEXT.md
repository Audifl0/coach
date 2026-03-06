# Phase 3: Program Planning and Daily Workout Surface - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Generer une programmation hebdomadaire actionnable a partir du profil utilisateur, exposer clairement la seance du jour sur le dashboard, et permettre un remplacement d'exercice avec equivalences sures. Cette phase clarifie le "quoi afficher" et le comportement produit, sans couvrir la saisie detaillee des logs de seance.

</domain>

<decisions>
## Implementation Decisions

### Vue dashboard du jour
- Le bloc prioritaire en haut de page est la **seance du jour**.
- La vue doit etre **compacte avec ouverture de detail** (pas tout le detail affiche en permanence).
- S'il n'y a pas de seance aujourd'hui, afficher la **prochaine seance planifiee**.
- L'action principale de la vue est **Commencer seance**.

### Structure du split hebdomadaire
- Le planning fonctionne en **fenetre glissante sur 7 jours** (pas force a la semaine calendaire).
- Le systeme propose un **ordre recommande**, mais l'utilisateur garde le **choix du jour reel** d'execution.
- Le split reste **stable avec ajustements legers**.
- La continuite multi-semaines est importante: les exercices de base ne doivent pas changer brutalement d'une semaine a l'autre.
- La logique doit rester compatible avec d'autres pratiques sportives (running/velo) via un rappel d'auto-regulation, sans bloquer l'utilisateur.

### Prescription par exercice
- Les repetitions ciblees sont **fixes** (pas de fourchette par defaut).
- L'intensite ciblee est exprimee via **charge uniquement**.
- Les temps de repos sont affiches en **plages recommandees**.
- Pas d'explication longue par exercice: presentation orientee execution.

### Remplacement d'exercice
- Le remplacement se declenche via un **bouton directement sur l'exercice**.
- Presenter un **Top 3** des equivalents proposes.
- Validation d'equivalence en mode **tres strict securite**:
  - respect des limitations
  - respect du materiel disponible
  - pattern de mouvement proche
- Un remplacement valide s'applique a **la seance du jour uniquement**.

### Claude's Discretion
- Le wording exact des libelles et micro-copies sur dashboard/programme.
- Le style visuel fin de la vue compacte (cartes, listes, densite precise).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/(private)/dashboard/page.tsx`: point d'entree deja protege et route selon la completion du profil; base naturelle pour injecter la vue "seance du jour".
- `src/lib/profile/contracts.ts`: contrat profil structure (objectif, frequence, duree, materiel, limitations) deja pret pour alimenter les regles de generation du split.
- `src/app/api/profile/route.ts`: endpoint existant pour recuperer le profil, reutilisable pour preparer la planification personnalisee.
- `prisma/schema.prisma` (`AthleteProfile`): stockage deja en place des contraintes athlete necessaires a PROG-01.

### Established Patterns
- Validation explicite via schemas Zod et erreurs controlees.
- Pages privees client-first avec chargement initial API puis rendu simple.
- Separation nette entre garde auth/session et logique metier.

### Integration Points
- Etendre le domaine de donnees (nouveaux modeles programme/seance planifiee) autour du `User` et de `AthleteProfile`.
- Enrichir `dashboard/page.tsx` pour afficher "today workout" + "next action" en vue unique.
- Ajouter des routes API dediees a la generation/lecture du plan hebdo et au remplacement d'exercice.

</code_context>

<specifics>
## Specific Ideas

- Experience orientee action quotidienne: l'utilisateur doit savoir quoi faire en quelques secondes.
- Le systeme montre les prochaines seances, mais l'utilisateur choisit son jour selon sa vie reelle et ses autres sports.
- Conserver une logique de progression continue, sans changements de programme erratiques.

</specifics>

<deferred>
## Deferred Ideas

- Saisie complete "book de seance" (toutes reps + charges en continu pendant la seance) a traiter en phase 4 Session Logging pour rester dans le perimetre.

</deferred>

---

*Phase: 03-program-planning-and-daily-workout-surface*
*Context gathered: 2026-03-04*
