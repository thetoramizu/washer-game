import { CleaningTool } from "../../../models/cleaning-tool";
import { DirtType } from "../../../models/dirt-type";


/**
 * Informations retournées après une opération de nettoyage.
 */
export interface CleaningResult {
  // Indique si au moins un pixel a été modifié.
  changed: boolean;

  // Quantité totale de salissure retirée.
  removed: number;
}


export class DirtEngine {

  readonly width: number;
  readonly height: number;

  // Nombre de types de salissures
  readonly dirtCount: number;

  // Une couche de données par type de salissure
  private layers: Uint8Array[] = [];

  // Ordre d'empilement des salissures
  private layerOrder: number[] = [];

  constructor(
    width: number,
    height: number,
    private dirtTypes: DirtType[]
  ) {
    this.width = width;
    this.height = height;

    this.dirtCount = dirtTypes.length;

    this.initialize();
  }

  // --------------------------------
  // Initialisation
  // --------------------------------

  private initialize(): void {

    const pixelCount = this.width * this.height;

    this.layers = this.dirtTypes.map(() =>
      new Uint8Array(pixelCount)
    );

    this.layerOrder = this.dirtTypes.map(
      (_, index) => index
    );

  }

  // --------------------------------
  // Génération des salissures
  // --------------------------------

  generate(): void {

    const pixelCount = this.width * this.height;

    for (let dirtIndex = 0; dirtIndex < this.dirtCount; dirtIndex++) {

      const layer = this.layers[dirtIndex];

      layer.fill(0);

      // Génération de zones aléatoires
      for (let i = 0; i < 90; i++) {

        const centerX = Math.random() * this.width;
        const centerY = Math.random() * this.height;

        const radius = 8 + Math.random() * 35;

        const minX = Math.max(0, Math.floor(centerX - radius));
        const maxX = Math.min(this.width - 1, Math.ceil(centerX + radius));

        const minY = Math.max(0, Math.floor(centerY - radius));
        const maxY = Math.min(this.height - 1, Math.ceil(centerY + radius));

        for (let y = minY; y <= maxY; y++) {

          for (let x = minX; x <= maxX; x++) {

            const dx = x - centerX;
            const dy = y - centerY;

            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= radius) {

              const index = y * this.width + x;

              layer[index] = 255;

            }

          }

        }

      }

    }

  }

  // --------------------------------
  // Nettoyage d'un point
  // --------------------------------

  
/**
 * Nettoie la zone autour du pointeur.
 *
 * Le moteur :
 * - Parcourt les pixels touchés par le pinceau.
 * - Cherche la première salissure encore présente.
 * - Calcule son efficacité selon l'outil et sa profondeur.
 * - Réduit progressivement sa quantité.
 *
 * Une seule salissure est nettoyée par pixel et par appel.
 */
cleanAt(
  x: number,
  y: number,
  tool: CleaningTool,
  deltaTime: number
): CleaningResult {

  const centerX = Math.floor(x);
  const centerY = Math.floor(y);

  const radius = Math.max(1, tool.radius);

  // Délimite la zone de pixels concernée.
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(this.width - 1, Math.ceil(centerX + radius));

  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(this.height - 1, Math.ceil(centerY + radius));

  let removed = 0;

  for (let py = minY; py <= maxY; py++) {

    for (let px = minX; px <= maxX; px++) {

      const dx = px - centerX;
      const dy = py - centerY;

      const distance = Math.sqrt(dx * dx + dy * dy);

      // Ignore les pixels situés hors du pinceau.
      if (distance > radius) continue;

      const index = py * this.width + px;

      // Recherche la première salissure encore présente.
      for (let depth = 0; depth < this.layerOrder.length; depth++) {

        const dirtIndex = this.layerOrder[depth];
        const layer = this.layers[dirtIndex];

        const amount = layer[index];

        // Une couche vide laisse accéder à la suivante.
        if (amount <= 0) continue;

        const dirt = this.dirtTypes[dirtIndex];

        // Efficacité de base de l'outil contre cette salissure.
        const baseEfficiency = tool.efficiency[dirt.id] ?? 0;

        // Réduction d'efficacité liée à la profondeur.
        const depthMultiplier = Math.pow(
          1 - tool.depthPenalty,
          depth
        );

        const finalEfficiency = baseEfficiency * depthMultiplier;

        // Le pinceau est progressivement moins puissant sur ses bords.
        const brushStrength = 1 - distance / radius;

        // Quantité retirée pendant cette opération.
        const reduction =
          tool.power *
          255 *
          deltaTime *
          finalEfficiency *
          brushStrength;

        const newAmount = Math.max(
          0,
          Math.round(amount - reduction)
        );

        // Met à jour uniquement si la quantité a réellement changé.
        if (newAmount !== amount) {

          layer[index] = newAmount;

          removed += amount - newAmount;
        }

        // Une seule couche accessible par pixel et par opération.
        break;
      }
    }
  }

  return {
    changed: removed > 0,
    removed
  };
}

  // --------------------------------
  // Accès aux données
  // --------------------------------

  getLayers(): Uint8Array[] {
    return this.layers;
  }

  getDirtTypes(): DirtType[] {
    return this.dirtTypes;
  }

  // --------------------------------
  // Progression globale
  // --------------------------------

  getProgress(): number {

    let total = 0;
    let remaining = 0;

    for (const layer of this.layers) {

      for (let i = 0; i < layer.length; i++) {

        total += 255;
        remaining += layer[i];

      }

    }

    if (total === 0) return 100;

    return (1 - remaining / total) * 100;

  }

}
