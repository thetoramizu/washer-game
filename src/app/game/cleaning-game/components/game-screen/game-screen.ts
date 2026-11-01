import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
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
  private static readonly MAX_CANVAS_WIDTH = 900;

  @ViewChild('gameCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly gamingState = inject(GamingState);

  private readonly ngZone = inject(NgZone);

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

  progress = 0;

  /**
   * Le taux affiché est arrondi à l'entier : un joueur qui voit
   * « 100 % » peut encore avoir d'infimes résidus à retirer
   * avant d'atteindre le seuil de validation. On l'indique pour
   * éviter la frustration, sans forcer un nettoyage parfait.
   */
  get showFinishHint(): boolean {
    return this.mapReward() === 0 && this.progress >= 99.5;
  }

  private lastProgressUpdate = 0;

  // Boucle d'animation : rend la scène à chaque image au lieu
  // de tout recalculer à chaque événement du pointeur.
  private rafId = 0;
  private renderScheduled = false;
  private frameClock = 0;

  // L'écoute du pointeur se fait directement sur le canvas,
  // hors zone Angular : le rendu (canvas + requestAnimationFrame)
  // n'a pas besoin du change detection à chaque mouvement.
  private detachPointerListeners?: () => void;

  // Gains accumulés pendant la partie en cours.
  private earnedMoney = 0;

  // Récompense versée à la fin de la partie.
  readonly mapReward = signal(0);

  ngAfterViewInit(): void {

    // Toute l'interaction avec le canvas est gérée hors zone
    // Angular : les mouvements du pointeur et le rendu ne
    // déclenchent plus de change detection à chaque image.
    this.ngZone.runOutsideAngular(() => this.setupCanvasInteraction());

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
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Attache les écouteurs de pointeur directement sur le canvas.
   *
   * À appeler dans un contexte hors zone : cela évite qu'un
   * pointermove (très fréquent) ne relance tout le change
   * detection d'Angular alors que seul le canvas change.
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

    // Résolution native du canvas plafonnée à la taille réelle :
    // les grandes cartes sont affichées plus petites à l'écran,
    // ce qui évite tout agrandissement flou et toute surcharge.
    const displayWidth = Math.min(this.WIDTH, GameScreen.MAX_CANVAS_WIDTH);

    const scale = displayWidth / this.WIDTH;

    this.canvas.width = Math.round(this.WIDTH * scale);
    this.canvas.height = Math.round(this.HEIGHT * scale);

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

    // Affichage initial.
    this.drawFrame();

    this.updateProgress();
  }

  // --------------------------------
  // Génération de la surface propre
  // --------------------------------

  private generateCleanSurface(): void {
    const ctx = this.cleanCtx;

    // La surface est dessinée à l'échelle du tampon du moteur.
    const width = this.dirtEngine.bufferWidth;
    const height = this.dirtEngine.bufferHeight;

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

    // Légères variations de texture
    for (let i = 0; i < 450; i++) {
      ctx.fillStyle = 'rgba(70, 70, 60, 0.08)';

      ctx.fillRect(
        Math.random() * width,
        Math.random() * height,
        1,
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
    this.cleanAtPointer();
  }

  onPointerMove(event: PointerEvent): void {
    this.updatePointerPosition(event);

    if (this.isCleaning) {
      this.cleanAtPointer();
    }

    // Le rendu est regroupé dans la boucle d'animation :
    // plusieurs mouvements entre deux images ne coûtent
    // qu'un seul dessin complet.
    this.scheduleRender();
  }

  onPointerUp(): void {
    this.isCleaning = false;
    this.lastCleanTime = 0;
    this.updateProgress();
  }

  onPointerEnter(event: PointerEvent): void {
    this.pointerInside = true;
    this.updatePointerPosition(event);
    this.scheduleRender();
  }

  onPointerLeave(): void {
    this.pointerInside = false;
    this.scheduleRender();
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
   * Demande au moteur de nettoyer la position actuelle
   * avec l'outil équipé et ses améliorations.
   */
  private cleanAtPointer(): void {

    // Récupère les caractéristiques actualisées de l'outil.
    const tool = this.activeTool;

    if (!tool || !this.dirtEngine) return;

    const now = performance.now();

    // Calcule le temps écoulé depuis le dernier nettoyage.
    // On limite le delta pour éviter les gros sauts.
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
    }

    // Actualisation périodique de la progression.
    if (now - this.lastProgressUpdate > 150) {

      this.updateProgress();

      this.lastProgressUpdate = now;
    }
  }

  // --------------------------------
  // Rendu
  // --------------------------------

  /**
   * Planifie un dessin pour la prochaine image.
   *
   * Regrouper les rendus dans requestAnimationFrame évite de
   * recalculer toute la scène à chaque événement du pointeur
   * (qui peut se déclencher bien plus souvent que 60 fois/s).
   */
  private scheduleRender(): void {

    if (this.renderScheduled) return;

    this.renderScheduled = true;

    this.rafId = requestAnimationFrame((time) => {

      this.renderScheduled = false;
      this.frameClock = time;

      this.drawFrame();
    });
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

    // Le moteur génère l'image finale de la carte.
    this.dirtEngine.render(
      this.ctx,
      this.cleanImage
    );

    // Affichage du curseur de nettoyage.
    const tool = this.activeTool;

    if (this.pointerInside && tool) {

      // Le rayon de l'outil est exprimé en unités carte :
      // on le convertit à l'échelle du canvas.
      const radiusOnCanvas =
        tool.radius * (this.canvas.width / this.WIDTH);

      this.ctx.beginPath();

      this.ctx.arc(
        this.pointerX,
        this.pointerY,
        radiusOnCanvas,
        0,
        Math.PI * 2
      );

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Petit point central.
      this.ctx.beginPath();

      this.ctx.arc(
        this.pointerX,
        this.pointerY,
        3,
        0,
        Math.PI * 2
      );

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
    }
  }

  // --------------------------------
  // Calcul de progression
  // --------------------------------

  /**
   * Récupère directement la progression calculée par le moteur.
   */
  private updateProgress(): void {

    if (!this.dirtEngine) return;

    const progress = this.dirtEngine.getProgress();
    const completed = this.dirtEngine.isComplete();

    // La progression est pilotée par un signal : les mises à jour
    // déclenchées hors zone Angular (boucle de rendu) seront bien
    // propagées au gabarit.
    this.ngZone.run(() => {

      this.progress.set(progress);

      // La carte est validée dès le seuil de propreté atteint,
      // ce qui correspond au « 100 % » vu par le joueur.
      // La récompense n'est versée qu'une seule fois.
      if (completed && this.mapReward() === 0) {

        const reward = Math.max(
          25,
          Math.round(this.earnedMoney)
        );

        this.mapReward.set(reward);
        this.gamingState.addMoney(reward);
      }
    });
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

    this.progress = 0;
    this.earnedMoney = 0;
    this.mapReward.set(0);

    this.lastCleanTime = 0;

    this.drawFrame();

    this.updateProgress();
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

    // Arrête toute opération de nettoyage en cours.
    this.isCleaning = false;
    this.lastCleanTime = 0;

    // Réinitialise le pointeur.
    this.pointerX = -100;
    this.pointerY = -100;
    this.pointerInside = false;

    // Reconstruit le moteur et les Canvas
    // avec les dimensions de la nouvelle carte.
    this.initializeGame();

    // La nouvelle carte commence à 0 %.
    this.progress = 0;
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
