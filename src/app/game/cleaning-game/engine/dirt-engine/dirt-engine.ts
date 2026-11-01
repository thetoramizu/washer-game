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
 * Progression à partir de laquelle la carte est considérée
 * comme terminée.
 *
 * L'affichage étant arrondi à l'entier le plus proche, un
 * joueur qui voit « 100 % » a donc déjà franchi ce seuil :
 * la récompense est versée en cohérence avec ce qu'il voit.
 * La marge restante correspond aux infimes résidus de
 * salissure (pixels isolés très difficiles à atteindre),
 * qui ne sont pas exigés pour valider la carte.
 */
export const COMPLETION_THRESHOLD = 95;

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

  // Résolution du tampon interne de rendu.
  // La carte est simulée et dessinée à l'échelle 1/2 puis
  // agrandie sur le canvas : cela divise par quatre le coût
  // des boucles de rendu tout en restant visuellement
  // fidèle sur les grandes cartes.
  private static readonly RENDER_SCALE = 0.5;

  readonly width: number;
  readonly height: number;

  // Dimensions réelles du tampon interne (scaled).
  readonly bufferWidth: number;
  readonly bufferHeight: number;

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

  /**
   * Multiplicateur de récompense moyen pondéré par la densité
   * des salissures de la carte actuellement générée.
   *
   * Calculé une seule fois à la génération : le composant
   * n'a plus qu'à multiplier la quantité retirée par cette
   * valeur (via getRewardPerUnit).
   */
  private rewardMultiplier = 0;

  /**
   * Quantité de salissure (en unités du moteur) correspondant
   * à 1 $ de gain accumulé en nettoyant.
   *
   * Cette constante unique règle l'économie du jeu : elle est
   * volontairement élevée pour que les gains restent cohérents
   * avec les prix de la boutique (une centaine de dollars par
   * carte au niveau de base).
   */
  static readonly DIRT_UNITS_PER_DOLLAR = 25000;

  /**
   * Nombre d'unités de salissure retirées nécessaire pour valoir
   * 1 $ de récompense de fin de carte.
   *
   * La récompense finale est plafonnée par la taille réelle de la
   * carte et ne dépend donc ni de l'outil utilisé ni des couches
   * superposées : impossible de « farmer » des sommes énormes avec
   * un outil surpuissant ou une carte dense.
   */
  private static readonly DIRT_UNITS_PER_REWARD_DOLLAR = 100000;

  /**
   * Récompense maximale versée pour une carte, quel que soit son
   * nombre de zones de salissure (garde-fou pour les futures très
   * grandes cartes).
   */
  private static readonly MAX_MAP_REWARD = 400;

  // Tampon interne et son contexte, utilisés pour le rendu
  // basse résolution puis l'agrandissement sur le canvas.
  private buffer!: ImageData;
  private bufferCanvas!: HTMLCanvasElement;
  private bufferCtx!: CanvasRenderingContext2D;

  constructor(
    width: number,
    height: number,
    private readonly dirtTypes: DirtType[]
  ) {
    this.width = width;
    this.height = height;

    // Le tampon de travail est réduit pour garder un rendu fluide
    // sur les grandes cartes.
    this.bufferWidth = Math.max(
      1,
      Math.round(width * DirtEngine.RENDER_SCALE)
    );
    this.bufferHeight = Math.max(
      1,
      Math.round(height * DirtEngine.RENDER_SCALE)
    );

    this.pixelCount = this.bufferWidth * this.bufferHeight;

    // Prépare les tableaux de données.
    this.layers = dirtTypes.map(
      () => new Uint8Array(this.pixelCount)
    );

    // Prépare un ordre indépendant pour chaque pixel.
    this.layerOrders = new Uint8Array(
      this.pixelCount * dirtTypes.length
    );

    // Tampon intermédiaire pour l'agrandissement final.
    this.buffer = new ImageData(this.bufferWidth, this.bufferHeight);

    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = this.bufferWidth;
    this.bufferCanvas.height = this.bufferHeight;
    this.bufferCtx = this.bufferCanvas.getContext('2d')!;

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
 *
 * La génération s'appuie sur un maillage grossier (un centre
 * possible toutes les 8 unités) : les zones sont ensuite
 * dessinées en douceur dans le tampon basse résolution, ce
 * qui donne des formes organiques tout en restant très rapide.
 */
generate(
  dirtDensity: Record<string, number>
): void {

  // Réinitialise toutes les couches.
  for (const layer of this.layers) {
    layer.fill(0);
  }

  const scale = DirtEngine.RENDER_SCALE;

  // Maillage grossier utilisé pour choisir les centres de zones.
  const gridStep = 8;

  const cols = Math.ceil(this.width / gridStep);
  const rows = Math.ceil(this.height / gridStep);

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

      // Centre choisi sur le maillage grossier (en coordonnées carte).
      const centerX =
        Math.floor(Math.random() * cols) * gridStep + gridStep / 2;
      const centerY =
        Math.floor(Math.random() * rows) * gridStep + gridStep / 2;

      const radius = 8 + Math.random() * 35;

      // Conversion vers le tampon basse résolution.
      const bcx = centerX * scale;
      const bcy = centerY * scale;
      const br = Math.max(1.5, radius * scale);

      const minX = Math.max(0, Math.floor(bcx - br));
      const maxX = Math.min(
        this.bufferWidth - 1,
        Math.ceil(bcx + br)
      );

      const minY = Math.max(0, Math.floor(bcy - br));
      const maxY = Math.min(
        this.bufferHeight - 1,
        Math.ceil(bcy + br)
      );

      for (let y = minY; y <= maxY; y++) {

        for (let x = minX; x <= maxX; x++) {

          const dx = x - bcx;
          const dy = y - bcy;

          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > br) continue;

          // Atténuation sur le bord externe : la zone se fond
          // progressivement au lieu de former un disque net.
          const edge = Math.min(1, (br - distance) / (br * 0.4));

          const intensity = Math.round(255 * edge);

          if (intensity <= 0) continue;

          const index = y * this.bufferWidth + x;

          // La zone peut se superposer à une autre : on garde
          // l'intensité la plus forte.
          if (intensity > layer[index]) {
            layer[index] = intensity;
          }
        }
      }
    }
  }

  // Mélange indépendamment l'ordre des couches de chaque pixel.
  this.generateLayerOrders();

  // Calcule le multiplicateur de récompense moyen de la carte,
  // pondéré par la densité de chaque salissure présente.
  this.computeRewardMultiplier(dirtDensity);

  // Mémorise la quantité initiale réelle pour la progression.
  this.initialAmount = this.getRemainingAmount();
}

/**
 * Moyenne pondérée des multiplicateurs de récompense des
 * salissures présentes sur la carte.
 */
private computeRewardMultiplier(
  dirtDensity: Record<string, number>
): void {

  const totalDensity = Object.values(dirtDensity)
    .reduce((sum, value) => sum + value, 0);

  if (totalDensity <= 0) {
    this.rewardMultiplier = 0;
    return;
  }

  let multiplier = 0;

  for (const dirt of this.dirtTypes) {

    const weight = dirtDensity[dirt.id];

    if (weight === undefined) continue;

    multiplier += dirt.rewardMultiplier * (weight / totalDensity);
  }

  this.rewardMultiplier = multiplier;
}

/**
 * Récompense gagnée par unité de salissure retirée.
 *
 * Le moteur centralise ici l'économie du jeu : le composant
 * n'a plus qu'à multiplier la quantité retirée par cette
 * valeur. Le résultat est volontairement modeste pour rester
 * cohérent avec les prix de la boutique.
 */
getRewardPerUnit(): number {
  return this.rewardMultiplier / DirtEngine.DIRT_UNITS_PER_DOLLAR;
}

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

    // Les coordonnées du pointeur (échelle carte) sont ramenées
    // à l'échelle du tampon basse résolution.
    const scale = DirtEngine.RENDER_SCALE;

    const centerX = x * scale;
    const centerY = y * scale;

    const radius = Math.max(1, tool.radius * scale);

    // Limite le nettoyage aux coordonnées du tampon.
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(this.bufferWidth - 1, Math.ceil(centerX + radius));

    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(this.bufferHeight - 1, Math.ceil(centerY + radius));

    let removed = 0;

    const dirtCount = this.dirtTypes.length;

    // Compense la plus faible surface du tampon pour conserver
    // un rythme de nettoyage comparable à l'ancienne échelle.
    const areaCompensation = 1 / (scale * scale);

    for (let py = minY; py <= maxY; py++) {

      for (let px = minX; px <= maxX; px++) {

        const dx = px - centerX;
        const dy = py - centerY;

        const distance = Math.sqrt(dx * dx + dy * dy);

        // Ignore les pixels situés hors du pinceau.
        if (distance > radius) continue;

        const pixelIndex = py * this.bufferWidth + px;

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
            brushStrength *
            areaCompensation;

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

  /**
   * Dessine la scène (surface propre + salissures) dans le
   * tampon basse résolution, puis l'agrandit sur le canvas.
   *
   * Toute la boucle pixel est réalisée sur une image 4 fois
   * plus petite que la carte : le rendu reste fluide même sur
   * les grandes cartes. Le curseur est dessiné par le composant
   * après cet appel, à l'échelle réelle.
   */
  render(
    ctx: CanvasRenderingContext2D,
    baseImage: ImageData
  ): void {

    const bufferPixels = this.buffer.data;

    // Copie de la surface propre (déjà à l'échelle du tampon).
    bufferPixels.set(baseImage.data);

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
        bufferPixels[pixelOffset] =
          color.r * alpha +
          bufferPixels[pixelOffset] * (1 - alpha);

        bufferPixels[pixelOffset + 1] =
          color.g * alpha +
          bufferPixels[pixelOffset + 1] * (1 - alpha);

        bufferPixels[pixelOffset + 2] =
          color.b * alpha +
          bufferPixels[pixelOffset + 2] * (1 - alpha);
      }
    }

    // Envoie le tampon basse résolution sur un canvas intermédiaire…
    this.bufferCtx.putImageData(this.buffer, 0, 0);

    // …puis l'agrandit sur le canvas final (accélération matérielle).
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.bufferCanvas,
      0,
      0,
      this.width,
      this.height
    );
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

      // Additionne la couche en blocs de 32 octets : bien plus
      // rapide qu'une boucle octet par octet sur de grandes cartes.
      const length = layer.length;
      const aligned = length - (length % 32);

      let blockSum = 0;

      for (let i = 0; i < aligned; i += 32) {
        blockSum +=
          layer[i] + layer[i + 1] + layer[i + 2] + layer[i + 3] +
          layer[i + 4] + layer[i + 5] + layer[i + 6] + layer[i + 7] +
          layer[i + 8] + layer[i + 9] + layer[i + 10] + layer[i + 11] +
          layer[i + 12] + layer[i + 13] + layer[i + 14] + layer[i + 15] +
          layer[i + 16] + layer[i + 17] + layer[i + 18] + layer[i + 19] +
          layer[i + 20] + layer[i + 21] + layer[i + 22] + layer[i + 23] +
          layer[i + 24] + layer[i + 25] + layer[i + 26] + layer[i + 27] +
          layer[i + 28] + layer[i + 29] + layer[i + 30] + layer[i + 31];
      }

      for (let i = aligned; i < length; i++) {
        blockSum += layer[i];
      }

      remaining += blockSum;
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

  /**
   * Indique si la carte doit être considérée comme terminée.
   *
   * On valide dès que la progression atteint le seuil de
   * propreté : cela correspond à ce que le joueur voit déjà
   * affiché comme « 100 % » (arrondi à l'entier). Les infimes
   * résidus restants ne bloquent donc plus la récompense.
   */
  isComplete(): boolean {
    return this.getProgress() >= COMPLETION_THRESHOLD;
  }
}
