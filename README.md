# Extensions Chrome — DRAJES Grand Est

Extensions Chrome (Manifest V3) qui relient des applications métier du ministère à des documents Grist.
Elles agissent uniquement dans la session de l'utilisateur, avec ses droits. Aucune clé ni donnée n'est stockée dans ce dépôt.

| Dossier | Application source | Destination Grist | État |
|---|---|---|---|
| `gam-ice-grist/` | GAM (back-office ACM) — édition « Stats ICE » (10 départements) | ICE - Programmation des contrôles, table `ICE_Accueils` | 0.2.1, lecture validée sur GAM le 27/11/2026 ; correctif d'accès à Grist |
| `baf-extract/` | Application d'administration BAFA-BAFD — recherches de sessions | export CSV / JSON et envoi vers Formation - Gestion des OF | 0.2.0 |
| `carte-pro-grist/` | recherche-educateur.sports.gouv.fr — cartes professionnelles | table des stagiaires (FOROMES) | 0.4.0 |

## Installer une extension

1. Télécharger le dépôt (ou la dernière version) et décompresser.
2. Ouvrir `chrome://extensions`, activer le **mode développeur**.
3. **Charger l'extension non empaquetée** et choisir le dossier de l'extension (par exemple `gam-ice-grist/`).

Le mode d'emploi de chaque extension est dans son fichier `LISEZMOI.md`.

## Tests

```
node tests/gam-ice-grist/test-interpretation.js "$PWD/gam-ice-grist/interpretation.js"
node tests/gam-ice-grist/test-matrice.js gam-ice-grist/gam-page.js
```

## Règles

- Ne jamais committer de clé API Grist, de jeton ou d'export contenant des données personnelles.
- Les clés API sont saisies dans chaque extension et restent dans le stockage local du navigateur.
