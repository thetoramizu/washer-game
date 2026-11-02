import { SurfaceStyle } from '../models/game-world';

/**
 * Générateur de surfaces propres, indépendant d'Angular.
 *
 * Les dessins de textures (dalles, toile, asphalte…) ont été
 * extraits de l'écran de jeu pour être partagés entre :
 * - le canvas de la partie (fond de carte) ;
 * - les miniatures génératives de la sélection de cartes.
 *
 * Toutes les fonctions peignent uniquement dans le `ctx` fourni,
 * à la taille demandée. La génération aléatoire reste volontairement
 * non déterministe (une miniature peut différer légèrement de la
 * carte réelle : c'est un aperçu, pas un miroir exact).
 */
export const SurfacePainter = {

  /**
   * Dessine la surface correspondant au style d'une carte.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    style: SurfaceStyle,
    width: number,
    height: number
  ): void {

    switch (style) {

      case 'canvas':
        this.painting(ctx, width, height);
        break;

      case 'road':
        this.road(ctx, width, height);
        break;

      case 'night':
        this.night(ctx, width, height);
        break;

      case 'garden':
        this.garden(ctx, width, height);
        break;

      case 'concrete':
        this.concrete(ctx, width, height);
        break;

      default:
        this.tiles(ctx, width, height);
    }
  },

  /**
   * Terrain commun : petites variations de teinte en plus des
   * motifs propres à chaque surface.
   */
  speckle(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    count = 450
  ): void {

    ctx.fillStyle = color;

    for (let i = 0; i < count; i++) {
      ctx.fillRect(
        Math.random() * width,
        Math.random() * height,
        1,
        1
      );
    }
  },

  /**
   * Monde Maison — terrasse : dalles de pierre.
   */
  tiles(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {

    ctx.fillStyle = '#aaa99c';
    ctx.fillRect(0, 0, width, height);

    // Dalles de pierre (adaptées à la résolution réduite).
    const tileSize = 25;

    for (let x = 0; x < width; x += tileSize) {
      for (let y = 0; y < height; y += tileSize) {

        ctx.fillStyle =
          Math.random() > 0.5 ? '#b5b4a6' : '#a5a496';

        ctx.fillRect(
          x + 1,
          y + 1,
          tileSize - 2,
          tileSize - 2
        );
      }
    }

    this.speckle(ctx, width, height, 'rgba(70, 70, 60, 0.08)');
  },

  /**
   * Monde Maison — jardin : terre et touffes d'herbe.
   */
  garden(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {

    ctx.fillStyle = '#7d8459';
    ctx.fillRect(0, 0, width, height);

    // Touffes d'herbe de deux teintes.
    for (let i = 0; i < 900; i++) {

      ctx.fillStyle =
        Math.random() > 0.5 ? '#87905f' : '#737b52';

      ctx.fillRect(
        Math.random() * width,
        Math.random() * height,
        3,
        2
      );
    }

    // Cailloux çà et là.
    for (let i = 0; i < 60; i++) {

      ctx.fillStyle = 'rgba(150, 145, 130, 0.55)';

      ctx.beginPath();
      ctx.arc(
        Math.random() * width,
        Math.random() * height,
        1.5 + Math.random() * 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  },

  /**
   * Monde Maison — sous-sol : béton brut avec joints.
   */
  concrete(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {

    ctx.fillStyle = '#83867f';
    ctx.fillRect(0, 0, width, height);

    // Grandes plaques de béton séparées par des joints sombres.
    const slabSize = 60;

    ctx.strokeStyle = 'rgba(55, 58, 55, 0.5)';
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += slabSize) {

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += slabSize) {

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Taches de béton plus clair / plus foncé.
    for (let i = 0; i < 120; i++) {

      ctx.fillStyle = Math.random() > 0.5
        ? 'rgba(140, 143, 136, 0.25)'
        : 'rgba(65, 68, 64, 0.20)';

      ctx.beginPath();
      ctx.arc(
        Math.random() * width,
        Math.random() * height,
        2 + Math.random() * 6,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  },

  /**
   * Monde Peinture — tableau : cadre boisé et toile peinte.
   */
  painting(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {

    // Cadre en bois autour de la toile.
    const frame = Math.max(10, Math.round(width * 0.03));

    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(0, 0, width, height);

    // Relief du cadre (bord interne plus clair).
    ctx.fillStyle = '#8a6242';
    ctx.fillRect(
      frame * 0.35,
      frame * 0.35,
      width - frame * 0.7,
      height - frame * 0.7
    );

    // Toile : fond ciel.
    const canvasX = frame;
    const canvasY = frame;
    const canvasW = width - frame * 2;
    const canvasH = height - frame * 2;

    const sky = ctx.createLinearGradient(
      0,
      canvasY,
      0,
      canvasY + canvasH
    );

    sky.addColorStop(0, '#a8c8dd');
    sky.addColorStop(0.65, '#d8dcc2');
    sky.addColorStop(1, '#e7dfa8');

    ctx.fillStyle = sky;
    ctx.fillRect(canvasX, canvasY, canvasW, canvasH);

    // Soleil.
    ctx.fillStyle = '#f2d98c';
    ctx.beginPath();
    ctx.arc(
      canvasX + canvasW * 0.72,
      canvasY + canvasH * 0.28,
      Math.max(6, canvasW * 0.045),
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Collines en arrière-plan.
    ctx.fillStyle = '#8fae7c';
    ctx.beginPath();
    ctx.moveTo(canvasX, canvasY + canvasH * 0.72);
    ctx.quadraticCurveTo(
      canvasX + canvasW * 0.3,
      canvasY + canvasH * 0.5,
      canvasX + canvasW * 0.6,
      canvasY + canvasH * 0.7
    );
    ctx.quadraticCurveTo(
      canvasX + canvasW * 0.8,
      canvasY + canvasH * 0.8,
      canvasX + canvasW,
      canvasY + canvasH * 0.62
    );
    ctx.lineTo(canvasX + canvasW, canvasY + canvasH);
    ctx.lineTo(canvasX, canvasY + canvasH);
    ctx.closePath();
    ctx.fill();

    // Pré au premier plan.
    ctx.fillStyle = '#6f9154';
    ctx.beginPath();
    ctx.moveTo(canvasX, canvasY + canvasH * 0.85);
    ctx.quadraticCurveTo(
      canvasX + canvasW * 0.5,
      canvasY + canvasH * 0.75,
      canvasX + canvasW,
      canvasY + canvasH * 0.88
    );
    ctx.lineTo(canvasX + canvasW, canvasY + canvasH);
    ctx.lineTo(canvasX, canvasY + canvasH);
    ctx.closePath();
    ctx.fill();

    // Empâtes de pinceau : la touche « peinture à l'huile ».
    for (let i = 0; i < 140; i++) {

      const palette = ['#9dbb85', '#7fa06a', '#c9d3a8', '#e3dcae'];

      ctx.fillStyle =
        palette[Math.floor(Math.random() * palette.length)];

      ctx.save();

      const px = canvasX + Math.random() * canvasW;
      const py =
        canvasY + canvasH * 0.6 + Math.random() * canvasH * 0.4;

      ctx.translate(px, py);
      ctx.rotate((Math.random() - 0.5) * 0.6);
      ctx.fillRect(-4, -1.5, 8, 3);

      ctx.restore();
    }

    // Vernis jauni : léger voile chaud sur toute la toile.
    ctx.fillStyle = 'rgba(120, 90, 40, 0.08)';
    ctx.fillRect(canvasX, canvasY, canvasW, canvasH);
  },

  /**
   * Monde Extérieur — route / chemin : asphalte et marquages.
   */
  road(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {

    // Bandes d'herbe de part et d'autre de la chaussée.
    ctx.fillStyle = '#6f8a55';
    ctx.fillRect(0, 0, width, height);

    const roadTop = Math.round(height * 0.16);
    const roadBottom = Math.round(height * 0.84);

    // Chaussée goudronnée.
    ctx.fillStyle = '#5c5e60';
    ctx.fillRect(0, roadTop, width, roadBottom - roadTop);

    // Usure : bandes plus claires là où passent les roues.
    ctx.fillStyle = 'rgba(110, 112, 114, 0.35)';
    ctx.fillRect(0, roadTop + (roadBottom - roadTop) * 0.18, width, 8);
    ctx.fillRect(0, roadTop + (roadBottom - roadTop) * 0.66, width, 8);

    // Liseré blanc en bord de chaussée.
    ctx.fillStyle = 'rgba(230, 230, 220, 0.85)';
    ctx.fillRect(0, roadTop + 3, width, 3);
    ctx.fillRect(0, roadBottom - 6, width, 3);

    // Marque centrale jaune discontinu.
    const middle = Math.round((roadTop + roadBottom) / 2);
    const dashWidth = Math.max(14, Math.round(width * 0.03));

    ctx.fillStyle = '#d9b23c';

    for (let x = 0; x < width; x += dashWidth * 2) {
      ctx.fillRect(x, middle - 2, dashWidth, 4);
    }

    // Grain de l'asphalte.
    this.speckle(
      ctx,
      width,
      height,
      'rgba(30, 30, 30, 0.18)',
      900
    );

    // Herbes folles débordant sur la chaussée.
    ctx.fillStyle = 'rgba(90, 120, 70, 0.6)';

    for (let i = 0; i < 90; i++) {

      const edge = Math.random() > 0.5
        ? roadTop + Math.random() * 4
        : roadBottom - Math.random() * 4;

      ctx.fillRect(Math.random() * width, edge, 2, 4);
    }
  },

  /**
   * Monde Nuit — chaussée plongée dans le noir.
   *
   * La surface elle-même est très sombre : seul le halo de
   * l'outil révèle ce qui entoure le curseur.
   */
  night(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {

    // Fond quasi noir.
    ctx.fillStyle = '#101218';
    ctx.fillRect(0, 0, width, height);

    // Bande de chaussée à peine plus claire.
    const roadTop = Math.round(height * 0.2);
    const roadBottom = Math.round(height * 0.8);

    ctx.fillStyle = '#1b1e26';
    ctx.fillRect(0, roadTop, width, roadBottom - roadTop);

    // Marquage central fantomatique.
    const middle = Math.round((roadTop + roadBottom) / 2);
    const dashWidth = Math.max(14, Math.round(width * 0.03));

    ctx.fillStyle = 'rgba(190, 180, 120, 0.35)';

    for (let x = 0; x < width; x += dashWidth * 2) {
      ctx.fillRect(x, middle - 1, dashWidth, 3);
    }

    // Reflets très discrets de l'asphalte humide.
    for (let i = 0; i < 70; i++) {

      ctx.fillStyle = 'rgba(70, 80, 100, 0.10)';

      ctx.fillRect(
        Math.random() * width,
        roadTop + Math.random() * (roadBottom - roadTop),
        6,
        1
      );
    }
  },
};
