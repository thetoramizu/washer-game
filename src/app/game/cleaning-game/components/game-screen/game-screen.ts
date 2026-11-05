import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { DIRT_TYPES } from '../../../models/dirt-types.data';
import { DirtEngine } from '../../engine/dirt-engine/dirt-engine';
import { GameMap } from '../../../models/game-map';
import { GAME_MAPS } from '../../../models/game-maps.data';
import { GamingState } from '../../../services/gaming-state';
import { AudioService } from '../../../services/audio-service';
import { CleaningTool } from '../../../models/cleaning-tool';
import { DecimalPipe } from '@angular/common';
import { paintCleanSurface } from './surface-painter';
import { drawCursorRing } from './cursor-renderer';
import {
  computeShakeOffset,
  drawDroplets,
  Droplet,
  scatterRecentDroplets,
  ScreenShake,
  spawnDroplets,
  createShake,
  updateDroplets,
} from './droplets';

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

  // Sons synthétisés (frottement, splash, carillon de victoire).
  private readonly audio = inject(AudioService);

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

  // Gains accumulés pendant la partie en cours.
  private earnedMoney = 0;

  // Chronomètre de la partie en cours : horodatage du (re)démarrage
  // et temps écoulé cumulé hors pause (pour les meilleurs temps).
  private runStartedAt = performance.now();
  private pausedAccumMs = 0;
  private pauseStartedAt: number | null = null;

  // Temps affiché dans l'en-tête, rafraîchi au plus 2 fois/seconde.
  readonly elapsedSeconds = signal(0);
  private lastTimerUpdate = 0;

  /**
   * Temps écoulé depuis le début de la partie, pauses déduites,
   * en secondes.
   */
  private currentRunSeconds(): number {

    const now = performance.now();

    const runningMs =
      now - this.runStartedAt - this.pausedAccumMs -
      (this.pauseStartedAt !== null ? now - this.pauseStartedAt : 0);

    return Math.max(0, runningMs / 1000);
  }

  /**
   * À appeler quand le jeu passe en pause (menu pause ou victoire)
   * pour que le chronomètre ne tourne plus.
   */
  private timerPauseStart(): void {

    if (this.pauseStartedAt === null) {
      this.pauseStartedAt = performance.now();
    }
  }

  private timerPauseEnd(): void {

    if (this.pauseStartedAt !== null) {
      this.pausedAccumMs += performance.now() - this.pauseStartedAt;
      this.pauseStartedAt = null;
    }
  }

  /**
   * Remet le chronomètre à zéro (nouvelle carte, recommencer).
   */
  private resetTimer(): void {

    this.runStartedAt = performance.now();
    this.pausedAccumMs = 0;
    this.pauseStartedAt = null;

    this.elapsedSeconds.set(0);
    this.lastTimerUpdate = 0;
  }

  /**
   * Formate un temps en mm:ss pour l'affichage.
   */
  formatTime(seconds: number): string {

    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;

    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  }

  // Récompense versée à la fin de la partie.
  readonly mapReward = signal(0);

  // Menu de victoire affiché par-dessus le jeu dès que la
  // récompense est obtenue (recommencer / changer de carte /
  // boutique / menu principal). Le joueur peut le refermer pour
  // continuer à frotter les derniers résidus.
  readonly victoryMenuOpen = signal(false);

  // --------------------------------
  // Pause & raccourcis clavier
  // --------------------------------

  /**
   * Le jeu est en pause soit explicitement (Échap / P / bouton),
   * soit implicitement quand le menu de victoire est ouvert.
   */
  readonly paused = signal(false);

  get isPaused(): boolean {
    return this.paused() || this.victoryMenuOpen();
  }

  togglePause(): void {

    // Inutile de mettre en pause une carte déjà terminée :
    // le menu de victoire joue déjà ce rôle.
    if (this.victoryMenuOpen()) return;

    this.paused.update(value => !value);

    // Relâche le nettoyage si une secousse était pressée.
    if (this.paused()) {
      this.isCleaning = false;
      this.lastCleanTime = 0;
    }
  }

  closePause(): void {
    this.paused.set(false);
  }

  /**
   * Raccourcis clavier globaux de l'écran de jeu.
   *
   * Écoutés hors Angular (listener natif posé dans
   * ngAfterViewInit) : ils ne déclenchent aucun change detection
   * inutile. Voir setupKeyboardShortcuts().
   */
  private handleKey(event: KeyboardEvent): void {

    // Ne capture pas les touches saisies dans un champ.
    const target = event.target as HTMLElement | null;

    if (target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)) {
      return;
    }

    switch (event.key) {

      case 'Escape':
      case 'p':
      case 'P':
        // Échap ferme d'abord le menu de victoire ou la pause.
        if (this.victoryMenuOpen()) {
          this.closeVictoryMenu();
        } else {
          this.togglePause();
        }
        break;

      case 'r':
      case 'R':
        if (!this.victoryMenuOpen()) this.resetGame();
        break;

      case 'm':
      case 'M':
        this.gamingState.toggleSound();
        break;

      default: {
        // 1…6 : sélection rapide du nième outil possédé.
        const index = Number(event.key) - 1;

        if (Number.isInteger(index) && index >= 0) {
          const tool = this.ownedTools[index];

          if (tool) this.selectTool(tool.id);
        }
      }
    }
  }

  /**
   * Attache les écouteurs clavier sur le document (et libère
   * tout à la destruction du composant).
   */
  private setupKeyboardShortcuts(): void {

    const onKeyDown = (event: KeyboardEvent) => this.handleKey(event);

    document.addEventListener('keydown', onKeyDown);

    this.detachKeyboardListener = () =>
      document.removeEventListener('keydown', onKeyDown);
  }

  private detachKeyboardListener?: () => void;

  // --------------------------------
  // Particules & secousses d'écran
  // --------------------------------
  // La simulation et le dessin sont délégués au module pur
  // `droplets.ts` ; le composant ne conserve que l'état courant
  // et la garde d'accessibilité « réduction de mouvement ».

  // Gouttelettes actives, mises à jour et dessinées par la
  // boucle de rendu (jamais par les événements du pointeur).
  private droplets: Droplet[] = [];

  // Nombre maximal de particules simultanées : au-delà, les
  // plus anciennes sont remplacées (coût de dessin borné).
  private static readonly MAX_DROPLETS = 90;

  // Secousse en cours (null = écran stable).
  private shake: ScreenShake | null = null;

  // Respecte le réglage d'accessibilité du système : en
  // « réduction de mouvement », pas de particules ni de
  // tremblement d'écran.
  private readonly reduceMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /**
   * Déclenche une secousse d'écran brève (inerte si l'utilisateur
   * demande une réduction des animations).
   *
   * @param intensity Amplitude maximale en pixels canvas.
   * @param duration Durée en millisecondes.
   */
  private triggerShake(intensity: number, duration: number): void {

    if (this.reduceMotion) return;

    this.shake = createShake(intensity, duration);
  }

  /**
   * Émet quelques gouttelettes autour du curseur (inerte si
   * l'utilisateur demande une réduction des animations).
   */
  private emitDroplets(count: number, color: string): void {

    if (this.reduceMotion) return;

    spawnDroplets(
      this.droplets,
      count,
      color,
      this.pointerX,
      this.pointerY,
      GameScreen.MAX_DROPLETS,
    );
  }

  ngAfterViewInit(): void {

    // Les écouteurs sont posés directement sur le canvas : en
    // zoneless, ni les mouvements du pointeur ni le rendu ne
    // déclenchent de change detection.
    this.setupCanvasInteraction();

    // Raccourcis clavier (Échap/P, R, M, 1…6), eux aussi hors
    // Angular : une touche pressée ne relance pas la vue.
    this.setupKeyboardShortcuts();

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
    this.detachKeyboardListener?.();
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
    this.mapReward.set(0);
    this.progress.set(0);

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
   * Les motifs concrets (dalles, asphalte, toile…) vivent dans
   * `surface-painter.ts` ; ici on prépare simplement le contexte
   * à l'échelle du tampon moteur et on délègue le dessin.
   */
  private generateCleanSurface(): void {

    // La surface est dessinée à l'échelle du tampon du moteur.
    paintCleanSurface(
      this.cleanCtx,
      this.activeMap().surfaceStyle,
      this.dirtEngine.bufferWidth,
      this.dirtEngine.bufferHeight,
    );
  }

  // --------------------------------
  // Gestion du pointeur
  // --------------------------------

  onPointerDown(event: PointerEvent): void {

    // Le premier clic débloque l'AudioContext (exigence des
    // navigateurs) et réveille les onglets en arrière-plan.
    this.audio.unlock();

    if (this.isPaused) return;

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
    if (this.isCleaning && !this.isPaused) {
      this.cleanAtPointer();
    }
  }

  onPointerUp(): void {
    this.isCleaning = false;
    this.lastCleanTime = 0;
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
  private cleanAtPointer(): void {

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

      this.earnedMoney +=
        result.removed * this.dirtEngine.getRewardPerUnit();

      // Retour sensoriel proportionnel à l'efficacité du passage :
      // frottement audible + gerbe de gouttelettes sous l'outil.
      const canvasScale = this.canvas.width / this.WIDTH;

      this.emitDroplets(
        Math.min(3, 1 + Math.round(result.removed / 40)),
        'rgba(210, 235, 250, 0.9)'
      );

      // Les gouttelettes naissent au bord du cercle de l'outil,
      // pas exactement sous le pointeur : projection radiale.
      scatterRecentDroplets(
        this.droplets,
        this.pointerX,
        this.pointerY,
        tool.radius * canvasScale * 0.7,
        3,
      );

      this.audio.playScrub(Math.min(1, result.removed / 60));
      this.audio.playSplash();
    }
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

    let lastFrameTime = performance.now();

    const loop = () => {

      if (!this.running) return;

      // Temps écoulé depuis l'image précédente, pour la physique
      // des particules (indépendante de la fréquence d'affichage).
      const now = performance.now();

      const frameDelta = Math.min((now - lastFrameTime) / 1000, 0.05);

      lastFrameTime = now;

      // Les gouttelettes continuent de tomber même pendant une
      // pause ou sous le menu de victoire : elles s'évanouissent
      // doucement au lieu de rester figées sous le voile.
      if (this.droplets.length > 0) {
        updateDroplets(this.droplets, frameDelta);
      }

      // Le jeu est en pause tant que le menu de victoire est
      // ouvert : rien ne se passe sous le voile.
      if (this.victoryMenuOpen()) {
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      // En pause explicite : on continue de rendre (les
      // particules résiduelles), mais plus aucun nettoyage.
      if (this.paused()) {
        this.drawFrame();
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      // Nettoyage continu tant que le pointeur est pressé :
      // au plus une opération par image.
      if (this.isCleaning) {
        this.cleanAtPointer();
      }

      this.drawFrame();

      // Progression throttlée : son calcul parcourt toute la
      // carte, ce qui serait trop coûteux à chaque image sur
      // les grandes surfaces.
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

    const ctx = this.ctx;

    // ---------------------------------
    // Secousse d'écran : toute la scène
    // est translatée de quelques pixels.
    // ---------------------------------
    const shakeOffset = computeShakeOffset(this.shake);

    // La secousse s'auto-purge lorsqu'elle est terminée.
    this.shake = shakeOffset.shake;

    ctx.save();

    if (shakeOffset.x !== 0 || shakeOffset.y !== 0) {
      ctx.translate(shakeOffset.x, shakeOffset.y);
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

      this.dirtEngine.renderWithFlashlight(
        this.ctx,
        this.cleanImage,
        this.canvas.width,
        this.canvas.height,
        this.pointerInside && tool
          ? this.pointerX
          : this.canvas.width / 2,
        this.pointerInside && tool
          ? this.pointerY
          : this.canvas.height / 2,
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

    // ---------------------------------
    // Gouttelettes : par-dessus la carte,
    // sous l'anneau du curseur.
    // ---------------------------------
    if (this.droplets.length > 0) {
      drawDroplets(ctx, this.droplets);
    }

    // ---------------------------------
    // Curseur personnalisé : le pointeur
    // système est masqué (cursor: none),
    // l'anneau montre le rayon réel de
    // l'outil, coloré selon sa vitesse.
    // ---------------------------------
    if (this.pointerInside && tool && !this.paused()) {

      drawCursorRing(
        ctx,
        tool,
        this.pointerX,
        this.pointerY,
        this.canvas.width / this.WIDTH,
        this.isCleaning,
      );
    }

    ctx.restore();
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

      // Récompense calculée par le moteur en fonction de la
      // taille réelle de la carte (voir DirtEngine.computeMapReward).
      const reward = this.dirtEngine.computeMapReward();

      this.mapReward.set(reward);
      this.gamingState.addMoney(reward);

      // Célébration : carillon synthétisé + secousse d'écran.
      this.audio.unlock();
      this.audio.playVictoryDing();
      this.triggerShake(9, 450);

      // Gerbe de gouttelettes sur toute la largeur du canvas.
      const savedX = this.pointerX;
      const savedY = this.pointerY;

      for (let i = 0; i < 24; i++) {
        this.pointerX = Math.random() * this.canvas.width;
        this.pointerY = Math.random() * this.canvas.height;
        this.emitDroplets(2, 'rgba(244, 201, 93, 0.9)');
      }

      this.pointerX = savedX;
      this.pointerY = savedY;

      // Le jeu est en pause tant que le menu de victoire est
      // ouvert : rien ne se passe sous le voile.
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
    this.mapReward.set(0);
    this.victoryMenuOpen.set(false);
    this.paused.set(false);

    // Nettoie les effets visuels résiduels de l'ancienne partie.
    this.droplets.length = 0;
    this.shake = null;

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

    // Petit retour sonore + visuel du nouveau rayon.
    this.audio.unlock();
    this.audio.playClick();

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
    this.paused.set(false);

    // Effets visuels résiduels de l'ancienne carte.
    this.droplets.length = 0;
    this.shake = null;

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

  /**
   * Bascule le son depuis l'en-tête du jeu : débloque
   * l'AudioContext (geste utilisateur) puis inverse le réglage
   * sauvegardé, et rejoue un « tick » pour confirmer l'activation.
   */
  toggleSound(): void {

    this.audio.unlock();

    this.gamingState.toggleSound();

    if (this.gamingState.soundEnabled()) {
      this.audio.playClick();
    }
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
