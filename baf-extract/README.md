# BAFA-BAFD — Extraction des recherches (extension Chrome)

Version 0.1.0, 26/11/2026.

Cette extension exporte en CSV ou JSON **tous les résultats** d'une recherche faite dans l'application d'administration BAFA-BAFD (`administration.bafa-bafd.jeunes.gouv.fr`), et pas seulement les 10 lignes affichées à l'écran.

## Installation (mode développeur)

1. Décompresser le dossier `baf-extract`.
2. Ouvrir `chrome://extensions`, activer le **Mode développeur** (en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier `baf-extract`.
4. Recharger l'onglet de l'application BAFA-BAFD.

## Utilisation

1. Dans l'application, lancer une recherche (sessions, candidats, membres de jury, statistiques…) avec les filtres souhaités.
2. Un bouton **⇩ Extraction** apparaît en bas à droite ; le badge indique le nombre de recherches repérées.
3. Ouvrir le panneau : chaque recherche affiche le nombre de résultats et les filtres appliqués.
4. Cliquer sur **CSV** (séparateur `;`, UTF-8, s'ouvre directement dans Excel et s'importe dans Grist) ou **JSON**.

Le fichier est nommé `bafa-bafd_<recherche>_<date>_<heure>.csv`.

## Fonctionnement

- L'application est une application Angular qui interroge une API JSON interne. Les recherches sont des requêtes `POST …/api/<domaine>/v1/search-by-criteria` avec un corps du type :
  `{"pageNumber":0,"pageSize":10,"pageOrderDTOs":[{"sortField":"dateDebut","sortOrder":"DESC"}], …filtres}`.
  La réponse contient `content` (les lignes), `hasNext`, `totalPages`, `totalElements` et `totalElementsDisplayed`.
- `inject.js` (exécuté dans la page) repère ces requêtes quand l'application les envoie et transmet les critères à l'extension.
- `lib.js` rejoue la même recherche par pages de 500 lignes, avec une pause de 300 ms entre deux pages, en réutilisant la session de l'utilisateur (cookie de session et jeton `XSRF-TOKEN`).
- `content.js` affiche le panneau et produit le fichier dans le navigateur. **Aucune donnée ne quitte le poste.**

## Limites connues

- **Plafond de 10 000 lignes par recherche**, imposé par le serveur (au-delà, il renvoie des doublons). L'extension s'arrête au plafond et signale le nombre de résultats non récupérés : découper alors la recherche, par période par exemple.
- L'extension ne voit que les recherches lancées **après** son chargement : recharger la page ou relancer la recherche si le panneau est vide.
- Les droits sont ceux du compte connecté : l'extension ne donne accès à rien de plus que l'application.
- La structure de l'API n'est pas documentée publiquement ; une évolution de l'application peut casser l'extension.

## Données personnelles

Les exports peuvent contenir des données personnelles (courriel du directeur de session, candidats, membres de jury). Leur extraction et leur conservation doivent rester dans le cadre des traitements déclarés du service (registre RGPD, durée de conservation, stockage sur un espace professionnel).

## Pistes d'évolution

- Enrichissement par session via `GET …/api/session/v1/{id}` : équipe de formation (`membresSession`), lieu, grille horaire, documents, commentaires.
- Découpage automatique par période pour contourner le plafond de 10 000 lignes.
- Envoi direct vers une table Grist (API REST de grist.numerique.gouv.fr).
