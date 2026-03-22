# Worker Corpus V3 — Chercheur Scientifique Continu et Conservateur

**Date:** 2026-03-22
**Statut:** Approuvé en discussion, formalisé pour revue
**Approche:** Évolution incrémentale du worker existant vers un système de recherche continue, méthodique et conservateur

## Objectif

Transformer le worker corpus en un **chercheur scientifique logiciel continu** capable de :

1. Travailler en permanence sur le corpus scientifique sport/musculation au lieu de fonctionner comme un simple pipeline de refresh.
2. Accumuler, organiser, relire et consolider des documents sur une durée longue sans perdre l'état du travail.
3. Produire des **dossiers d'études structurés** fidèles aux papiers, sans extrapolation prématurée.
4. Organiser la connaissance autour de **questions scientifiques explicites**, avec critères d'inclusion, contradictions, couverture et maturité.
5. N'émettre des **principes forts** que lorsque la preuve est suffisante, la provenance est traçable et les contradictions ont été traitées.
6. Alimenter le générateur de programmes via une **doctrine stable publiée**, et non via le corpus brut ou des synthèses instables.
7. Exposer un **dashboard de supervision scientifique** orienté lecture/surveillance pour comprendre l'état du travail, le flux, les blocages et la maturité des connaissances.

## Intention produit

Le système cible ne doit pas être optimisé d'abord pour le coût, la rapidité, ou le nombre de principes produits. Il doit être optimisé pour :

- la qualité de lecture,
- la rigueur de structuration,
- la prudence de conclusion,
- la gestion des contradictions,
- la capacité à réviser ses positions,
- la traçabilité intégrale de la doctrine publiée.

Le temps long n'est pas un bug. Si le système a besoin de dizaines d'heures pour consolider sérieusement une zone scientifique, ce comportement est conforme au produit attendu.

---

## Positionnement architectural

### Recommandation retenue

**Approche A — pipeline profond par étapes**, renforcé par une discipline méthodologique inspirée d'une **revue scientifique continue**.

Cela signifie :
- garder l'ossature évolutive du worker existant,
- éviter une réécriture totale,
- mais changer profondément le modèle de travail : on passe d'un pipeline de refresh/snapshot à un système de recherche permanent avec mémoire durable, états intermédiaires et publication conservatrice.

### Ce que le système n'est pas

Le système cible n'est pas :
- un simple crawler d'articles,
- un résumeur rapide de lots,
- un pipeline qui transforme directement documents → principes,
- un moteur qui donne le corpus brut au LLM de génération de programmes.

Le système cible est :
- une mémoire scientifique persistante,
- un moteur de lecture/extraction progressive,
- un système de dossiers et de questions scientifiques,
- un producteur de doctrine publiable prudente.

---

## Architecture cible

Le worker fonctionne sur **deux rythmes simultanés**.

### 1. Rythme de collecte continue

Travail de fond permanent :
- découverte de nouveaux documents,
- approfondissement des requêtes,
- pagination longue,
- acquisition abstract/full-text,
- enrichissement des identifiants,
- alimentation des files de travail.

### 2. Rythme de consolidation lente

Travail scientifique plus lent :
- extraction structurée étude par étude,
- regroupement par question scientifique,
- analyse des convergences et contradictions,
- révision des positions existantes,
- publication seulement si le seuil conservateur est atteint.

### Conséquence structurante

**Collecte et publication sont découplées.**

Le système peut :
- découvrir beaucoup,
- lire beaucoup,
- extraire beaucoup,
- lier beaucoup de travail à des questions,

sans publier immédiatement de nouveaux principes robustes.

C'est attendu.

---

## Modèle de maturité scientifique

Le worker ne passe plus directement de documents à synthèse. Il travaille en couches.

### Couche 1 — Document

Chaque document suit des états de maîtrise documentaire :
- découvert,
- métadonnées validées,
- abstract acquis,
- full-text acquis,
- extractible,
- extrait,
- revu structurellement,
- lié à une ou plusieurs questions scientifiques.

Cette couche ne produit pas encore de connaissance. Elle produit une bibliothèque documentaire fiable et durable.

### Couche 2 — Étude structurée

Chaque étude devient un dossier stable contenant au minimum :
- population,
- protocole,
- variables / outcomes,
- durée,
- niveau d'évidence,
- limites,
- signaux de sécurité,
- contexte d'applicabilité,
- ce que l'étude montre,
- ce qu'elle ne montre pas,
- ce qu'on ne peut pas conclure.

Cette couche doit être fidèle au papier, prudente, et relisible.

### Couche 3 — Question scientifique

La connaissance est ensuite organisée autour de **questions de recherche explicites**, par exemple :
- Quel volume hebdomadaire favorise l'hypertrophie chez pratiquants intermédiaires ?
- Les temps de repos longs améliorent-ils davantage la force maximale que les temps courts ?
- Dans quels contextes l'autorégulation améliore-t-elle la progression ?

Chaque question possède :
- une formulation claire,
- des critères d'inclusion/exclusion,
- un ensemble d'études liées,
- un état de couverture,
- une carte des convergences,
- une carte des contradictions,
- une conclusion actuelle,
- un niveau de confiance,
- un état de maturité scientifique,
- les prochains besoins de travail.

### Couche 4 — Doctrine publiable

Un principe publié est un **résultat de recherche consolidé**, pas un simple résumé de lot.

Chaque principe publié doit contenir :
- une formulation française propre,
- les conditions d'application,
- les limites,
- le niveau de preuve,
- les garde-fous,
- les questions scientifiques justificatives,
- les études de support,
- un historique de révision.

---

## Rigueur méthodologique

Le système doit respecter des règles explicites.

### 1. Séparation stricte entre extraction et conclusion

Le worker sépare :
- lecture d'étude,
- interprétation,
- conclusion générale,
- publication doctrinale.

Aucune conclusion générale robuste ne doit être produite directement au niveau de la fiche d'étude.

### 2. Contradiction obligatoire

Chaque question scientifique doit intégrer :
- les signaux convergents,
- les signaux divergents,
- les raisons plausibles des écarts,
- les zones encore incertaines.

Les contradictions ne sont pas un cas de bord ; elles font partie du travail central.

### 3. Seuil conservateur de publication

Un principe fort ne devient publiable que si le dossier satisfait des critères explicites, par exemple :
- volume minimal d'études pertinentes,
- diversité suffisante des sources,
- limites clairement exposées,
- aucune contradiction majeure non traitée,
- applicabilité explicitée,
- formulation prudente.

Si le dossier ne passe pas ces critères, la question reste ouverte.

### 4. Provenance relisible par humain

Tout principe publié doit être retraçable jusqu'à :
- la ou les questions scientifiques,
- les études support,
- les extraits structurés,
- les contradictions recensées,
- la justification du niveau de confiance.

### 5. Révision continue

Un principe publié peut être :
- nuancé,
- abaissé,
- suspendu,
- retiré,
- remplacé.

Le système doit garder l'historique des versions et les motifs de révision.

---

## Registres persistants

Le système cible ne peut plus reposer uniquement sur des snapshots de run. Il doit disposer de registres durables.

### Registre 1 — Bibliothèque documentaire

Contient :
- documents découverts,
- identifiants normalisés (DOI, PMID, PMCID),
- source d'origine,
- disponibilité OA/full-text,
- état de lecture documentaire,
- historique des tentatives d'acquisition.

### Registre 2 — Dossiers d'études

Contient :
- fiches structurées versionnées,
- niveau de complétude,
- confiance structurelle,
- liens vers documents,
- historique de ré-extraction / révision.

### Registre 3 — Questions scientifiques

Contient :
- formulation,
- critères d'inclusion/exclusion,
- études liées,
- convergences,
- contradictions,
- couverture,
- conclusion actuelle,
- maturité,
- état publiable ou non.

### Registre 4 — Doctrine publiée

Contient :
- principes actifs,
- niveau de preuve,
- limites,
- conditions,
- provenance,
- historique de révision,
- statut actif/révisé/retiré.

---

## Flux continu de travail

Le worker devient un système à files de travail persistantes.

### Files de travail principales

- file de découverte,
- file d'acquisition documentaire,
- file d'acquisition full-text,
- file d'extraction étude,
- file de liaison étude → question,
- file de revue des contradictions,
- file de consolidation conservative,
- file de publication / révision doctrinale.

### Propriété importante

Le système peut travailler sur plusieurs temporalités en parallèle :
- un document récemment découvert peut entrer en acquisition,
- une étude ancienne peut être ré-extraite,
- une question ouverte depuis des jours peut être révisée,
- un principe publié peut être dégradé suite à une nouvelle contradiction.

---

## Sorties humaines

Le système doit produire trois sorties distinctes.

### 1. Journal de recherche

But : suivre le travail du worker.

Contient :
- nouveaux documents,
- acquisitions full-text,
- extractions récentes,
- questions ouvertes ou révisées,
- blocages méthodologiques,
- révisions de doctrine.

### 2. Dossiers scientifiques

But : voir l'état réel des questions de recherche.

Contient :
- état de couverture,
- études liées,
- contradictions,
- zones d'incertitude,
- maturité,
- potentiel de publication.

### 3. Doctrine publiée

But : fournir une base exploitable par le coach générateur.

Contient uniquement :
- principes robustes,
- conditions,
- limites,
- confiance,
- provenance compacte.

---

## Contrat avec le générateur de programmes

Le générateur de programmes **ne doit pas consommer directement** :
- le corpus brut,
- les abstracts,
- les full-text,
- les fiches d'études non consolidées,
- les contradictions encore ouvertes,
- les hypothèses en cours.

### Couche d'injection recommandée

#### Couche A — Principes applicables
Sélectionnés selon :
- objectif,
- niveau,
- contraintes,
- matériel,
- contexte d'adhérence.

#### Couche B — Conditions / exclusions
Exemples :
- surtout valable chez intermédiaires,
- prudence si douleur active,
- applicable sous hypothèse de récupération suffisante,
- non robuste chez débutants complets.

#### Couche C — Justification compacte
- question scientifique source,
- 1 à 2 études-support,
- niveau de confiance,
- date / version de révision.

### Principe directeur

Le worker est le **moteur de recherche lente**.
Le générateur de programmes est le **moteur d'application prudente**.

---

## Dashboard de supervision scientifique

Le dashboard doit évoluer d'un tableau de pipeline à un **poste de lecture/surveillance**.

### Portée retenue

Le dashboard est orienté :
- lecture,
- filtrage,
- compréhension,
- diagnostic,
- surveillance.

Il ne vise pas, dans cette phase, l'édition forte ni les décisions manuelles directes sur le contenu scientifique.

### Vue 1 — Flux de travail

Montre :
- files de travail,
- volumes en attente / en cours / bloqués,
- items vieillissants,
- erreurs récurrentes,
- goulets d'étranglement.

### Vue 2 — Bibliothèque documentaire

Montre :
- documents par état,
- filtres par topic / source / année / OA / full-text,
- avancement de lecture,
- couverture documentaire.

### Vue 3 — Questions scientifiques

Montre :
- questions existantes,
- couverture,
- maturité,
- contradictions ouvertes,
- statut publiable / non publiable / à revoir.

### Vue 4 — Doctrine publiée

Montre :
- principes actifs,
- niveau de confiance,
- dernières révisions,
- provenance,
- changements récents.

### Rôle produit du dashboard

Le dashboard sert à répondre à des questions comme :
- Où le worker passe-t-il son temps ?
- Quels thèmes stagnent ?
- Où sont les contradictions non résolues ?
- Quelles questions sont proches d'un seuil publiable ?
- Quelle doctrine a changé récemment ?

---

## Transformation depuis l'existant

### Étape 1 — mémoire scientifique persistante

Objectif : sortir du modèle purement snapshot.

À introduire :
- registre documentaire,
- registre d'études,
- états persistants,
- files de travail durables,
- vues snapshot comme projections et non comme source unique de vérité.

### Étape 2 — questions scientifiques et consolidation conservatrice

Objectif : passer de synthèses par topic à dossiers de recherche.

À introduire :
- questions scientifiques versionnées,
- règles d'inclusion/exclusion,
- mapping études → questions,
- moteur de contradiction,
- statut de maturité,
- seuil conservateur de publication.

### Étape 3 — séparation officielle des trois sorties

Objectif : produire des surfaces distinctes pour :
- journal de recherche,
- dossiers scientifiques,
- doctrine publiée.

### Recommandation de milestone suivant

Le prochain milestone de fond devrait être :

**Mémoire scientifique persistante + questions de recherche + publication conservatrice + dashboard de supervision scientifique**

Pas simplement :
- plus de connecteurs,
- plus de full-text,
- plus de prompts GPT.

---

## Non-objectifs de cette phase

Ne pas viser immédiatement :
- une base argumentative complète de type graphe logique formel,
- une édition humaine complète depuis le dashboard,
- une réécriture totale de l'architecture applicative,
- une automatisation “autonome” non traçable,
- une injection directe du corpus brut dans le LLM de génération.

---

## Risques et réponses

| Risque | Impact | Réponse |
|--------|--------|---------|
| Le système lit beaucoup mais publie peu | frustration court terme | comportement normal pour un mode conservateur ; exposer la maturité via dashboard |
| Accumulation d'état complexe | dette opérationnelle | registres explicites, files persistantes, observabilité dédiée |
| Sur-interprétation LLM dans les fiches d'étude | dégradation scientifique | séparation stricte extraction / conclusion + validation structurée + révision |
| Contradictions mal gérées | doctrine fragile | moteur explicite de contradiction au niveau question scientifique |
| Doctrine trop lourde pour le générateur | prompts instables | couche d'injection compacte à partir de la doctrine publiée uniquement |
| Dashboard trop orienté runs | mauvaise supervision | refonte vers vues par flux, documents, questions, doctrine |

---

## Critères de réussite

Le système cible sera considéré en bonne direction si :

1. Il peut travailler de manière continue sur un corpus large sans perdre son état.
2. Il peut montrer, pour chaque document et étude, où il en est dans le travail.
3. Il peut regrouper les études sous des questions scientifiques explicites.
4. Il peut exposer les contradictions plutôt que les masquer.
5. Il peut refuser de publier une conclusion insuffisamment robuste.
6. Il peut réviser ou retirer une doctrine déjà publiée.
7. Le générateur de programmes consomme la doctrine publiée, pas le corpus brut.
8. Le dashboard permet de comprendre le flux, la maturité et les blocages sans fouiller les fichiers internes.

---

## Direction de mise en oeuvre recommandée

Construire le système en conservant la base existante, mais en déplaçant progressivement le centre de gravité :

- de `run -> snapshot -> publish`
- vers `mémoire -> dossiers -> questions -> doctrine -> injection prudente`

C'est ce changement qui doit guider le prochain plan d'implémentation.
