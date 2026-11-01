import { CleaningTool } from "../../../models/cleaning-tool";
import { DirtType } from "../../../models/dirt-type";

/**
 * Résultat retourné après une opération de nettoyage.
 */
export interface CleaningResult {
  changed: boolean;
  removed: number;

  /**
   * Quantité retirée à chaque couche, dans l'ordre des couches
   * tel qu'il a été parcouru lors du nettoyage (du dessus vers
   * le dessous).
   *
   * Le composant associe cet index au type de salissure réellement
   * touché pour calculer une récompense cohérente avec la difficulté.
   */
  removedPerDepth: number[];
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

  /**
   * Seuil de propreté requis pour terminer une carte.
   *
   * La progression affichée reste le pourcentage réel de salissure
   * retirée (100 % uniquement quand tout est parti), mais la carte
   * est considérée terminée et la récompense versée dès que ce seuil
   * est atteint : le joueur garde donc une petite marge d'erreur.
   */
  static readonly COMPLETION_THRESHOLD = 98;

  /**
   * Miroir CPU de tout ce qui est visible dans le Canvas :
   * fond propre + salissures composées. C'est LA source de vérité
   * du rendu incrémental — le Canvas n'est jamais lu, uniquement
   * écrit par `putImageData`.
   *
   * Le curseur dessiné par le composant par-dessus ce contenu est
   * donc automatiquement effacé à chaque recomposition de zone,
   * sans jamais laisser de traînée ni masquer la carte.
   */
  private compositeBuffer?: ImageData;

  private get composite(): Uint8ClampedArray<ArrayBuffer> {
    return this.compositeBuffer!.data;
  }

  /**
   * Indique si les salissures ont changé depuis le dernier rendu.
   */
  private dirty = true;

  /**
   * Force une recomposition complète de la carte au prochain rendu
   * (première image, régénération des salissures...).
   */
  private fullRedrawRequired = true;

  // --------------------------------
  // Zone modifiée depuis le dernier rendu (dirty rect)
  // --------------------------------

  private hasRegion = false;
  private regionMinX = 0;
  private regionMinY = 0;
  private regionMaxX = -1;
  private regionMaxY = -1;

  /**
   * Buffer temporaire pour le rendu incrémental d'une zone.
   */
  private regionBuffer?: ImageData;

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

    // L'ordre des couches n'est utile que là où il y a de la
    // salissure : les zones propres sont toujours stockées sous
    // l'ordre canonique [0, 1, 2...], ce qui permet de les traiter
    // en bloc lors du rendu (voir render()).
    this.layerOrders = new Uint8Array(
      this.pixelCount * dirtTypes.length
    );

    // Le miroir CPU (composite) est alloué dès le premier appel à
    // render() (voir render()).

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

  // Toutes les cases sont propres au départ : l'ordre des couches
  // y reste canonique et le moteur peut donc les reconnaître
  // rapidement lors du rendu (voir generateLayerOrders()).
  // Attention : un simple fill(0) est faux dès qu'il existe plus de
  // deux salissures (l'ordre canonique est [0, 1, 2...], pas [0, 0, 0...]).
  this.fillCanonicalOrders();

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

  // Mélange l'ordre des couches là où il y a de la salissure.
  this.generateLayerOrders();

  // Mémorise la quantité initiale réelle pour la progression.
  this.initialAmount = this.getRemainingAmount();

  // Les salissures viennent d'être régénérées : invalide le cache
  // de quantité restante avant la lecture ci-dessus, puis force un
  // recomposition complète au prochain rendu.
  this.dirty = true;
  this.remainingCacheValid = false;
  this.fullRedrawRequired = true;
  this.resetRegion();
}

  // --------------------------------
  // Ordre des couches par pixel
  // --------------------------------

/**
 * Mélange l'ordre des couches uniquement là où c'est utile.
 *
 * Un ordre aléatoire n'a de sens que pour les pixels réellement
 * recouverts par plusieurs salissures : pour un pixel à une seule
 * couche, toutes les permutations sont visuellement identiques.
 * On ne tire donc un ordre que lors du premier motif "composé"
 * rencontré, et on le propage à tous les pixels partageant ce motif.
 *
 * Les pixels restés propres (et les pixels mono-couche) gardent
 * l'ordre canonique [0, 1, 2...] initialisé dans generate(), ce qui
 * permet au rendu de reconnaître les zones propres rapidement.
 */
private generateLayerOrders(): void {

  const dirtCount = this.dirtTypes.length;

  // Motif d'encodage : bits 0-3 = couches présentes, bits 4-7 = nombre
  // de couches présentes. Un pixel propre a un motif nul.
  const patternOf = (pixel: number): number => {

    let present = 0;
    let count = 0;

    for (let i = 0; i < dirtCount; i++) {
      if (this.layers[i][pixel] > 0) {
        present |= 1 << i;
        count++;
      }
    }

    return present | (count << 4);
  };

  // Ordre mémorisé par motif d'apparition.
  const orderByPattern = new Map<number, number[]>();

  for (let pixel = 0; pixel < this.pixelCount; pixel++) {

    const pattern = patternOf(pixel);

    // Pixel propre ou mono-couche : l'ordre canonique déjà stocké
    // donne exactement le même résultat visuel qu'un ordre mélangé.
    if ((pattern & 0xf0) <= (1 << 4)) continue;

    let order = orderByPattern.get(pattern);

    if (!order) {

      order = Array.from(
        { length: dirtCount },
        (_, index) => index
      );

      // Mélange Fisher-Yates.
      for (let i = dirtCount - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [order[i], order[j]] = [order[j], order[i]];
      }

      orderByPattern.set(pattern, order);
    }

    // Stocke l'ordre dans le tableau typé.
    const offset = pixel * dirtCount;

    for (let depth = 0; depth < dirtCount; depth++) {
      this.layerOrders[offset + depth] = order[depth];
    }
  }
}

/**
 * Remplit layerOrders avec l'ordre canonique [0, 1, 2...] pour
 * chaque pixel. Utilisé quand toutes les cases sont propres :
 * un fill(0) global ne serait canonique que pour la première
 * profondeur et ferait croire au rendu que les pixels sales sont
 * propres (ce qui masquait toute la carte hors curseur).
 */
private fillCanonicalOrders(): void {

  const dirtCount = this.dirtTypes.length;

  // Écriture par strided fill : la valeur i occupe les positions
  // i, i + dirtCount, i + 2*dirtCount... de tout le tableau.
  for (let i = 0; i < dirtCount; i++) {
    for (let p = i; p < this.layerOrders.length; p += dirtCount) {
      this.layerOrders[p] = i;
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

    const dirtCount = this.dirtTypes.length;

    // Quantité retirée par type de salissure : permet au composant
    // de rémunérer chaque type selon son propre multiplicateur.
    const removedByDirt = new Array<number>(dirtCount).fill(0);

    for (let py = minY; py <= maxY; py++) {

      for (let px = minX; px <= maxX; px++) {

        const dx = px - centerX;
        const dy = py - centerY;

        const distanceSquared = dx * dx + dy * dy;

        // Ignore les pixels situés hors du pinceau.
        // Comparaison au carré : évite un sqrt() par pixel.
        if (distanceSquared > radius * radius) continue;

        const pixelIndex = py * this.width + px;

        // Récupère l'ordre spécifique à ce pixel.
        const orderOffset = pixelIndex * dirtCount;

        // Les couches sont empilées dans un ordre aléatoire :
        // on commence par le fond, et chaque couche réellement
        // présente ajoute sa profondeur à celles déjà comptées.
        let depthBelow = 0;

        for (let depth = dirtCount - 1; depth >= 0; depth--) {

          const dirtIndex = this.layerOrders[orderOffset + depth];

          const layer = this.layers[dirtIndex];

          const amount = layer[pixelIndex];

          // Une couche vide ne compte pas dans la profondeur.
          if (amount === 0) continue;

          const dirt = this.dirtTypes[dirtIndex];

          // Efficacité spécifique de l'outil.
          const baseEfficiency = tool.efficiency[dirt.id] ?? 0;

          if (baseEfficiency === 0) {
            depthBelow++;
            continue;
          }

          // Malus appliqué selon la profondeur réelle.
          const depthMultiplier = Math.pow(
            1 - tool.depthPenalty,
            depthBelow
          );

          // Résistance propre à la salissure.
          const resistanceMultiplier =
            30 / Math.max(1, dirt.resistance);

          // Atténuation sur les bords du pinceau.
          const brushStrength =
            1 - Math.sqrt(distanceSquared) / radius;

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

            const delta = amount - newAmount;

            removed += delta;
            removedByDirt[dirtIndex] += delta;
          }

          // La prochaine salissure présente sera plus profonde.
          depthBelow++;
        }

        // Le pixel vient peut-être de devenir entièrement propre :
        // on range son ordre sous la forme canonique pour que le
        // rendu puisse le détecter et le traiter en bloc.
        if (this.isCleanPixel(pixelIndex)) {
          for (let i = 0; i < dirtCount; i++) {
            this.layerOrders[orderOffset + i] = i;
          }
        }
      }
    }

    if (removed > 0) {

      this.dirty = true;

      // La quantité restante a changé : le cache doit être recalculé.
      this.remainingCacheValid = false;

      // Seule la zone touchée par le pinceau doit être recomposée.
      this.invalidateRegion(minX, minY, maxX, maxY);
    }

    return {
      changed: removed > 0,
      removed,
      removedPerDepth: removedByDirt
    };
  }

  /**
   * Vérifie si toutes les couches d'un pixel sont vides.
   */
  private isCleanPixel(pixelIndex: number): boolean {

    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i][pixelIndex] !== 0) {
        return false;
      }
    }

    return true;
  }

  // --------------------------------
  // Rendu des salissures
  // --------------------------------

/**
 * Dessine l'état actuel des salissures dans le Canvas.
 *
 * Architecture de rendu :
 * - `composite` est un miroir CPU complet (fond + salissures) :
 *   c'est la source de vérité, elle ne contient JAMAIS le curseur.
 * - Une zone invalidée (nettoyage, ou ancienne position du curseur
 *   signalée par le composant via invalidateRegion()) est recomposée
 *   dans `composite`, puis recopiée dans le Canvas via un dirty rect.
 * - Le Canvas n'est jamais lu : tout dessin superposé par le
 *   composant (le curseur) est donc effacé dès que sa zone est
 *   recomposée — sans jamais masquer la carte ni laisser de traînée.
 */
render(
  ctx: CanvasRenderingContext2D,
  baseImage: ImageData
): void {

  const dirtCount = this.dirtTypes.length;

  // Allocation unique du miroir CPU à la première frame.
  if (!this.compositeBuffer) {
    this.compositeBuffer = new ImageData(this.width, this.height);
  }

  const needsFullRedraw = this.fullRedrawRequired;

  // Salissures retirées depuis le dernier rendu : toute la carte
  // doit être recomposée dans le miroir (cas rare : première frame,
  // régénération...).
  if (this.dirty) {

    for (let pixel = 0; pixel < this.pixelCount; pixel++) {
      this.composePixel(pixel, dirtCount, baseImage);
    }

    this.dirty = false;
    this.fullRedrawRequired = false;
  }

  // Une région a été signalée à repeindre (rectangle du pinceau, ou
  // ancienne position du curseur) : on la recopie du miroir vers le
  // Canvas via un dirty rect. Le miroir ne contenant jamais le
  // curseur, ce recopiage l'effare sans jamais masquer la carte.
  // Sans région, le Canvas est déjà identique au miroir : rien à faire.
  if (needsFullRedraw || !this.hasRegion) {

    this.resetRegion();

    if (needsFullRedraw) {
      ctx.putImageData(this.compositeBuffer, 0, 0);
    }

    return;
  }

  const regionWidth = this.regionMaxX - this.regionMinX + 1;
  const regionHeight = this.regionMaxY - this.regionMinY + 1;

  this.resetRegion();

  if (regionWidth <= 0 || regionHeight <= 0) return;

  // N'envoie que la zone modifiée au Canvas (source : le miroir).
  ctx.putImageData(
    this.compositeBuffer,
    0,
    0,
    this.regionMinX,
    this.regionMinY,
    regionWidth,
    regionHeight
  );
}

/**
 * Étend la zone à recomposer lors du prochain rendu.
 *
 * Appelé par cleanAt() avec le rectangle exact touché par le pinceau.
 */
invalidateRegion(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): void {

  if (!this.hasRegion) {
    this.regionMinX = minX;
    this.regionMinY = minY;
    this.regionMaxX = maxX;
    this.regionMaxY = maxY;
    this.hasRegion = true;
    return;
  }

  this.regionMinX = Math.min(this.regionMinX, minX);
  this.regionMinY = Math.min(this.regionMinY, minY);
  this.regionMaxX = Math.max(this.regionMaxX, maxX);
  this.regionMaxY = Math.max(this.regionMaxY, maxY);
}

private resetRegion(): void {
  this.hasRegion = false;
  this.regionMinX = 0;
  this.regionMinY = 0;
  this.regionMaxX = -1;
  this.regionMaxY = -1;
}

/**
 * Recompose entièrement un pixel du miroir CPU : fond propre puis
 * salissures encore présentes. Repartir du fond (et non de l'état
 * précédent du miroir) garantit l'idempotence — un pixel nettoyé
 * puis recomposé ne conserve jamais de résidu ni de dessin superposé.
 */
private composePixel(
  pixel: number,
  dirtCount: number,
  baseImage: ImageData
): void {

  const offset = pixel * 4;

  const composite = this.composite;

  composite[offset] = baseImage.data[offset];
  composite[offset + 1] = baseImage.data[offset + 1];
  composite[offset + 2] = baseImage.data[offset + 2];
  composite[offset + 3] = baseImage.data[offset + 3];

  this.composePixelInto(pixel, dirtCount, composite, offset);
}

/**
 * Compose toutes les salissures d'un pixel dans le buffer donné,
 * à l'offset fourni. Le buffer doit déjà contenir la couleur du
 * fond propre pour ce pixel.
 */
private composePixelInto(
  pixel: number,
  dirtCount: number,
  pixels: Uint8ClampedArray<ArrayBuffer>,
  pixelOffset: number
): void {

  const orderOffset = pixel * dirtCount;

  // Pixel entièrement propre : son ordre est resté canonique,
  // il garde donc la couleur du fond déjà copiée.
  if (this.isCanonicalOrder(orderOffset, dirtCount)) {
    return;
  }

  let r = pixels[pixelOffset];
  let g = pixels[pixelOffset + 1];
  let b = pixels[pixelOffset + 2];

  // Composition du dessous vers le dessus.
  for (let depth = dirtCount - 1; depth >= 0; depth--) {

    const dirtIndex = this.layerOrders[orderOffset + depth];

    const amount = this.layers[dirtIndex][pixel];

    if (amount === 0) continue;

    const alpha = amount / 255;

    const color = this.dirtColors[dirtIndex];

    // Mélange de la couleur de salissure avec le pixel existant.
    r = color.r * alpha + r * (1 - alpha);
    g = color.g * alpha + g * (1 - alpha);
    b = color.b * alpha + b * (1 - alpha);
  }

  pixels[pixelOffset] = r;
  pixels[pixelOffset + 1] = g;
  pixels[pixelOffset + 2] = b;
}

/**
 * Détecte un ordre canonique [0, 1, 2...], signature des pixels
 * qui ne contiennent plus de salissure.
 */
private isCanonicalOrder(
  orderOffset: number,
  dirtCount: number
): boolean {

  for (let i = 0; i < dirtCount; i++) {
    if (this.layerOrders[orderOffset + i] !== i) {
      return false;
    }
  }

  return true;
}

  // --------------------------------
  // Progression
  // --------------------------------

  /**
   * Retourne la quantité totale de salissure encore présente.
   *
   * Le résultat est mis en cache : il n'est recalculé que si des
   * salissures ont été retirées depuis la dernière consultation.
   * Ce parcourt complet des couches était appelé plusieurs fois par
   * seconde (progression + test de fin de carte) et pénalisait
   * fortement les grandes cartes.
   */
  getRemainingAmount(): number {

    if (this.remainingCacheValid) {
      return this.cachedRemainingAmount;
    }

    let remaining = 0;

    for (const layer of this.layers) {

      for (let i = 0; i < layer.length; i++) {
        remaining += layer[i];
      }
    }

    this.cachedRemainingAmount = remaining;
    this.remainingCacheValid = true;

    return remaining;
  }

  private cachedRemainingAmount = 0;
  private remainingCacheValid = false;


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
   * Indique si la carte peut être considérée comme terminée.
   *
   * La barre de progression affiche le pourcentage réel : elle
   * n'atteint 100 % que lorsque la moindre salissure a disparu.
   * La carte est en revanche validée dès le seuil de propreté
   * atteint, ce qui laisse au joueur une petite marge d'erreur.
   */
  isComplete(): boolean {
    return this.getProgress() >= DirtEngine.COMPLETION_THRESHOLD;
  }
}
