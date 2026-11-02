import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  computed,
  signal,
  ViewChild,
} from '@angular/core';
import { DIRT_TYPES } from '../../../models/dirt-types.data';
import { DirtEngine } from '../../engine/dirt-engine/dirt-engine';
import { GameMap } from '../../../models/game-map';
import { GAME_MAPS } from '../../../models/game-maps.data';
import { GamingState } from '../../../services/gaming-state';
import { CleaningTool } from '../../../models/cleaning-tool';
import { DecimalPipe } from '@angular/common';
import { AudioService, WorldAmbience } from '../../../services/audio.service';

/**
 * Particule éphémère dessinée par la boucle d'animation :
 * gouttelette de salissure, éclat doré de gain ou confetti.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'spray' | 'spark' | 'confetti';
}

/**
 * Emoji représentatif de chaque outil, dessiné sur le curseur.
 */
const TOOL_EMOJIS: Record<string, string> = {
  sponge: '🧽',
  brush: '🪥',
  scraper: '🪟',
  'pressure-washer': '💦',
  'steam-cleaner': '♨️',
  overpowered: '⚡',
};

/**
 * Écran de jeu : canvas, nettoyage et barre d'outils.
 *
 * Hérite du logic de la partie déplacé hors du composant
 * principal lors du refacto navigation.
 */
@Component({
  imports: [DecimalPipe],
  selector: 'wash-game-screen',
  styleUrl: './game-screen.scss',
  templateUrl: './game-screen.html',
})
export class GameScreen implements AfterViewInit, OnDestroy {

  // Largeur native maximale du canvas : au-delà, la carte est
  // rendue à une résolution plafonnée pour rester fluide.
  private static readonly MAX_CANVAS_WIDTH = 1400;

  // Socle de récompense versé même si les gains accumulés pendant
  // la partie restent modestes (cohérent avec des améliorations à
  // partir de 100 $).
  private static readonly MINIMUM_MAP_REWARD = 25;

  // Largeur native minimale du canvas : en dessous, la carte
  // serait trop petite pour être jouable ; elle débordera donc
  // horizontalement (défilement dans son conteneur).
  private static readonly MIN_CANVAS_WIDTH = 640;

  // Facteur d'échelle physique maximal appliqué au canvas :
  // au-delà, l'image serait visiblement floue ou pixélisée.
  private static readonly MAX_DISPLAY_SCALE = 1.5;

  // Observeur qui adapte la résolution du canvas à la taille
  // réelle de son conteneur (redimensionnement de fenêtre,
  // rotation mobile, etc.).
  private resizeObserver?: ResizeObserver;

  // Dernière largeur de conteneur prise en compte, pour éviter
  // de recalculer le canvas pour quelques pixels près.
  private lastContainerWidth = 0;

  @ViewChild('gameCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly gamingState = inject(GamingState);

  // Audio synthétisé (frottement, gains, victoire, ambiance).
  private readonly audio = inject(AudioService);

  /**
   * Préférence sonore exposée au gabarit (bouton 🔊/🔇 de
   * l'en-tête) ; le vrai état vit dans la sauvegarde.
   */
  readonly audioMuted = this.audio.muted;

  toggleMute(): void {
    this.audio.toggleMute();
  }

  /**
   * Ambiance sonore du monde actuellement chargé.
   */
  private get worldAmbience(): WorldAmbience {
    return this.activeMap().worldId as WorldAmbience;
  }

  dirtTypes = DIRT_TYPES;

  // Catalogue des cartes disponibles.
  readonly maps = GAME_MAPS;

  // Carte actuellement chargée.
  activeMap = signal<GameMap>(GAME_MAPS[0]);

  // Dimensions de la carte actuellement chargée.
  private get WIDTH(): number {
    return this.activeMap().width;
  }

  private get HEIGHT(): number {
    return this.activeMap().height;
  }

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  // Moteur indépendant qui gère toutes les salissures.
  private dirtEngine!: DirtEngine;

  // Image de référence de la surface propre.
  // Elle ne sera générée qu'une seule fois.
  private cleanImage!: ImageData;

  // Temps du dernier nettoyage, pour calculer le deltaTime.
  private lastCleanTime = 0;

  // Contexte utilisé uniquement pour générer la surface propre.
  private cleanCtx!: CanvasRenderingContext2D;

  private isCleaning = false;
  private pointerX = -100;
  private pointerY = -100;
  private pointerInside = false;

  // Progression du nettoyage, pilotée par un signal : seule la
  // barre de progression et l'affichage « % » dépendent d'elle.
  // Sa mise à jour est throttlée (voir THROTTLE) pour éviter de
  // marquer le change detection plusieurs fois par image.
  readonly progress = signal(0);

  // Intervalle minimal entre deux mises à jour de la progression.
  private static readonly PROGRESS_UPDATE_INTERVAL_MS = 150;

  /**
   * Le seuil de validation étant fixé à 99,5 %, un joueur qui voit
   * « 99 % » peut encore devoir frotter quelques résidus avant
   * que la progression réelle n'atteigne ce seuil. On l'indique
   * pour éviter la frustration, sans forcer un nettoyage parfait.
   */
  get showFinishHint(): boolean {
    return this.mapReward() === 0 && this.progress() >= 99;
  }

  /**
   * Le monde « nuit » n'est éclairé que par le halo de l'outil :
   * le rendu applique un masque noir autour du curseur.
   */
  private get isNightWorld(): boolean {
    return this.activeMap().surfaceStyle === 'night';
  }

  // Boucle d'animation : rend la scène à chaque image au lieu
  // de tout recalculer à chaque événement du pointeur.
  private rafId = 0;
  private running = false;

  // Horodatage de la dernière mise à jour de la progression
  // (throttle : le calcul complet est coûteux sur les grandes cartes).
  private lastProgressUpdate = 0;

  // L'écoute du pointeur se fait directement sur le canvas :
  // le rendu (canvas + requestAnimationFrame) ne passe donc par
  // aucun mécanisme de change detection à chaque mouvement.
  private detachPointerListeners?: () => void;

  // Gains accumulés pendant la partie en cours (valeur exacte,
  // utilisée pour le plafond de récompense éventuel).
  private earnedMoney = 0;

  // Même valeur exposée à la vue : mise à jour throttlée depuis
  // la boucle de rendu (jamais dans les écouteurs du pointeur).
  readonly sessionEarnings = signal(0);

  // Horodatage de la dernière remontée des gains de session.
  private lastEarningsPush = 0;

  // Libellé d'affichage des gains de session (+X $ sous le %.).
  readonly sessionEarningsLabel = computed(() => {
    const earned = Math.floor(this.sessionEarnings());
    return earned > 0 ? `+${earned} $` : '';
  });

  /**
   * Particules visuelles « juice » : gouttelettes projetées quand
   * on frotte, éclats dorés quand un gain est accumulé, pluie de
   * confettis à la victoire. Elles vivent uniquement dans la boucle
   * d'animation (aucun signal par particule).
   */
  private particles: Particle[] = [];

  // Curseur adouci (interpolation) pour le rendu de l'outil :
  // donne un effet « vivant » au halo et à l'emoji de l'outil.
  private renderCursorX = -100;
  private renderCursorY = -100;

  // Petit tremblement du halo la nuit (lanterne vivante).
  private flickerPhase = 0;

  // Récompense versée à la fin de la partie.
  readonly mapReward = signal(0);

  // Menu de victoire affiché par-dessus le jeu dès que la
  // récompense est obtenue (recommencer / changer de carte /
  // boutique / menu principal). Le joueur peut le refermer pour
  // continuer à frotter les derniers résidus.
  readonly victoryMenuOpen = signal(false);

  ngAfterViewInit(): void {

    // Les écouteurs sont posés directement sur le canvas : en
    // zoneless, ni les mouvements du pointeur ni le rendu ne
    // déclenchent de change detection.
    this.setupCanvasInteraction();

    // Le canvas n'existe que lorsque cet écran est affiché :
    // la partie peut donc démarrer ici, en tenant compte de
    // la carte choisie dans l'écran de sélection.
    const selectedMap = this.gamingState.selectedMap();

    if (selectedMap) {
      this.selectMap(selectedMap.id);
    } else {
      this.initializeGame();
    }
  }

  ngOnDestroy(): void {
    this.detachPointerListeners?.();
    this.resizeObserver?.disconnect();
    this.stopRenderLoop();
  }

  // --------------------------------
  // Adaptation aux taille d'écran
  // --------------------------------

  /**
   * Ajuste la résolution interne du canvas à la largeur
   * réellement disponible à l'écran.
   *
   * La carte s'adapte ainsi à la taille de l'écran : sur un
   * grand moniteur elle occupe tout l'espace (dans la limite
   * d'un plafond de résolution pour garder un rendu fluide),
   * sur un petit écran elle se réduit proportionnellement.
   * Le ratio largeur/hauteur de la carte est toujours conservé,
   * sinon le repérage curseur/zones serait décalé.
   */
  private sizeCanvasToDisplay(): void {

    const container = this.canvas.parentElement;

    // Largeur physique disponible (conteneur) ; si elle n'est
    // pas encore mesurable, on retombe sur la taille de la carte.
    const availableWidth =
      container && container.clientWidth > 0
        ? container.clientWidth - 24 // padding du conteneur
        : Math.min(this.WIDTH, GameScreen.MAX_CANVAS_WIDTH);

    // Échelle d'affichage : la carte remplit l'espace disponible,
    // sans jamais être agrandie au-delà d'un facteur raisonnable
    // (sinon l'image deviendrait floue).
    let displayScale = availableWidth / this.WIDTH;

    displayScale = Math.min(
      displayScale,
      GameScreen.MAX_DISPLAY_SCALE
    );

    // Résolution native du canvas : ni trop petite (jouabilité),
    // ni trop grande (performances).
    let canvasWidth = Math.round(this.WIDTH * displayScale);

    canvasWidth = Math.max(
      GameScreen.MIN_CANVAS_WIDTH,
      Math.min(canvasWidth, GameScreen.MAX_CANVAS_WIDTH)
    );

    const bufferScale = canvasWidth / this.WIDTH;

    this.canvas.width = canvasWidth;
    this.canvas.height = Math.round(this.HEIGHT * bufferScale);

    // L'espace occupé à l'écran suit exactement la résolution
    // choisie : le mapping pointeur → carte reste donc exact.
    this.canvas.style.width = `${canvasWidth}px`;
    this.canvas.style.height = `${this.canvas.height}px`;

    this.lastContainerWidth = availableWidth;
  }

  /**
   * Réagit aux changements de taille du conteneur de jeu.
   *
   * Quand l'écran change de dimensions, on recalcule la taille
   * du canvas puis on régénère la surface propre à la nouvelle
   * échelle. La progression étant exprimée en pourcentage des
   * quantités de salissure (et non en pixels), le nettoyage déjà
   * effectué est conservé lors d'un simple redimensionnement.
   */
  private setupResizeObserver(): void {

    const container = this.canvas.parentElement;

    if (!container || typeof ResizeObserver === 'undefined') return;

    // Un seul observeur pour toute la durée de vie du composant.
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.resizeObserver = new ResizeObserver(() => {

      const width = container.clientWidth;

      // Ignore les variations infinitésimales (ascenseurs…).
      if (Math.abs(width - this.lastContainerWidth) < 8) return;

      const previousWidth = this.canvas.width;

      this.sizeCanvasToDisplay();

      // Rien à faire si la résolution native n'a pas changé.
      if (this.canvas.width === previousWidth) return;

      this.rebuildCleanSurface();

      this.drawFrame();
    });

    this.resizeObserver.observe(container);
  }

  /**
   * Régénère l'image de la surface propre à l'échelle courante
   * du canvas (après un redimensionnement).
   */
  private rebuildCleanSurface(): void {

    if (!this.dirtEngine) return;

    const cleanCanvas = document.createElement('canvas');

    cleanCanvas.width = this.dirtEngine.bufferWidth;
    cleanCanvas.height = this.dirtEngine.bufferHeight;

    const cleanContext = cleanCanvas.getContext('2d')!;

    if (!cleanContext) return;

    this.cleanCtx = cleanContext;
    this.generateCleanSurface();

    this.cleanImage = cleanContext.getImageData(
      0,
      0,
      this.dirtEngine.bufferWidth,
      this.dirtEngine.bufferHeight
    );
  }

  /**
   * Attache les écouteurs de pointeur directement sur le canvas.
   *
   * Le pointermove (très fréquent) ne touche que le canvas :
   * il ne doit donc pas relancer le change detection d'Angular.
   */
  private setupCanvasInteraction(): void {

    const canvas = this.canvasRef.nativeElement;

    const onDown = (event: PointerEvent) => this.onPointerDown(event);
    const onMove = (event: PointerEvent) => this.onPointerMove(event);
    const onUp = () => this.onPointerUp();
    const onEnter = (event: PointerEvent) => this.onPointerEnter(event);
    const onLeave = () => this.onPointerLeave();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('pointerleave', onLeave);

    this.detachPointerListeners = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }

  /**
   * Retourne l'outil équipé avec ses améliorations.
   *
   * GamingState calcule les caractéristiques finales
   * à partir du catalogue et des niveaux achetés.
   */
  get activeTool(): CleaningTool | undefined {
    return this.gamingState.getEquippedTool();
  }

  /**
   * Liste des outils possédés par le joueur.
   */
  get ownedTools(): CleaningTool[] {
    return this.gamingState.tools.filter(tool =>
      this.gamingState.ownsTool(tool.id)
    );
  }

  // --------------------------------
  // Initialisation
  // --------------------------------

  private initializeGame(): void {

    this.canvas = this.canvasRef.nativeElement;

    // Définit la résolution du canvas en fonction de la taille
    // réellement disponible à l'écran.
    this.sizeCanvasToDisplay();

    // La carte suit désormais la taille de l'écran : on surveille
    // le conteneur pour re-calculer le canvas quand il change
    // (redimensionnement, rotation…).
    this.setupResizeObserver();

    this.ctx = this.canvas.getContext('2d')!;

    /**
     * Récupère uniquement les salissures autorisées
     * sur la carte actuellement sélectionnée.
     */
    const mapDirtTypes = this.dirtTypes.filter(
      dirt => this.activeMap().dirtDensity[dirt.id] !== undefined
    );

    /**
     * Crée le moteur avec les dimensions et les salissures
     * propres à cette carte.
     */
    this.dirtEngine = new DirtEngine(
      this.WIDTH,
      this.HEIGHT,
      mapDirtTypes
    );

    // Génère la surface propre qui servira de fond, à la même
    // échelle réduite que le tampon interne du moteur.
    const cleanCanvas = document.createElement('canvas');

    cleanCanvas.width = this.dirtEngine.bufferWidth;
    cleanCanvas.height = this.dirtEngine.bufferHeight;

    const cleanContext = cleanCanvas.getContext('2d')!;

    if (!cleanContext) return;

    // Génération de la texture de fond.
    this.cleanCtx = cleanContext;
    this.generateCleanSurface();

    // Conserve une copie de la surface propre.
    this.cleanImage = cleanContext.getImageData(
      0,
      0,
      this.dirtEngine.bufferWidth,
      this.dirtEngine.bufferHeight
    );

    /**
     * Génère les salissures selon la densité configurée
     * dans le catalogue de cartes.
     */
    this.dirtEngine.generate(
      this.activeMap().dirtDensity
    );

    // Réinitialise les gains de la partie.
    this.earnedMoney = 0;
    this.sessionEarnings.set(0);
    this.mapReward.set(0);
    this.progress.set(0);
    this.particles.length = 0;

    // Affichage initial, puis boucle de rendu continue :
    // le canvas n'est dessiné qu'ici, jamais dans les écouteurs.
    this.drawFrame();

    this.updateProgress();

    this.startRenderLoop();
  }

  // --------------------------------
  // Génération de la surface propre
  // --------------------------------

  /**
   * Dessine la surface propre selon le style de la carte.
   *
   * Chaque monde possède son ambiance : dalles de pierre pour
   * la maison, toile encadrée pour la peinture, asphalte pour
   * l'extérieur, chaussée presque noire pour la nuit.
   */
  private generateCleanSurface(): void {
    const ctx = this.cleanCtx;

    // La surface est dessinée à l'échelle du tampon du moteur.
    const width = this.dirtEngine.bufferWidth;
    const height = this.dirtEngine.bufferHeight;

    switch (this.activeMap().surfaceStyle) {

      case 'canvas':
        this.drawPaintingSurface(ctx, width, height);
        break;

      case 'road':
        this.drawRoadSurface(ctx, width, height);
        break;

      case 'night':
        this.drawNightSurface(ctx, width, height);
        break;

      case 'garden':
        this.drawGardenSurface(ctx, width, height);
        break;

      case 'concrete':
        this.drawConcreteSurface(ctx, width, height);
        break;

      default:
        this.drawTileSurface(ctx, width, height);
    }
  }

  /**
   * Terrain commun : petites variations de teinte en plus des
   * motifs propres à chaque surface.
   */
  private addSpeckle(
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
  }

  /**
   * Monde Maison — terrasse : dalles de pierre.
   */
  private drawTileSurface(
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

    this.addSpeckle(ctx, width, height, 'rgba(70, 70, 60, 0.08)');
  }

  /**
   * Monde Maison — jardin : terre et touffes d'herbe.
   */
  private drawGardenSurface(
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
  }

  /**
   * Monde Maison — sous-sol : béton brut avec joints.
   */
  private drawConcreteSurface(
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
  }

  /**
   * Monde Peinture — tableau : cadre boisé et toile peinte.
   */
  private drawPaintingSurface(
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
  }

  /**
   * Monde Extérieur — route / chemin : asphalte et marquages.
   */
  private drawRoadSurface(
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
    this.addSpeckle(
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
  }

  /**
   * Monde Nuit — chaussée plongée dans le noir.
   *
   * La surface elle-même est très sombre : seul le halo de
   * l'outil (voir DirtEngine.renderWithFlashlight) révèle ce
   * qui entoure le curseur.
   */
  private drawNightSurface(
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
  }

  // --------------------------------
  // Gestion du pointeur
  // --------------------------------

  onPointerDown(event: PointerEvent): void {
    this.isCleaning = true;
    this.lastCleanTime = 0;
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointerPosition(event);
    // Le nettoyage est appliqué immédiatement (réactivité au clic) ;
    // le dessin, lui, attend la prochaine image de la boucle.
    this.cleanAtPointer();
  }

  onPointerMove(event: PointerEvent): void {
    this.updatePointerPosition(event);

    // Seul l'état interne est mis à jour ici : aucun dessin ni
    // signal dans les écouteurs. La boucle d'animation (RAF)
    // nettoie et rend à chaque image, au plus une fois par frame.
    if (this.isCleaning) {
      this.applyDirtyDelta();
    }
  }

  onPointerUp(): void {
    this.isCleaning = false;
    this.lastCleanTime = 0;

    // Éclat doré au relâchement : petit rappel visuel des gains
    // accumulés pendant ce passage de pinceau.
    if (this.earnedMoney > 0) {
      this.spawnMoneySpark();
    }

    // Retour haptique léger sur les appareils qui le supportent.
    this.vibrate(10);

    this.updateProgress();
  }

  onPointerEnter(event: PointerEvent): void {
    this.pointerInside = true;
    this.updatePointerPosition(event);
  }

  onPointerLeave(): void {
    this.pointerInside = false;
  }

  private updatePointerPosition(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();

    // Les coordonnées sont exprimées dans l'espace du canvas
    // (échelle native), pas de la carte logique.
    this.pointerX =
      (event.clientX - rect.left) *
      (this.canvas.width / rect.width);

    this.pointerY =
      (event.clientY - rect.top) *
      (this.canvas.height / rect.height);
  }

  // --------------------------------
  // Nettoyage
  // --------------------------------

  /**
   * Applique le nettoyage accumulé depuis la dernière image.
   *
   * Appelé par la boucle d'animation (une fois par frame) et non
   * par les événements du pointeur : sur un écran haute fréquence,
   * plusieurs pointermove peuvent survenir entre deux images ; ils
   * ne coûtent ici qu'une seule opération de nettoyage, avec le
   * deltaTime réellement écoulé.
   */
  private applyDirtyDelta(): void {

    const tool = this.activeTool;

    if (!tool || !this.dirtEngine) return;

    const now = performance.now();

    // Temps écoulé depuis le dernier nettoyage appliqué.
    const deltaTime = this.lastCleanTime === 0
      ? 1 / 60
      : Math.min((now - this.lastCleanTime) / 1000, 0.05);

    this.lastCleanTime = now;

    // Le pointeur est à l'échelle du canvas ; on le reprojette
    // dans l'espace logique de la carte avant de le transmettre.
    const mapX = this.pointerX * (this.WIDTH / this.canvas.width);
    const mapY = this.pointerY * (this.HEIGHT / this.canvas.height);

    // Le moteur utilise directement les caractéristiques améliorées.
    const result = this.dirtEngine.cleanAt(
      mapX,
      mapY,
      tool,
      deltaTime
    );

    // Accumule les gains selon les salissures retirées.
    // L'économie est centralisée dans le moteur.
    if (result.removed > 0) {
      const gained =
        result.removed * this.dirtEngine.getRewardPerUnit();

      this.earnedMoney += gained;

      // Gouttelettes de salissure arrachée sous le pinceau.
      this.spawnDirtSpray(result.removed, tool.radius);

      // Remontée throttlée vers la vue (le calcul des gains a lieu
      // hors change detection : seul ce signal traverse la vue).
      const now = performance.now();

      if (now - this.lastEarningsPush >= 250) {
        this.lastEarningsPush = now;
        this.sessionEarnings.set(Math.floor(this.earnedMoney));
      }
    }
  }

  /**
   * Nettoie immédiatement sous le pointeur (pressé de clic).
   */
  private cleanAtPointer(): void {
    this.applyDirtyDelta();
  }

  // --------------------------------
  // Rendu
  // --------------------------------

  /**
   * Démarre la boucle d'animation.
   *
   * Un seul cycle requestAnimationFrame alimente tout le canvas :
   * nettoyage en cours, dessin et progression. Les écouteurs du
   * pointeur ne dessinent jamais eux-mêmes, ce qui garantit une
   * cadence régulière (~60 images/s) quelle que soit la fréquence
   * réelle des événements (jusqu'à 240 Hz sur certains écrans).
   */
  private startRenderLoop(): void {

    if (this.running) return;

    this.running = true;

    const loop = () => {

      if (!this.running) return;

      // Le jeu est en pause tant que le menu de victoire est
      // ouvert : rien ne se passe sous le voile.
      if (this.victoryMenuOpen()) {
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      // Nettoyage continu tant que le pointeur est pressé :
      // au plus une opération par image.
      if (this.isCleaning) {
        this.applyDirtyDelta();
      }

      // Les particules avancent à chaque image (mouvement,
      // gravité, disparition) puis sont dessinées dans drawFrame.
      this.updateParticles();

      this.drawFrame();

      // Progression throttlée : son calcul parcourt toute la
      // carte, ce qui serait trop coûteux à chaque image sur
      // les grandes surfaces.
      const now = performance.now();

      if (now - this.lastProgressUpdate >=
          GameScreen.PROGRESS_UPDATE_INTERVAL_MS) {

        this.updateProgress();

        this.lastProgressUpdate = now;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Arrête proprement la boucle d'animation.
   */
  private stopRenderLoop(): void {

    this.running = false;

    cancelAnimationFrame(this.rafId);
  }

  /**
   * Dessine la carte complète.
   *
   * Le moteur compose les salissures sur la surface propre.
   * Le composant ajoute ensuite le curseur.
   */
  private drawFrame(): void {

    if (!this.ctx || !this.dirtEngine || !this.cleanImage) {
      return;
    }

    // Affichage du curseur de nettoyage.
    const tool = this.activeTool;

    // Le moteur génère l'image finale de la carte, à la taille
    // exacte du canvas (et non celle de la carte logique) : sans
    // cela, l'aperçu affiché serait décalé par rapport aux zones
    // réellement nettoyées sous le curseur.
    //
    // Dans le monde « nuit », le rendu est ensuite masqué par un
    // halo lumineux centré sur le curseur : tout le reste de la
    // carte replonge dans le noir.
    if (this.isNightWorld) {

      // Halo animé : léger tremblement de lanterne pour un
      // rendu vivant plutôt qu'un masque statique.
      this.flickerPhase += 0.05;

      const flickerX = Math.sin(this.flickerPhase) * 2;
      const flickerY = Math.cos(this.flickerPhase * 0.7) * 1.5;

      const lightX = this.pointerInside
        ? this.renderCursorX + flickerX
        : this.canvas.width / 2;

      const lightY = this.pointerInside
        ? this.renderCursorY + flickerY
        : this.canvas.height / 2;

      this.dirtEngine.renderWithFlashlight(
        this.ctx,
        this.cleanImage,
        this.canvas.width,
        this.canvas.height,
        lightX,
        lightY,
        tool?.radius ?? 40,
        this.WIDTH
      );

    } else {

      this.dirtEngine.render(
        this.ctx,
        this.cleanImage,
        this.canvas.width,
        this.canvas.height
      );
    }

    // Curseur « outil » : anneau doux + emoji de l'outil qui suit
    // le pointeur avec une légère inertie (renderCursor interpolé).
    if (this.pointerInside && tool) {

      // Interpolation du curseur vers le pointeur réel : effet
      // vivant, et l'anneau garde la trace du mouvement.
      this.renderCursorX +=
        (this.pointerX - this.renderCursorX) * 0.35;

      this.renderCursorY +=
        (this.pointerY - this.renderCursorY) * 0.35;

      const radiusOnCanvas =
        tool.radius * (this.canvas.width / this.WIDTH);

      const ctx = this.ctx;

      // Anneau extérieur blanc semi-transparent.
      ctx.beginPath();
      ctx.arc(
        this.renderCursorX,
        this.renderCursorY,
        radiusOnCanvas,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Léger remplissage pour matérialiser la zone couverte.
      ctx.beginPath();
      ctx.arc(
        this.renderCursorX,
        this.renderCursorY,
        radiusOnCanvas,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();

      // Emoji de l'outil, incliné selon la direction du mouvement.
      const dx = this.pointerX - this.renderCursorX;
      const tilt = Math.max(
        -0.35,
        Math.min(0.35, dx * 0.01)
      );

      const emoji = TOOL_EMOJIS[tool.id] ?? '🧽';
      const fontSize = Math.max(
        16,
        Math.min(44, radiusOnCanvas * 0.9)
      );

      ctx.save();
      ctx.translate(
        this.renderCursorX,
        this.renderCursorY
      );
      ctx.rotate(tilt);
      ctx.font = `${fontSize}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Ombre portée pour rester lisible sur toute surface.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 6;

      ctx.fillText(emoji, 0, 0);
      ctx.restore();
    }

    // Les particules se dessinent par-dessus la scène.
    this.drawParticles();
  }

  // --------------------------------
  // Particules & retours sensoriels
  // --------------------------------

  /**
   * Limite haute du nombre de particules simultanées : au-delà,
   * on ignore les nouvelles émissions (la scène reste fluide même
   * avec un outil au très grand rayon).
   */
  private static readonly MAX_PARTICLES = 260;

  /**
   * Projette quelques gouttelettes colorées autour du pinceau :
   * la couleur est prélevée sur la salissure réellement retirée.
   */
  private spawnDirtSpray(removed: number, toolRadius: number): void {

    if (!this.dirtEngine) return;

    const count = Math.min(4, 1 + Math.floor(removed / 900));

    const mapX = this.pointerX * (this.WIDTH / this.canvas.width);
    const mapY = this.pointerY * (this.HEIGHT / this.canvas.height);

    const color = this.dirtEngine.sampleDirtColor(mapX, mapY);

    const canvasScale = this.canvas.width / this.WIDTH;

    for (let i = 0; i < count; i++) {

      if (this.particles.length >= GameScreen.MAX_PARTICLES) return;

      // Éjection en anneau, autour du bord du pinceau.
      const angle = Math.random() * Math.PI * 2;

      const speed =
        (30 + Math.random() * 70) * canvasScale;

      const distance =
        toolRadius * (0.55 + Math.random() * 0.45) * canvasScale;

      this.particles.push({
        x: this.renderCursorX + Math.cos(angle) * distance,
        y: this.renderCursorY + Math.sin(angle) * distance,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40 * canvasScale,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.3,
        size: (1.5 + Math.random() * 2.5) * canvasScale,
        color: color
          ? `rgba(${color.r}, ${color.g}, ${color.b}, 0.85)`
          : 'rgba(255, 255, 255, 0.5)',
        kind: 'spray',
      });
    }
  }

  /**
   * Éclats dorés au relâchement du pinceau : rappel visuel que
   * le frottement rapporte de l'argent.
   */
  private spawnMoneySpark(): void {

    const canvasScale = this.canvas.width / this.WIDTH;

    for (let i = 0; i < 6; i++) {

      if (this.particles.length >= GameScreen.MAX_PARTICLES) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = (20 + Math.random() * 40) * canvasScale;

      this.particles.push({
        x: this.renderCursorX,
        y: this.renderCursorY,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 30 * canvasScale,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.3,
        size: (2 + Math.random() * 2) * canvasScale,
        color: 'rgba(255, 205, 90, 0.95)',
        kind: 'spark',
      });
    }
  }

  /**
   * Pluie de confettis à la validation d'une carte.
   */
  private spawnConfetti(): void {

    const palette = [
      '#f2c14e',
      '#78a887',
      '#e88b5a',
      '#8fbcd4',
      '#c589d0',
    ];

    for (let i = 0; i < 90; i++) {

      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: -10 - Math.random() * this.canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 60,
        vy: 60 + Math.random() * 120,
        life: 0,
        maxLife: 1.6 + Math.random() * 1.2,
        size: 2 + Math.random() * 3,
        color: palette[Math.floor(Math.random() * palette.length)],
        kind: 'confetti',
      });
    }
  }

  /**
   * Fait avancer toutes les particules (gravité légère, vie).
   *
   * Appelé une fois par image depuis la boucle d'animation ;
   * aucun signal n'est touché ici.
   */
  private updateParticles(): void {

    let write = 0;

    for (let i = 0; i < this.particles.length; i++) {

      const particle = this.particles[i];

      particle.life += 1 / 60;

      if (particle.life >= particle.maxLife) continue;

      particle.x += particle.vx / 60;
      particle.y += particle.vy / 60;

      // Gravité et traînée selon le type.
      if (particle.kind === 'spray') {
        particle.vy += 260 / 60;
      } else if (particle.kind === 'spark') {
        particle.vy += 120 / 60;
      } else {
        // Confettis : chute lente et virevoltement.
        particle.vx += Math.sin(particle.life * 8 + particle.y) * 0.4;
      }

      this.particles[write++] = particle;
    }

    this.particles.length = write;
  }

  /**
   * Dessine les particules actives, fondues selon leur âge.
   */
  private drawParticles(): void {

    if (this.particles.length === 0) return;

    const ctx = this.ctx;

    ctx.save();

    for (const particle of this.particles) {

      const fade = 1 - particle.life / particle.maxLife;

      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      ctx.fillStyle = particle.color;

      if (particle.kind === 'confetti') {
        ctx.fillRect(
          particle.x,
          particle.y,
          particle.size,
          particle.size * 1.6
        );
      } else {
        ctx.beginPath();
        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Retour haptique sur les appareils qui le supportent
   * (mobiles). Aucun effet ailleurs — c'est un bonus.
   */
  private vibrate(pattern: number | number[]): void {

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Non critique : certains navigateurs bloquent la vibration.
      }
    }
  }

  // --------------------------------
  // Calcul de progression
  // --------------------------------

  /**
   * Récupère directement la progression calculée par le moteur.
   *
   * Appelé depuis la boucle d'animation (hors change detection) :
   * seul le signal `progress` est mis à jour, et uniquement si la
   * valeur affichée change — ainsi, en zoneless, le gabarit n'est
   * rafraîchi qu'autant que nécessaire, pas à chaque image.
   */
  private updateProgress(): void {

    if (!this.dirtEngine) return;

    const progress = this.dirtEngine.getProgress();

    // Le pourcentage affiché est arrondi à l'entier : on ignore
    // les micro-variations invisibles pour éviter des mises à jour
    // de signal (et donc de vue) inutiles.
    if (Math.round(progress) !== Math.round(this.progress())) {
      this.progress.set(progress);
    }

    // La carte est validée dès le seuil de propreté atteint
    // (COMPLETION_THRESHOLD côté moteur, fixé à 99,5 %). Comme
    // l'affichage est arrondi à l'entier, le joueur voit alors
    // « 99 % » juste avant la validation, puis « 100 % » une
    // fois la récompense obtenue : les infimes résidus restants
    // ne sont pas exigés pour valider la carte.
    if (this.dirtEngine.isComplete() && this.mapReward() === 0) {

      // Récompense plafonnée par la taille réelle de la carte :
      // environ 1 $ pour 100 000 unités de salissure retirées
      // (soit ~85 $ pour la terrasse, ~340 $ pour le sous-sol),
      // cohérent avec des améliorations à partir de 100 $.
      const proportionalReward =
        this.dirtEngine.getInitialAmount() /
        DirtEngine.DIRT_UNITS_PER_DOLLAR;

      const reward = Math.max(
        GameScreen.MINIMUM_MAP_REWARD,
        Math.round(proportionalReward)
      );

      this.mapReward.set(reward);
      this.gamingState.addMoney(reward);

      // Mémorise la carte comme terminée (badge ✓ dans la
      // sélection de cartes — la donnée est auto-sauvegardée).
      this.gamingState.markMapCompleted(this.activeMap().id);

      // Pluie de confettis dorés/verts sur toute la surface.
      this.spawnConfetti();

      // Secousse haptique de victoire sur mobile.
      this.vibrate([30, 40, 60]);

      // Le menu de victoire s'affiche par-dessus le jeu.
      this.victoryMenuOpen.set(true);
    }
  }

  // --------------------------------
  // Réinitialisation
  // --------------------------------

  /**
   * Génère une nouvelle carte avec des salissures fraîches.
   */
  resetGame(): void {

    // Régénère la carte avec ses propres paramètres.
    this.dirtEngine.generate(
      this.activeMap().dirtDensity
    );

    this.progress.set(0);
    this.earnedMoney = 0;
    this.sessionEarnings.set(0);
    this.mapReward.set(0);
    this.victoryMenuOpen.set(false);
    this.particles.length = 0;

    this.lastCleanTime = 0;
    this.lastProgressUpdate = performance.now();

    this.drawFrame();
  }

  // --------------------------------
  // Outils & navigation
  // --------------------------------

  /**
   * Sélectionne un outil parmi ceux possédés par le joueur.
   */
  selectTool(toolId: string): void {

    // GamingState vérifie que le joueur possède cet outil.
    const equipped = this.gamingState.equipTool(toolId);

    if (!equipped) return;

    // Réinitialise le chronomètre pour éviter
    // un deltaTime trop important lors du changement.
    this.lastCleanTime = 0;

    // Actualise le curseur avec le nouveau rayon.
    this.drawFrame();
  }

  /**
   * Charge une nouvelle carte à partir de son identifiant.
   *
   * L'ancien moteur est remplacé par un nouveau moteur
   * configuré avec les paramètres de la nouvelle carte.
   */
  selectMap(mapId: string): void {

    const selectedMap = this.maps.find(
      map => map.id === mapId
    );

    // Ignore les identifiants inconnus.
    if (!selectedMap) return;

    this.activeMap.set(selectedMap);

    // Arrête toute opération de nettoyage en cours et ferme
    // un éventuel menu de victoire de l'ancienne carte.
    this.isCleaning = false;
    this.lastCleanTime = 0;
    this.victoryMenuOpen.set(false);

    // Réinitialise le pointeur.
    this.pointerX = -100;
    this.pointerY = -100;
    this.pointerInside = false;

    // Reconstruit le moteur et les Canvas
    // avec les dimensions de la nouvelle carte.
    // initializeGame() remet aussi la progression à 0 % et
    // redémarre la boucle d'animation sur la nouvelle échelle.
    this.initializeGame();
  }

  /**
   * Referme le menu de victoire pour continuer à nettoyer les
   * infimes résidus restants (la récompense est déjà acquise).
   */
  closeVictoryMenu(): void {
    this.victoryMenuOpen.set(false);
  }

  /**
   * Recommence la carte depuis le menu de victoire.
   */
  restartFromVictory(): void {
    this.resetGame();
  }

  goShop(): void {
    this.gamingState.navigateTo('tool-shop');
  }

  goMaps(): void {
    this.gamingState.navigateTo('map-selection');
  }

  goMenu(): void {
    this.gamingState.navigateTo('main-menu');
  }
}
