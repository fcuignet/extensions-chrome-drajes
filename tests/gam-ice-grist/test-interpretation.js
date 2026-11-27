// Tests de lecture du rapport Stats ICE (dispositions possibles, valeurs invalides, CSV).
const assert = require("assert");
const ICE = require(process.argv[2]);

// 1. Un exercice par ligne, en-tête sur deux niveaux (cellules fusionnées recopiées), titre pleine largeur.
const g1 = [
  ["Statistiques ICE", "Statistiques ICE", "Statistiques ICE", "Statistiques ICE", "Statistiques ICE", "Statistiques ICE", "Statistiques ICE"],
  ["Exercice", "Accueil avec hébergement", "Accueil de scoutisme", "Sans hébergement", "Sans hébergement", "Sans hébergement", "Total"],
  ["Exercice", "Accueil avec hébergement", "Accueil de scoutisme", "Accueil de jeunes", "Accueil de loisirs", "Accueil périscolaire", "Total"],
  ["2024/2025", "120", "35", "12", "410", "180", "757"],
  ["2025/2026", "1 102", "", "10", "398", "175", "1685"]
];
let r = ICE.interpreter(g1, "54", ["2025/2026"]);
assert.strictEqual(r.disposition, "un exercice par ligne");
assert.deepStrictEqual(r.erreurs, []);
assert.deepStrictEqual(r.lignes, [{ Exercice: "2025/2026", Departement: "54", Scoutisme: 0, ASH_Jeunes: 10, ASH_Loisirs: 398, ASH_Periscolaire: 175, Avec_hebergement: 1102 }]);
r = ICE.interpreter(g1, "54", null);
assert.strictEqual(r.lignes.length, 2);

// 2. Un exercice par colonne, regroupement « Sans hébergement » sur plusieurs lignes.
const g2 = [
  ["Type d'accueil", "Type d'accueil", "2023/2024", "2024/2025"],
  ["Avec hébergement", "Avec hébergement", "100", "110"],
  ["Scoutisme", "Scoutisme", "20", "22"],
  ["Sans hébergement", "Accueil de jeunes", "5", "6"],
  ["Sans hébergement", "Accueil de loisirs", "300", "310"],
  ["Sans hébergement", "Accueil périscolaire", "150", "160"],
  ["Total", "Total", "575", "608"]
];
r = ICE.interpreter(g2, "57", ["2024/2025"]);
assert.strictEqual(r.disposition, "un exercice par colonne");
assert.deepStrictEqual(r.lignes, [{ Exercice: "2024/2025", Departement: "57", Scoutisme: 22, ASH_Jeunes: 6, ASH_Loisirs: 310, ASH_Periscolaire: 160, Avec_hebergement: 110 }]);

// 3. Un comptage manquant : aucune ligne écrite, erreur explicite.
const g3 = g1.map((l) => l.slice(0, 5));
r = ICE.interpreter(g3, "54", null);
assert.strictEqual(r.lignes.length, 0);
assert.ok(r.erreurs[0].includes("périscolaire"));

// 4. Valeur non numérique : ligne refusée.
const g4 = g1.map((l) => l.slice());
g4[4][4] = "n.c.";
r = ICE.interpreter(g4, "54", ["2025/2026"]);
assert.strictEqual(r.lignes.length, 0);
assert.ok(r.erreurs[0].includes("non numérique"));

// 5. Colonnes de contrôles ignorées même si elles contiennent un mot-clé.
const g5 = [
  ["Exercice", "Accueil avec hébergement", "Contrôles avec hébergement", "Scoutisme", "Accueil de jeunes", "Accueil de loisirs", "Périscolaire"],
  ["2025/2026", "90", "7", "11", "3", "200", "80"]
];
r = ICE.interpreter(g5, "88", null);
assert.strictEqual(r.lignes[0].Avec_hebergement, 90);
assert.strictEqual(r.lignes[0].ASH_Periscolaire, 80);

// 6. CSV avec guillemets et BOM retiré en amont, puis lecture complète via lireRapport.
const csv = 'Exercice,"Accueil avec hébergement",Scoutisme,"Accueil de jeunes","Accueil de loisirs","Accueil périscolaire"\r\n2025/2026,"1 000",4,2,50,"30"\r\n';
assert.deepStrictEqual(ICE.lireCsv(csv)[1], ["2025/2026", "1 000", "4", "2", "50", "30"]);
r = ICE.lireRapport({ grilles: [[["sans rapport", "x"], ["a", "b"]]], csv }, "10", ["2025/2026"]);
assert.deepStrictEqual(r.lignes, [{ Exercice: "2025/2026", Departement: "10", Scoutisme: 4, ASH_Jeunes: 2, ASH_Loisirs: 50, ASH_Periscolaire: 30, Avec_hebergement: 1000 }]);

// 7. Rien de reconnaissable : message de diagnostic.
r = ICE.lireRapport({ grilles: [], csv: null }, "08", null);
assert.ok(r.erreurs[0].includes("diagnostic"));

console.log("7 tests réussis");
