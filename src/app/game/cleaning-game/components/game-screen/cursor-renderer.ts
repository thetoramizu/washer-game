import { CleaningTool } from '../../../models/cleaning-tool';

/**
 * Rendu du curseur personnalisé de l'écran de jeu.
 *
 * Le pointeur système est masqué (cursor: none) ; cet anneau
 * montre le rayon réel de l'outil équipé, coloré selon sa
 * famille, avec un retour visuel pendant le frottement.
 *
 * Module indépendant d'Angular : il ne fait que dessiner.
 */

/**
 * Couleur d'accent associée à chaque outil (curseur, anneau).
 */
const TOOL_ACCENT_COLORS: Record<string, string> = {
  'sponge': '#f4c95d',
  'brush': '#7ec4a0',
  'scraper': '#8ab6d4',
  'pressure-washer': '#6ea8fe',
  'steam-cleaner': '#c9a0f5',
  'overpowered': '#ff8a7a',
};

export function toolAccentColor(toolId: string): string {
  return TOOL_ACCENT_COLORS[toolId] ?? '#ffffff';
}

/**
 * Dessine l'anneau du curseur, son halo, la pulsation de
 * frottement et la croix centrale de précision.
 *
 * @param ctx Contexte 2D du canvas principal.
 * @param tool Outil équipé (sa `radius` est en unités carte).
 * @param x Position du curseur (espace canvas).
 * @param y Position du curseur (espace canvas).
 * @param scaleFactor Rapport largeur canvas / largeur carte,
 *   pour exprimer le rayon de l'outil à l'échelle du rendu.
 * @param isCleaning Pulsation active pendant un frottement.
 */
export function drawCursorRing(
  ctx: CanvasRenderingContext2D,
  tool: CleaningTool,
  x: number,
  y: number,
  scaleFactor: number,
  isCleaning: boolean,
): void {
  // Le rayon de l'outil est exprimé en unités carte :
  // on le convertit à l'échelle du canvas.
  const radiusOnCanvas = tool.radius * scaleFactor;

  // Couleur d'accent propre à l'outil équipé.
  const accent = toolAccentColor(tool.id);

  // Anneau extérieur : double trait blanc/colouré pour
  // rester lisible sur les surfaces claires comme sombres.
  ctx.beginPath();
  ctx.arc(x, y, radiusOnCanvas, 0, Math.PI * 2);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radiusOnCanvas, 0, Math.PI * 2);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Halo intérieur très léger : suggère la zone d'effet.
  ctx.beginPath();
  ctx.arc(x, y, radiusOnCanvas, 0, Math.PI * 2);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fill();

  // Anneau pulsé pendant un frottement actif : retour visuel
  // du nettoyage en cours.
  if (isCleaning) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 90);

    ctx.beginPath();
    ctx.arc(x, y, radiusOnCanvas * 0.92, 0, Math.PI * 2);

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35 * pulse;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Croix centrale : précision du point d'impact.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(x - 6, y);
  ctx.lineTo(x + 6, y);
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 6);
  ctx.stroke();
}
