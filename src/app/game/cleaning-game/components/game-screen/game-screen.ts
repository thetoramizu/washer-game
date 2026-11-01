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

  // Socle de récompense versé même si les gains accumulés pendant
  // la partie restent modestes (cohérent avec des améliorations à
  // partir de 100 $).
  private static readonly MINIMUM_MAP_REWARD = 25;

  @ViewChild('gameCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly gamingState = inject(GamingState);

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
   * Le taux affiché est arrondi à l'entier : un joueur qui voit
   * « 100 % » peut encore avoir d'infimes résidus à retirer
   * avant d'atteindre le seuil de validation. On l'indique pour
   * éviter la frustration, sans forcer un nettoyage parfait.
   */
  get showFinishHint(): boolean {
    return this.mapReward() === 0 && this.progress() >= 99.5;
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

  // Récompense versée à la fin de la partie.
  readonly mapReward = signal(0);

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
    this.stopRenderLoop();
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

    // Résolution native du canvas plafonnée à la taille réelle :
    // les grandes cartes sont affichées plus petites à l'écran,
    // ce qui évite tout agrandissement flou et toute surcharge.
    const displayWidth = Math.min(this.WIDTH, GameScreen.MAX_CANVAS_WIDTH);

    const scale = displayWidth / this.WIDTH;

    // Les deux dimensions sont réduites avec le même facteur :
    // le ratio est conservé, sinon le repérage curseur/zones
    // serait décalé (étirement vertical ou horizontal).
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
      this.earnedMoney +=
        result.removed * this.dirtEngine.getRewardPerUnit();
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

      // Nettoyage continu tant que le pointeur est pressé :
      // au plus une opération par image.
      if (this.isCleaning) {
        this.applyDirtyDelta();
      }

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

    // Le moteur génère l'image finale de la carte, à la taille
    // exacte du canvas (et non celle de la carte logique) : sans
    // cela, l'aperçu affiché serait décalé par rapport aux zones
    // réellement nettoyées sous le curseur.
    this.dirtEngine.render(
      this.ctx,
      this.cleanImage,
      this.canvas.width,
      this.canvas.height
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

    // La carte est validée dès le seuil de propreté atteint. Ce
    // seuil (COMPLETION_THRESHOLD côté moteur) correspond exactement
    // au « 100 % » perçu par le joueur grâce à l'arrondi à
    // l'entier : la récompense tombe donc au moment précis où le
    // taux affiché passe à 100 %, sans exiger un nettoyage parfait.
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

    // Arrête toute opération de nettoyage en cours.
    this.isCleaning = false;
    this.lastCleanTime = 0;

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
