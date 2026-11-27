// Vérifie la reconstitution des cellules fusionnées (rowspan/colspan) de gam-page.js.
const fs = require("fs"); const assert = require("assert");
const src = fs.readFileSync(process.argv[2], "utf8");
const debut = src.indexOf("  function matrice(table)"), fin = src.indexOf("  // Tous les tableaux");
const norm = (s) => (s || "").replace(/[\s  ]+/g, " ").trim();
const matrice = eval("(" + src.slice(debut, fin).trim() + ")");
const c = (t, rs = 1, cs = 1) => ({ innerText: t, rowSpan: rs, colSpan: cs });
const table = { rows: [
  { cells: [c("Exercice", 2), c("Avec héb.", 2), c("Sans hébergement", 1, 2)] },
  { cells: [c("Jeunes"), c("Loisirs")] },
  { cells: [c("2025/2026"), c("90"), c("3"), c("200")] }
] };
assert.deepStrictEqual(matrice(table), [
  ["Exercice", "Avec héb.", "Sans hébergement", "Sans hébergement"],
  ["Exercice", "Avec héb.", "Jeunes", "Loisirs"],
  ["2025/2026", "90", "3", "200"]
]);
console.log("matrice : test réussi");
