# Cartes pro des stagiaires (Grist) — extension Chrome · version 0.4

Pour chaque stagiaire d'une table Grist, l'extension interroge le portail public
**recherche-educateur.sports.gouv.fr**. Elle inscrit ensuite le résultat dans la même table : statut,
n° de carte ou d'attestation, lien vers la fiche, détail et date de vérification.
Pour obtenir la liste des stagiaires non déclarés, il suffit de filtrer la colonne « Carte pro – statut » sur « Non trouvé ».

## Installation

1. Décompresser le fichier zip.
2. Dans Chrome, ouvrir `chrome://extensions`, puis activer le **Mode développeur** (en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier `carte-pro-grist`.
4. Épingler l'icône de l'extension dans la barre d'outils.

Pour passer d'une version à l'autre, il suffit de remplacer le dossier, puis de cliquer sur la flèche
« Actualiser » de l'extension dans `chrome://extensions`.

> Sur un poste géré par l'académie, le mode développeur peut être bloqué par la politique informatique.

## Utilisation (exemple : document « Formation – Gestion des OF », table Feuil1)

1. Cliquer sur l'icône : la page de vérification s'ouvre dans un onglet. Garder cet onglet ouvert pendant tout le contrôle.
2. Coller l'adresse du document telle qu'elle apparaît dans le navigateur (le lien de partage convient aussi),
   puis la clé API (Grist : menu du profil → *Paramètres du profil* → *Clé API*). Cliquer sur **Se connecter**.
3. Choisir la table **Feuil1**. Les colonnes sont reconnues automatiquement : *Nom de famille*, *Nom d'usage*,
   *Prénom* et *Numéro de Formation* pour la session.
4. Choisir le n° de session dans la liste proposée. La page affiche le nombre de stagiaires concernés.
5. Créer les colonnes de résultat (une seule fois par table) : la page en propose cinq, `CartePro_…`,
   et ne les crée qu'après un clic.
6. Ouvrir « Tester une recherche » et chercher un éducateur connu, pour s'assurer que le portail répond.
7. La première fois, cocher **Simulation**, puis **Lancer la vérification**. Le mode simulation n'écrit rien dans Grist.
8. Décocher Simulation et relancer : les résultats sont écrits dans Grist par lots de 10.
   **Arrêter** termine le stagiaire en cours, puis enregistre ce qui a déjà été fait.

## Lecture des statuts

| Statut | Signification |
|---|---|
| Carte pro | Une seule personne correspond exactement (nom et prénom) et détient une carte professionnelle |
| Stagiaire déclaré | La personne figure sur le portail comme éducateur stagiaire (attestation de stagiaire) |
| À vérifier | Plusieurs homonymes, ou résultats approchants sans correspondance exacte. Le détail donne les n° à examiner |
| Non trouvé | Aucune fiche après tous les essais (voir ci-dessous) |
| Erreur | Nom ou prénom manquant dans Grist, ou portail indisponible |

Le détail signale aussi la libre prestation de services (LPS). Il indique aussi quand la personne n'a été
trouvée qu'avec son nom d'usage ou son premier prénom. Si une même personne a une carte et une attestation
de stagiaire, la carte l'emporte.

Pour chaque stagiaire, les essais s'enchaînent dans cet ordre : nom de famille + prénoms,
nom de famille + premier prénom, puis les deux mêmes avec le nom d'usage s'il est différent.
Si rien n'est trouvé, un dernier essai porte sur le nom et les deux premières lettres du prénom
(le portail cherche par début de prénom). Une variante comme Cathy / Catherine ressort ainsi en « À vérifier » au lieu de « Non trouvé ».
Le portail exige au moins deux lettres pour le nom et le prénom.

Les résultats sont comparés à l'identité complète du stagiaire (nom de naissance, nom d'usage, prénoms).
Une fiche est retenue, avec la mention « Correspondance partielle » dans le détail, dans trois cas :
- un nom composé d'un côté et l'une de ses parties de l'autre (VELLARD-EBY / VELLARD) ;
- un prénom composé réduit à sa première partie (Robert-Dimitrie / Robert) ;
- un prénom d'au moins 5 lettres qui diffère d'une seule lettre (Timothey / Timothee).
La comparaison ne tient compte ni des accents, ni de la casse, ni des tirets.

## Réglage du portail

Le portail n'a pas d'API publique documentée. Le réglage livré reproduit l'appel que fait le portail lui-même,
relevé le 25/11/2026 :

```
POST https://eme-api-core.sports.gouv.fr/api/Educateur/RecherchePublic
{ "numeroPage": 0, "itemByPage": 20, "nomFamille": "…", "prenom": "…", "cartePro": null, "typeUser": "EducUser" }
→ { "errorCode": null, "nbResults": n, "results": [ { "nomFamille", "prenom", "cartePro", "identifiant", "isStagiaire", "isLPS", … } ] }
```

Si le portail change, la rubrique 3 de la page permet de modifier ce réglage, au format JSON.
Le bouton « Rétablir le réglage d'origine » revient à la version livrée.

## Limites à connaître

- **« Non trouvé » ne prouve pas l'absence de déclaration.** L'écart peut venir de l'orthographe ou d'un nom
  différent dans FOROMES et sur le portail. Le registre public ne montre que les déclarations en cours de validité.
- **Homonymes** : le portail public ne permet pas de chercher par date de naissance. Les cas
  « À vérifier » demandent donc un contrôle manuel.
- **Date d'expiration** : la recherche du portail ne la renvoie pas. Elle reste consultable sur la fiche (lien).
- **Stagiaires déclarés** : le portail ne donne ni n° ni fiche pour une attestation de stagiaire.
  Les colonnes « n° » et « fiche » restent donc vides pour ce statut.
- **Rythme** : l'extension marque une pause d'au moins 1 seconde (1,5 seconde par défaut) entre deux recherches.
  Il vaut mieux contrôler une session à la fois.

## Données

Seuls les noms et prénoms sont envoyés au portail du ministère, et rien n'est transmis ailleurs que vers votre document Grist.
L'extension charge la table dans la page le temps du contrôle, mais n'utilise que les colonnes de nom,
de prénom et de session. Elle ne conserve aucune donnée après la fermeture de l'onglet.
La clé API est enregistrée uniquement dans ce navigateur (stockage local de l'extension).

## Contenu du dossier

- `manifest.json`, `background.js` : déclaration de l'extension et ouverture de la page
- `page/` : page de vérification
- `lib/grist.js` : lecture et écriture dans Grist
- `lib/portail.js` : interrogation du portail et réglage par défaut
- `lib/controle.js` : essais, rapprochement des résultats et statuts
