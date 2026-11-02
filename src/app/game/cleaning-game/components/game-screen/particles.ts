/**
 * Module de rendu des effets « retour visuel » du nettoyage :
 * gouttelettes (particules physiques) et secousses d'écran.
 *
 * Logique déplacée hors du composant GameScreen lors de la
 * refactorisation : ce module est pur (aucune dépendance Angular),
 * il ne manipule qu'un CanvasRenderingContext2D et le temps fourni
 * par la boucle d'animation. Le composant ne fait que transmettre
 * ses coordonnées de curseur et son contexte.
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
 * Gestionnaire combiné des particules et de la secousse d'écran.
 *
 * Les deux effets respectent le réglage d'accessibilité du système
 * (« prefers-reduced-motion ») : si l'utilisateur demande une
 * réduction des mouvements, aucune particule ni tremblement n'est
 * généré.
 */
export class ParticleSystem {
  /**
   * Nombre maximal de particules simultanées : au-delà, les
   * plus anciennes sont remplacées (coût de dessin borné).
   */
  private static readonly MAX_DROPLETS = 90;

  /** Gravité appliquée aux gouttelettes (px/s²). */
  private static readonly GRAVITY = 380;

  /** Gouttelettes actives, mises à jour et dessinées par la boucle de rendu. */
  private droplets: Droplet[] = [];

  /** Secousse en cours (null = écran stable). */
  private shake: ScreenShake | null = null;

  /** Respecte le réglage d'accessibilité du système. */
  private readonly reduceMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Liste vivante des gouttelettes (lecture seule côté composant). */
  get currentDroplets(): readonly Droplet[] {
    return this.droplets;
  }

  /**
   * Déclenche une secousse d'écran brève.
   *
   * @param intensity Amplitude maximale en pixels canvas.
   * @param duration Durée en millisecondes.
   */
  triggerShake(intensity: number, duration: number): void {
    if (this.reduceMotion) return;

    this.shake = {
      intensity,
      until: performance.now() + duration,
    };
  }

  /**
   * Calcule la translation (dx, dy) à appliquer à la scène pour la
   * secousse en cours, et met à jour l'état interne (une secousse
   * arrivée à expiration redevient null).
   *
   * Reproduction exacte de l'ancienne logique inline du composant :
   * amplitude proportionnelle au temps restant, normalisée sur la
   * durée de référence de 450 ms.
   */
  computeShakeOffset(): { dx: number; dy: number } {
    if (!this.shake) return { dx: 0, dy: 0 };

    const remaining = this.shake.until - performance.now();

    if (remaining <= 0) {
      this.shake = null;
      return { dx: 0, dy: 0 };
    }

    // Amplitude décroissante sur la durée restante.
    const amplitude = this.shake.intensity * (remaining / 450);

    return {
      dx: (Math.random() * 2 - 1) * amplitude,
      dy: (Math.random() * 2 - 1) * amplitude,
    };
  }

  /**
   * Émet quelques gouttelettes autour du point (x, y), projetées
   * vers l'extérieur avec une légère gravité.
   */
  spawnDroplets(count: number, color: string, x: number, y: number): void {
    if (this.reduceMotion) return;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;

      const maxLife = 0.35 + Math.random() * 0.45;

      this.droplets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        radius: 1.5 + Math.random() * 2.5,
        life: maxLife,
        maxLife,
        color,
      });
    }

    // Limite le nombre total de particules.
    if (this.droplets.length > ParticleSystem.MAX_DROPLETS) {
      this.droplets.splice(
        0,
        this.droplets.length - ParticleSystem.MAX_DROPLETS,
      );
    }
  }

  /**
   * Met à jour la physique des gouttelettes (gravité, vieillesse).
   */
  update(deltaSeconds: number): void {
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const drop = this.droplets[i];

      drop.life -= deltaSeconds;

      if (drop.life <= 0) {
        this.droplets.splice(i, 1);
        continue;
      }

      drop.vy += ParticleSystem.GRAVITY * deltaSeconds;
      drop.x += drop.vx * deltaSeconds;
      drop.y += drop.vy * deltaSeconds;
    }
  }

  /**
   * Dessine les gouttelettes avec un fondu lié à leur âge.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const drop of this.droplets) {
      const alpha = Math.max(drop.life / drop.maxLife, 0) * 0.8;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = drop.color;

      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  /** Supprime toutes les particules et coupe la secousse en cours. */
  reset(): void {
    this.droplets.length = 0;
    this.shake = null;
  }
}
