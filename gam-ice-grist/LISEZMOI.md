# GAM → Grist · Stats ICE (version 0.2.1)

Extension Chrome qui lit l'édition « Stats ICE » de GAM et met à jour la table `ICE_Accueils` du document Grist « ICE - Programmation des contrôles ».

L'édition « Stats ICE » (`StatsIceDepartemental`) donne en une seule fois, pour les exercices choisis, une ligne par département de la région et une ligne « Total région ». L'extension n'a donc pas besoin de changer de département dans GAM.

## Installation

1. Décompresser le dossier `gam-ice-grist` (ou le prendre dans le dépôt).
2. Dans Chrome, ouvrir `chrome://extensions`, activer le **mode développeur** (en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier. Pour une mise à jour : bouton **Actualiser** de l'extension.
4. Épingler l'icône « GAM → Grist (Stats ICE) » dans la barre d'outils.

Si le mode développeur est bloqué sur le poste académique, il faudra passer par l'assistance informatique.

## Utilisation

1. Ouvrir GAM dans un onglet et se connecter.
2. Cliquer sur l'icône de l'extension : la page de l'outil s'ouvre.
3. **Section 2** : saisir la clé API Grist (Grist → Paramètres du profil → API), enregistrer, puis « Tester l'accès à la table ».
4. **Section 3** : choisir les exercices, puis « Lire la statistique ICE ». Le rapport met environ 10 secondes à s'afficher (davantage pour tous les exercices).
5. **Section 4** : contrôler le tableau (lignes nouvelles en vert, modifiées en jaune avec l'ancienne valeur), puis « Écrire dans Grist ». L'outil relit Grist après l'écriture pour vérifier.

## Contrôles

- Les colonnes sont repérées par leur libellé dans le rapport ; une ligne n'est retenue que si ses cinq comptages sont des nombres (une case vide vaut 0, comme dans le rapport).
- La somme des départements est comparée à la ligne « Total région » ; un écart est signalé dans le journal.
- Essai du 27/11/2026 sur 2024/2025 et 2025/2026 : 20 lignes lues, totaux régionaux cohérents (7 625 et 7 649), aucune différence avec les valeurs déjà présentes dans Grist.

## Ce que fait l'extension, et ce qu'elle ne fait pas

- Elle agit uniquement dans votre session GAM, avec vos droits, comme la page « Éditions » de GAM : préparation de l'édition, choix des exercices, « Afficher le rapport ».
- Elle n'écrit rien dans GAM et ne change pas le département affiché.
- Dans Grist, elle ne fait que créer ou mettre à jour des lignes, repérées par le couple **Exercice + Département**. Elle ne supprime rien. Colonnes écrites : `Avec_hebergement`, `Scoutisme`, `ASH_Jeunes`, `ASH_Loisirs`, `ASH_Periscolaire`, `Source`.
- Elle ne lit que des chiffres agrégés, sans donnée nominative.
- La clé API Grist reste dans ce navigateur (stockage local de l'extension).

## En cas de problème

Cliquer sur **Copier le diagnostic** et transmettre le texte copié (il ne contient que le tableau chiffré du rapport).

## Étape suivante prévue

Rafraîchir de la même façon la liste des visites de contrôle (`ListeVisitesDeControle`), dont dépendent les colonnes Visites et Taux de contrôle de `ICE_Accueils`.
