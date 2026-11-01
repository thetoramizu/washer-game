import { CleaningTool } from "../../../models/cleaning-tool";
import { DirtType } from "../../../models/dirt-type";

/**
 * Résultat retourné après une opération de nettoyage.
 */
export interface CleaningResult {
  changed: boolean;
  removed: number;
}

/**
 * Moteur indépendant d'Angular.
 *
 * Il gère :
 * - Les quantités de salissures par pixel.
 * - L'ordre des salissures par pixel.
 * - Le nettoyage selon l'outil utilisé.
 * - Le rendu des différentes couches.
 * - La progression globale.
 */
export class DirtEngine {

  readonly width: number;
  readonly height: number;

  private readonly pixelCount: number;

  // Une couche de données indépendante par type de salissure.
  private layers: Uint8Array[] = [];

  /**
 * Quantité totale de salissures présentes
 * juste après la génération de la carte.
 *
 * Cette valeur sert de référence pour calculer
 * la progression du nettoyage.
 */
  private initialAmount = 0;

  /**
   * Ordre des salissures pour chaque pixel.
   *
   * Exemple avec 4 salissures :
   *
   * Pixel 0 : [2, 0, 3, 1]
   * Pixel 1 : [1, 3, 0, 2]
   *
   * Le premier élément représente toujours la salissure
   * située au-dessus des autres.
   */
  private layerOrders!: Uint8Array;

  // Couleurs RGB des différents types de salissures.
  private dirtColors: { r: number; g: number; b: number }[] = [];

  constructor(
    width: number,
    height: number,
    private readonly dirtTypes: DirtType[]
  ) {
    this.width = width;
    this.height = height;

    this.pixelCount = width * height;

    // Prépare les tableaux de données.
    this.layers = dirtTypes.map(
      () => new Uint8Array(this.pixelCount)
    );

    // Prépare un ordre indépendant pour chaque pixel.
    this.layerOrders = new Uint8Array(
      this.pixelCount * dirtTypes.length
    );

    // Convertit les couleurs hexadécimales en RGB une seule fois.
    this.dirtColors = dirtTypes.map(dirt => {
      const color = dirt.color.replace('#', '');

      return {
        r: parseInt(color.substring(0, 2), 16),
        g: parseInt(color.substring(2, 4), 16),
        b: parseInt(color.substring(4, 6), 16)
      };
    });
  }

  // --------------------------------
  // Génération des salissures
  // --------------------------------

  
/**
 * Génère les salissures de la carte.
 *
 * Chaque type de salissure possède son propre
 * nombre de zones à générer.
 *
 * Les densités sont fournies par la configuration
 * de la carte actuellement chargée.
 */
generate(
  dirtDensity: Record<string, number>
): void {

  // Réinitialise toutes les couches.
  for (const layer of this.layers) {
    layer.fill(0);
  }

  // Génère chaque type de salissure autorisé.
  for (
    let dirtIndex = 0;
    dirtIndex < this.dirtTypes.length;
    dirtIndex++
  ) {

    const dirt = this.dirtTypes[dirtIndex];
    const layer = this.layers[dirtIndex];

    // Récupère le nombre de zones configuré pour cette salissure.
    // Une valeur absente signifie que la salissure est désactivée.
    const zoneCount = Math.max(
      0,
      Math.floor(dirtDensity[dirt.id] ?? 0)
    );

    // Génère les zones indépendantes.
    for (let i = 0; i < zoneCount; i++) {

      const centerX = Math.random() * this.width;
      const centerY = Math.random() * this.height;

      const radius = 8 + Math.random() * 35;

      const minX = Math.max(0, Math.floor(centerX - radius));
      const maxX = Math.min(
        this.width - 1,
        Math.ceil(centerX + radius)
      );

      const minY = Math.max(0, Math.floor(centerY - radius));
      const maxY = Math.min(
        this.height - 1,
        Math.ceil(centerY + radius)
      );

      for (let y = minY; y <= maxY; y++) {

        for (let x = minX; x <= maxX; x++) {

          const dx = x - centerX;
          const dy = y - centerY;

          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance <= radius) {

            const index = y * this.width + x;

            // La zone peut se superposer à une autre.
            layer[index] = 255;
          }
        }
      }
    }
  }

  // Mélange indépendamment l'ordre des couches de chaque pixel.
  this.generateLayerOrders();

  // Mémorise la quantité initiale réelle pour la progression.
  this.initialAmount = this.getRemainingAmount();
}

  // generate(): void {

  //   const dirtCount = this.dirtTypes.length;

  //   // Réinitialise toutes les quantités.
  //   for (const layer of this.layers) {
  //     layer.fill(0);
  //   }

  //   // Génère des zones de salissures indépendantes.
  //   for (let dirtIndex = 0; dirtIndex < dirtCount; dirtIndex++) {

  //     const layer = this.layers[dirtIndex];

  //     for (let i = 0; i < 90; i++) {

  //       const centerX = Math.random() * this.width;
  //       const centerY = Math.random() * this.height;

  //       const radius = 8 + Math.random() * 35;

  //       const minX = Math.max(0, Math.floor(centerX - radius));
  //       const maxX = Math.min(this.width - 1, Math.ceil(centerX + radius));

  //       const minY = Math.max(0, Math.floor(centerY - radius));
  //       const maxY = Math.min(this.height - 1, Math.ceil(centerY + radius));

  //       for (let y = minY; y <= maxY; y++) {

  //         for (let x = minX; x <= maxX; x++) {

  //           const dx = x - centerX;
  //           const dy = y - centerY;

  //           const distance = Math.sqrt(dx * dx + dy * dy);

  //           if (distance <= radius) {

  //             const index = y * this.width + x;

  //             // Les salissures peuvent se superposer.
  //             layer[index] = 255;
  //           }
  //         }
  //       }
  //     }
  //   }

  //   // Attribue un ordre aléatoire à chaque pixel.
  //   this.generateLayerOrders();

  //   // Mémorise la quantité réelle de salissures générées.
  //   // Cette valeur devient notre référence de progression.
  //   this.initialAmount = this.getRemainingAmount();
  // }

  // --------------------------------
  // Ordre des couches par pixel
  // --------------------------------

  private generateLayerOrders(): void {

    const dirtCount = this.dirtTypes.length;

    for (let pixel = 0; pixel < this.pixelCount; pixel++) {

      // Chaque pixel reçoit sa propre permutation.
      const order = Array.from(
        { length: dirtCount },
        (_, index) => index
      );

      // Mélange Fisher-Yates.
      for (let i = dirtCount - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [order[i], order[j]] = [order[j], order[i]];
      }

      // Stocke l'ordre dans le tableau typé.
      const offset = pixel * dirtCount;

      for (let depth = 0; depth < dirtCount; depth++) {
        this.layerOrders[offset + depth] = order[depth];
      }
    }
  }

  // --------------------------------
  // Nettoyage
  // --------------------------------

  cleanAt(
    x: number,
    y: number,
    tool: CleaningTool,
    deltaTime: number
  ): CleaningResult {

    const centerX = Math.floor(x);
    const centerY = Math.floor(y);

    const radius = Math.max(1, tool.radius);

    // Limite le nettoyage aux coordonnées de la carte.
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(centerX + radius));

    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(centerY + radius));

    let removed = 0;

    // Nombre de couches réellement présentes au-dessus
    // de la couche actuellement traitée.
    let activeDepth = 0;

    const dirtCount = this.dirtTypes.length;

    for (let py = minY; py <= maxY; py++) {

      for (let px = minX; px <= maxX; px++) {

        const dx = px - centerX;
        const dy = py - centerY;

        const distance = Math.sqrt(dx * dx + dy * dy);

        // Ignore les pixels situés hors du pinceau.
        if (distance > radius) continue;

        const pixelIndex = py * this.width + px;

        // Récupère l'ordre spécifique à ce pixel.
        const orderOffset = pixelIndex * dirtCount;


        // Nombre de couches réellement présentes au-dessus
        // de la couche actuellement traitée.
        let activeDepth = 0;

        // Parcourt les salissures du dessus vers le dessous.
        for (let depth = 0; depth < dirtCount; depth++) {

          const dirtIndex = this.layerOrders[orderOffset + depth];

          const layer = this.layers[dirtIndex];

          const amount = layer[pixelIndex];

          // Une couche vide ne compte pas dans la profondeur.
          if (amount === 0) continue;

          const dirt = this.dirtTypes[dirtIndex];

          // Efficacité spécifique de l'outil.
          const baseEfficiency = tool.efficiency[dirt.id] ?? 0;

          // Malus appliqué selon la profondeur réelle.
          const depthMultiplier = Math.pow(
            1 - tool.depthPenalty,
            activeDepth
          );

          // Résistance propre à la salissure.
          const resistanceMultiplier =
            30 / Math.max(1, dirt.resistance);

          // Atténuation sur les bords du pinceau.
          const brushStrength = 1 - distance / radius;

          const reduction =
            tool.power *
            255 *
            deltaTime *
            baseEfficiency *
            depthMultiplier *
            resistanceMultiplier *
            brushStrength;

          const newAmount = Math.max(
            0,
            Math.round(amount - reduction)
          );

          if (newAmount !== amount) {

            layer[pixelIndex] = newAmount;

            removed += amount - newAmount;
          }

          // La prochaine salissure présente sera plus profonde.
          activeDepth++;
        }


        // // Parcourt les salissures du dessus vers le dessous.
        // for (let depth = 0; depth < dirtCount; depth++) {

        //   const dirtIndex = this.layerOrders[orderOffset + depth];

        //   const layer = this.layers[dirtIndex];

        //   const amount = layer[pixelIndex];

        //   // Une salissure absente laisse accéder à la suivante.
        //   if (amount === 0) continue;

        //   const dirt = this.dirtTypes[dirtIndex];

        //   // Efficacité spécifique de l'outil.
        //   const baseEfficiency = tool.efficiency[dirt.id] ?? 0;

        //   // Malus progressif lié à la profondeur.
        //   const depthMultiplier = Math.pow(
        //     1 - tool.depthPenalty,
        //     depth
        //   );

        //   // Résistance : 30 représente notre résistance de référence.
        //   const resistanceMultiplier =
        //     30 / Math.max(1, dirt.resistance);

        //   // Atténuation du pinceau sur ses bords.
        //   const brushStrength = 1 - distance / radius;

        //   const reduction =
        //     tool.power *
        //     255 *
        //     deltaTime *
        //     baseEfficiency *
        //     depthMultiplier *
        //     resistanceMultiplier *
        //     brushStrength;

        //   // Quantité restante après nettoyage.
        //   const newAmount = Math.max(
        //     0,
        //     Math.round(amount - reduction)
        //   );

        //   if (newAmount !== amount) {

        //     layer[pixelIndex] = newAmount;

        //     removed += amount - newAmount;
        //   }

        //   // Une seule couche peut être nettoyée par pixel
        //   // pendant cette opération.
        //   break;
        // }
      }
    }

    return {
      changed: removed > 0,
      removed
    };
  }

  // --------------------------------
  // Rendu des salissures
  // --------------------------------

  render(
    ctx: CanvasRenderingContext2D,
    baseImage: ImageData
  ): void {

    // Crée une image de sortie à partir de la surface propre.
    const output = ctx.createImageData(
      this.width,
      this.height
    );

    output.data.set(baseImage.data);

    const pixels = output.data;
    const dirtCount = this.dirtTypes.length;

    for (let pixel = 0; pixel < this.pixelCount; pixel++) {

      const pixelOffset = pixel * 4;
      const orderOffset = pixel * dirtCount;

      // Composition du dessous vers le dessus.
      for (let depth = dirtCount - 1; depth >= 0; depth--) {

        const dirtIndex = this.layerOrders[orderOffset + depth];

        const amount = this.layers[dirtIndex][pixel];

        if (amount === 0) continue;

        const alpha = amount / 255;

        const color = this.dirtColors[dirtIndex];

        // Mélange de la couleur de salissure avec le pixel existant.
        pixels[pixelOffset] =
          color.r * alpha +
          pixels[pixelOffset] * (1 - alpha);

        pixels[pixelOffset + 1] =
          color.g * alpha +
          pixels[pixelOffset + 1] * (1 - alpha);

        pixels[pixelOffset + 2] =
          color.b * alpha +
          pixels[pixelOffset + 2] * (1 - alpha);
      }
    }

    // Envoie le résultat final au Canvas.
    ctx.putImageData(output, 0, 0);
  }

  // --------------------------------
  // Progression
  // --------------------------------

  /**
   * Calcule la quantité totale de salissure encore présente.
   */
  getRemainingAmount(): number {

    let remaining = 0;

    for (const layer of this.layers) {

      for (let i = 0; i < layer.length; i++) {
        remaining += layer[i];
      }
    }

    return remaining;
  }


  /**
 * Retourne la quantité de salissures présente
 * au moment de la dernière génération de carte.
 */
  getInitialAmount(): number {
    return this.initialAmount;
  }

  /**
   * Calcule la progression réelle du nettoyage.
   *
   * 0 %  = aucune salissure retirée.
   * 100 % = toutes les salissures retirées.
   */
  getProgress(): number {

    // Évite les divisions par zéro.
    if (this.initialAmount <= 0) {
      return 0;
    }

    const remaining = this.getRemainingAmount();

    const progress = 1 - remaining / this.initialAmount;

    return Math.min(
      100,
      Math.max(0, progress * 100)
    );
  }

  // /**
  //  * Calcule la quantité maximale initiale.
  //  */
  // getInitialAmount(): number {
  //   return this.pixelCount * 255 * this.dirtTypes.length;
  // }

  // /**
  //  * Retourne la progression globale en pourcentage.
  //  */
  // getProgress(): number {

  //   const initial = this.getInitialAmount();

  //   if (initial === 0) return 100;

  //   const remaining = this.getRemainingAmount();

  //   return Math.min(
  //     100,
  //     Math.max(0, (1 - remaining / initial) * 100)
  //   );
  // }
}
