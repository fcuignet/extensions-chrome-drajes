# BAFA-BAFD — Extraction des recherches (extension Chrome)

Version 0.2.0, 26/11/2026.

Cette extension :
- exporte en CSV ou JSON **tous les résultats** d'une recherche faite dans l'application d'administration BAFA-BAFD (`administration.bafa-bafd.jeunes.gouv.fr`) ;
- **envoie les sessions vers Grist** (classeur « Formation - Gestion des OF »), en ajoutant les nouvelles et en mettant à jour celles qui existent déjà, avec, si on le souhaite, leur détail (lieu, équipe, grille horaire, observations, stagiaires).

## Installation ou mise à jour (mode développeur)

1. Décompresser le dossier `baf-extract` (remplacer l'ancien dossier pour une mise à jour).
2. Ouvrir `chrome://extensions`, activer le **Mode développeur**.
3. Première installation : **Charger l'extension non empaquetée** et choisir le dossier. Mise à jour : cliquer sur l'icône **Actualiser** de l'extension.
4. Recharger l'onglet de l'application BAFA-BAFD.

La version 0.2 demande en plus l'accès aux sites `*.getgrist.com` et `grist.numerique.gouv.fr` : c'est le seul endroit où l'extension envoie des données.

## Réglage de la connexion à Grist (une seule fois)

1. Dans Grist : menu du profil → **Paramètres du profil** → rubrique **API** → créer ou copier la clé.
2. Ouvrir les réglages de l'extension : lien « Réglages de la connexion à Grist » en bas du panneau d'extraction, ou `chrome://extensions` → **Détails** → **Options de l'extension**.
3. Vérifier l'adresse (`https://drajes-test.getgrist.com`) et l'identifiant du document (`goAigiQY7UB8jt8yJfAao8`), coller la clé, puis **Tester la connexion** : le test vérifie que les 6 tables des sessions sont présentes.

La clé reste dans ce profil de navigateur (stockage local de l'extension) et n'est envoyée qu'au site Grist indiqué. Pour la révoquer, la régénérer dans Grist.

## Utilisation

1. Dans l'application, lancer une recherche de sessions avec les filtres souhaités (par exemple date de début et date de fin).
2. Ouvrir le panneau **⇩ Extraction** (en bas à droite).
3. Pour la recherche « Sessions » :
   - **CSV** / **JSON** : téléchargement des résultats ;
   - **Grist** : ajout ou mise à jour des sessions dans la table `Sessions_BAFA_BAFD` ;
   - case **« envoyer aussi le détail »** : met aussi à jour `Sessions_Details`, `Sessions_Equipes`, `Sessions_Grilles`, `Sessions_Observations` et `Sessions_Candidats`. Cela demande deux requêtes par session (comptez une dizaine de minutes pour 1 000 sessions) ; le bouton **Annuler** interrompt l'envoi, ce qui a déjà été envoyé reste dans Grist.

### Rapprochement avec les lignes existantes

| Table Grist | Clé utilisée |
|---|---|
| Sessions_BAFA_BAFD | Id session (appli) |
| Sessions_Details | Id session |
| Sessions_Equipes | Id session + Id membre |
| Sessions_Grilles | Id session + jour |
| Sessions_Observations | Id session + date + service + texte |
| Sessions_Candidats | Id d'inscription à la session |

Une ligne qui a les mêmes clés est mise à jour ; sinon elle est ajoutée. Les colonnes calculées de Grist (délais, alertes, rattachement à l'organisme, tableaux de bord) se recalculent d'elles-mêmes.

### Données des stagiaires

Ni nom, ni prénom, ni coordonnées : seulement le mois de naissance, l'état d'inscription, l'avis et l'appréciation de l'organisme, et la présence d'un rapport circonstancié (sans le nom du fichier). Dans l'appréciation, le prénom et le nom du stagiaire sont remplacés par [prénom] et [nom] ; une variante orthographique peut échapper au masquage. Le genre n'est pas fourni par ces écrans de l'application.

## Fonctionnement

- L'application est une application Angular qui interroge une API JSON interne (`POST …/api/<domaine>/v1/search-by-criteria`, `GET …/api/session/v1/{id}`, `POST …/api/candidats/v1/liste-candidats-session`).
- `inject.js` repère les recherches lancées par l'application ; `lib.js` les rejoue par pages de 500 lignes et lit le détail des sessions, avec des pauses pour ménager le serveur, en réutilisant la session de l'utilisateur (cookie et jeton `XSRF-TOKEN`).
- `gristmap.js` met les données au format des tables Grist ; `background.js` les envoie à l'API REST de Grist (`PUT /records`, par lots de 200).

## Limites connues

- **Plafond de 10 000 lignes par recherche** imposé par le serveur : découper la recherche par période si nécessaire.
- **Pas de suppression** : un stagiaire retiré d'une session ou un membre d'équipe remplacé dans l'application reste dans Grist ; une session annulée est mise à jour (état « Déclaration annulée »), pas supprimée.
- La date de déclaration d'une session est remplacée par celle du PV dans l'application une fois le PV déposé : le contrôle du délai de déclaration n'est fiable que pour les sessions à venir.
- La structure de l'API de l'application n'est pas documentée publiquement : une évolution de l'application peut casser l'extension.

## Données personnelles

Les exports et l'envoi vers Grist portent sur des données personnelles (directeurs de session, formateurs, stagiaires pseudonymisés). Leur conservation doit rester dans le cadre des traitements déclarés du service (registre RGPD, durée de conservation, accès limité au classeur Grist).
