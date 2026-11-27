# GAM → Grist · Stats ICE (version 0.1.0)

Extension Chrome qui lit l'édition « Stats ICE » de GAM pour les départements auxquels vous avez accès, puis met à jour la table `ICE_Accueils` du document Grist « ICE - Programmation des contrôles ».

## Installation

1. Décompresser le dossier `gam-ice-grist`.
2. Dans Chrome, ouvrir `chrome://extensions`, activer le **mode développeur** (en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier.
4. Épingler l'icône « GAM → Grist (Stats ICE) » dans la barre d'outils.

Si le mode développeur est bloqué sur le poste académique, il faudra passer par l'assistance informatique.

## Utilisation

1. Ouvrir GAM dans un onglet et se connecter.
2. Cliquer sur l'icône de l'extension : la page de l'outil s'ouvre.
3. **Section 2** : saisir la clé API Grist (Grist → Paramètres du profil → API), enregistrer, puis « Tester l'accès à la table ».
4. **Section 3** : choisir les exercices, puis :
   - « Aperçu du département affiché dans GAM » pour un premier essai, sans changer de département ;
   - « Lire tous les départements » pour les 10 départements (le département d'origine est remis à la fin).
5. **Section 4** : contrôler le tableau (lignes nouvelles en vert, modifiées en jaune avec l'ancienne valeur), puis « Écrire dans Grist ». L'outil relit Grist après l'écriture pour vérifier.

## Ce que fait l'extension, et ce qu'elle ne fait pas

- Elle agit uniquement dans votre session GAM, avec vos droits, en reproduisant ce que vous feriez à la main : choix du département, édition « Stats ICE » (`StatsIceDepartemental`), sélection des exercices, « Afficher le rapport ».
- Elle n'écrit rien dans GAM. Changer de département modifie seulement le département affiché dans votre session.
- Dans Grist, elle ne fait que créer ou mettre à jour des lignes, repérées par le couple **Exercice + Département**. Elle ne supprime rien. Colonnes écrites : `Scoutisme`, `ASH_Jeunes`, `ASH_Loisirs`, `ASH_Periscolaire`, `Avec_hebergement`, `Source`.
- Elle ne lit que des chiffres agrégés, sans donnée nominative.
- La clé API Grist reste dans ce navigateur (stockage local de l'extension).

## Si les chiffres ne sont pas reconnus

Le format du rapport n'a pas encore pu être vu de bout en bout. L'outil repère les colonnes par leur libellé (scoutisme, accueil de jeunes, de loisirs, périscolaire, avec hébergement) et refuse d'écrire une ligne s'il manque un comptage ou si une valeur n'est pas un nombre.

En cas d'erreur ou de doute : cliquer sur **Copier le diagnostic** et transmettre le texte copié (il ne contient que les tableaux du rapport Stats ICE).

## Étape suivante prévue

Rafraîchir de la même façon la liste des visites de contrôle (`ListeVisitesDeControle`), dont dépendent les colonnes Visites et Taux de contrôle de `ICE_Accueils`.
