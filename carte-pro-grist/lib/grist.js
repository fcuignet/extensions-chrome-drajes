// Client minimal de l'API REST de Grist (lecture des stagiaires, écriture des résultats).

/**
 * Déduit l'adresse de l'API et l'identifiant du document à partir de l'URL
 * copiée dans la barre d'adresse du navigateur. Formes acceptées :
 *   https://grist.numerique.gouv.fr/o/drajesge/AbCdEf123/Nom-du-doc/p/2
 *   https://drajes.getgrist.com/AbCdEf123/Nom-du-doc
 *   https://docs.getgrist.com/doc/AbCdEf123
 */
export function analyserUrlDocument(adresse) {
  let u;
  try {
    u = new URL(String(adresse).trim());
  } catch {
    throw new Error("Adresse du document Grist invalide.");
  }
  const segments = u.pathname.split("/").filter(Boolean);
  let prefixe = "";
  let i = 0;
  if (segments[0] === "o" && segments[1]) {
    prefixe = `/o/${segments[1]}`;
    i = 2;
  }
  if (segments[i] === "doc") i += 1;
  const docId = segments[i];
  if (!docId || !/^[A-Za-z0-9_-]{6,}$/.test(docId)) {
    throw new Error("Impossible de trouver l'identifiant du document dans cette adresse.");
  }
  return { base: `${u.origin}${prefixe}/api`, docId };
}

/** Colonnes de résultat écrites par l'extension dans la table des stagiaires. */
export const COLONNES_RESULTAT = [
  {
    id: "CartePro_Statut",
    label: "Carte pro – statut",
    type: "Choice",
    widgetOptions: {
      choices: ["Carte pro", "Stagiaire déclaré", "Carte expirée", "À vérifier", "Non trouvé", "Erreur"],
      choiceOptions: {
        "Carte pro": { fillColor: "#B8F4C4", textColor: "#18753C" },
        "Stagiaire déclaré": { fillColor: "#E3E3FD", textColor: "#000091" },
        "Carte expirée": { fillColor: "#FEE7DA", textColor: "#B34000" },
        "À vérifier": { fillColor: "#FEECC2", textColor: "#716043" },
        "Non trouvé": { fillColor: "#FFE9E9", textColor: "#CE0500" },
        "Erreur": { fillColor: "#EEEEEE", textColor: "#3A3A3A" },
      },
    },
  },
  { id: "CartePro_Numero", label: "Carte pro – n°", type: "Text" },
  { id: "CartePro_Lien", label: "Carte pro – fiche", type: "Text", widgetOptions: { widget: "HyperLink" } },
  { id: "CartePro_Detail", label: "Carte pro – détail", type: "Text" },
  { id: "CartePro_Verifie_le", label: "Carte pro – vérifiée le", type: "Date", widgetOptions: { dateFormat: "DD/MM/YYYY" } },
];

export class ClientGrist {
  constructor({ base, docId, cle, fetchFn }) {
    this.base = base;
    this.docId = docId;
    this.cle = cle;
    this.fetchFn = fetchFn || globalThis.fetch.bind(globalThis);
  }

  async _requete(chemin, { method = "GET", body } = {}) {
    const rep = await this.fetchFn(`${this.base}/docs/${encodeURIComponent(this.docId)}${chemin}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cle}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const texte = await rep.text();
    if (!rep.ok) {
      let detail = "";
      try {
        detail = JSON.parse(texte).error || "";
      } catch {
        detail = texte.slice(0, 200);
      }
      const indice = rep.status === 401 || rep.status === 403 ? " (clé API ou droits d'accès ?)" : "";
      throw new Error(`Grist : erreur HTTP ${rep.status}${indice}${detail ? " – " + detail : ""}`);
    }
    return texte ? JSON.parse(texte) : null;
  }

  /**
   * Remplace l'identifiant court de l'URL (ex. goAigiQY7UB8) par l'identifiant complet du document,
   * quand Grist le fournit. Sans effet si l'appel échoue.
   */
  async resoudreDocument() {
    try {
      const info = await this._requete("");
      if (info && info.id) this.docId = info.id;
      return info;
    } catch {
      return null;
    }
  }

  async tables() {
    const r = await this._requete("/tables");
    return r.tables.map((t) => t.id);
  }

  async colonnes(tableId) {
    const r = await this._requete(`/tables/${encodeURIComponent(tableId)}/columns`);
    return r.columns
      .filter((c) => !c.id.startsWith("gristHelper_") && c.id !== "manualSort")
      .map((c) => ({ id: c.id, label: c.fields.label || c.id, type: c.fields.type }));
  }

  async enregistrements(tableId) {
    const r = await this._requete(`/tables/${encodeURIComponent(tableId)}/records`);
    return r.records;
  }

  async ajouterColonnes(tableId, colonnes) {
    if (!colonnes.length) return null;
    return this._requete(`/tables/${encodeURIComponent(tableId)}/columns`, {
      method: "POST",
      body: {
        columns: colonnes.map((c) => ({
          id: c.id,
          fields: {
            label: c.label,
            type: c.type,
            ...(c.widgetOptions ? { widgetOptions: JSON.stringify(c.widgetOptions) } : {}),
          },
        })),
      },
    });
  }

  async mettreAJour(tableId, records) {
    if (!records.length) return null;
    return this._requete(`/tables/${encodeURIComponent(tableId)}/records`, {
      method: "PATCH",
      body: { records },
    });
  }
}
