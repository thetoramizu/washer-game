/**
 * Effets visuels « physiques » de l'écran de jeu : gouttelettes
 * et secousse d'écran.
 *
 * Ce module est volontairement indépendant d'Angular : il ne fait
 * que simuler et dessiner, sans état partagé avec le composant.
 * La boucle d'animation du composant lui délègue ces deux rôles.
 */

/**
 * Gouttelette émise sous le curseur pendant le nettoyage :
 * particule physique simple (position, vélocité, durée de vie),
 * dessinée dans la boucle de rendu — jamais via le DOM.
 */
export interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

/**
 * Secousse d'écran : translation aléatoire brève appliquée à
 * tout le canvas (à la victoire, ou en retour tactile léger).
 */
export interface ScreenShake {
  intensity: number;
  until: number;
}

/**
 * Durée de référence des secousses (ms) : sert de dénominateur
 * pour faire décroître linéairement l'amplitude jusqu'à zéro.
 * Doit rester cohérent avec la durée passée à `triggerShake`.
 */
export const SHAKE_BASE_DURATION_MS = 450;

/**
 * Déclenche une secousse d'écran brève.
 *
 * @param shakeObjet Reference to the shake state holder.
 * @param intensity Amplitude maximale en pixels canvas.
 * @param duration Durée en millisecondes.
 */
export function triggerShake(
  state: { shake: ScreenShake | null },
  intensity: number,
  duration: number,
): void {
  state.shake = {
    intensity,
    until: performance.now() + duration,
  };
}

/**
 * Calcule la translation (x, y) à appliquer au canvas pour
 * l'image courante et purge la secousse lorsqu'elle est terminée.
 *
 * @returns Les offsets en pixels (0, 0 si écran stable).
 */
export function computeShakeOffset(shake: ScreenShake | null): {
  x: number;
  y: number;
  shake: ScreenShake | null;
} {
  if (!shake) return { x: 0, y: 0, shake: null };

  const remaining = shake.until - performance.now();

  if (remaining <= 0) {
    // Secousse terminée : on la purge.
    return { x: 0, y: 0, shake: null };
  }

  // Amplitude décroissante sur la durée restante.
  const amplitude = shake.intensity * (remaining / SHAKE_BASE_DURATION_MS);

  return {
    x: (Math.random() * 2 - 1) * amplitude,
    y: (Math.random() * 2 - 1) * amplitude,
    shake,
  };
}

/**
 * Émet quelques gouttelettes autour d'un point, projetées vers
 * l'extérieur avec une légère gravité initiale.
 *
 * @param droplets Liste cible (mutée) des particules actives.
 * @param count Nombre de gouttelettes à créer.
 * @param color Couleur CSS de remplissage.
 * @param originX Position d'origine (espace canvas).
 * @param originY Position d'origine (espace canvas).
 * @param maxCap Nombre maximal de particules simultanées :
 *   au-delà, les plus anciennes sont remplacées (coût borné).
 */
export function spawnDroplets(
  droplets: Droplet[],
  count: number,
  color: string,
  originX: number,
  originY: number,
  maxCap: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    const maxLife = 0.35 + Math.random() * 0.45;

    droplets.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      radius: 1.5 + Math.random() * 2.5,
      life: maxLife,
      maxLife,
      color,
    });
  }

  // Limite le nombre total de particules.
  if (droplets.length > maxCap) {
    droplets.splice(0, droplets.length - maxCap);
  }
}

/**
 * Repositionne les dernières gouttelettes émises sur le bord du
 * cercle d'action de l'outil : elles naissent autour du pointeur,
 * pas exactement dessous (projection radiale).
 *
 * @param droplets Liste des particules actives (mutée).
 * @param pointerX Centre du curseur (espace canvas).
 * @param pointerY Centre du curseur (espace canvas).
 * @param edgeRadius Rayon du placement, à l'échelle du canvas.
 * @param take Nombre de particules concernées (les plus récentes).
 */
export function scatterRecentDroplets(
  droplets: Droplet[],
  pointerX: number,
  pointerY: number,
  edgeRadius: number,
  take: number,
): void {
  for (const drop of droplets.slice(-take)) {
    const angle = Math.random() * Math.PI * 2;
    drop.x = pointerX + Math.cos(angle) * edgeRadius;
    drop.y = pointerY + Math.sin(angle) * edgeRadius;
  }
}

/**
 * Met à jour la physique des gouttelettes (gravité, vieillissement).
 * Les particules expirées sont retirées de la liste.
 */
export function updateDroplets(droplets: Droplet[], deltaSeconds: number): void {
  for (let i = droplets.length - 1; i >= 0; i--) {
    const drop = droplets[i];

    drop.life -= deltaSeconds;

    if (drop.life <= 0) {
      droplets.splice(i, 1);
      continue;
    }

    drop.vy += 380 * deltaSeconds; // gravité
    drop.x += drop.vx * deltaSeconds;
    drop.y += drop.vy * deltaSeconds;
  }
}

/**
 * Dessine les gouttelettes avec un fondu lié à leur âge.
 */
export function drawDroplets(ctx: CanvasRenderingContext2D, droplets: Droplet[]): void {
  for (const drop of droplets) {
    const alpha = Math.max(drop.life / drop.maxLife, 0) * 0.8;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = drop.color;

    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
