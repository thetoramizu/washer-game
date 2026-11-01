import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { DIRT_TYPES } from '../../../models/dirt-types.data';
import { DirtEngine } from '../../engine/dirt-engine/dirt-engine';
import { GameMap } from '../../../models/game-map';
import { GAME_MAPS } from '../../../models/game-maps.data';
import { GamingState } from '../../../services/gaming-state';
import { CleaningTool } from '../../../models/cleaning-tool';

/**
 * Écran de jeu : canvas, nettoyage et barre d'outils.
 *
 * Hérite du logic de la partie déplacé hors du composant
 * principal lors du refacto navigation.
 */
@Component({
  imports: [],
  selector: 'wash-game-screen',
  styleUrl: './game-screen.scss',
  templateUrl: './game-screen.html',
})
export class GameScreen implements AfterViewInit {

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

  progress = 0;

  private lastProgressUpdate = 0;

  // Gains accumulés pendant la partie en cours.
  private earnedMoney = 0;

  // Récompense versée à la fin de la partie.
  readonly mapReward = signal(0);

  ngAfterViewInit(): void {

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

    this.canvas.width = this.WIDTH;
    this.canvas.height = this.HEIGHT;

    this.ctx = this.canvas.getContext('2d')!;

    // Génère la surface propre qui servira de fond.
    const cleanCanvas = document.createElement('canvas');

    cleanCanvas.width = this.WIDTH;
    cleanCanvas.height = this.HEIGHT;

    const cleanContext = cleanCanvas.getContext('2d')!;

    if (!cleanContext) return;

    // Génération de la texture de fond.
    this.cleanCtx = cleanContext;
    this.generateCleanSurface();

    // Conserve une copie de la surface propre.
    this.cleanImage = cleanContext.getImageData(
      0,
      0,
      this.WIDTH,
      this.HEIGHT
    );

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
    this.render();

    this.updateProgress();
  }

  // --------------------------------
  // Génération de la surface propre
  // --------------------------------

  private generateCleanSurface(): void {
    const ctx = this.cleanCtx;

    ctx.fillStyle = '#aaa99c';
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    // Dalles de pierre
    const tileSize = 50;

    for (let x = 0; x < this.WIDTH; x += tileSize) {
      for (let y = 0; y < this.HEIGHT; y += tileSize) {

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
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = 'rgba(70, 70, 60, 0.08)';

      ctx.fillRect(
        Math.random() * this.WIDTH,
        Math.random() * this.HEIGHT,
        2,
        2
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

    // Un seul rendu par événement de pointeur : le moteur réaffiche
    // son image déjà composée s'il n'y a rien à recomposer.
    this.render();
  }

  onPointerUp(): void {
    this.isCleaning = false;
    this.lastCleanTime = 0;
    this.updateProgress();
  }

  onPointerEnter(event: PointerEvent): void {
    this.pointerInside = true;
    this.updatePointerPosition(event);
    this.render();
  }

  onPointerLeave(): void {
    this.pointerInside = false;
    this.render();
  }

  private updatePointerPosition(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();

    this.pointerX =
      (event.clientX - rect.left) *
      (this.WIDTH / rect.width);

    this.pointerY =
      (event.clientY - rect.top) *
      (this.HEIGHT / rect.height);
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

    // Le moteur utilise directement les caractéristiques améliorées.
    const result = this.dirtEngine.cleanAt(
      this.pointerX,
      this.pointerY,
      tool,
      deltaTime
    );

    // Accumule les gains selon les salissures retirées,
    // rémunérées type par type.
    if (result.changed) {
      this.earnedMoney += this.computeReward(result.removedPerDepth);
    }

    // Actualisation périodique de la progression.
    if (now - this.lastProgressUpdate > 150) {

      this.updateProgress();

      this.lastProgressUpdate = now;
    }
  }

  /**
   * Convertit la quantité de salissure retirée en gain.
   *
   * Le moteur indique quelle quantité a été retirée pour chaque type
   * de salissure : chacun est rémunéré selon son propre multiplicateur,
   * à hauteur d'environ 1 $ par zone entièrement nettoyée. La valeur
   * reste volontairement modeste pour rester équilibrée avec les prix
   * de la boutique et le déblocage des cartes.
   */
  private computeReward(removedPerDirt: number[]): number {

    let reward = 0;

    for (let i = 0; i < this.dirtTypes.length; i++) {

      const removed = removedPerDirt[i] ?? 0;

      if (removed === 0) continue;

      reward +=
        removed *
        0.002 *
        this.dirtTypes[i].rewardMultiplier;
    }

    return reward;
  }

  // --------------------------------
  // Rendu
  // --------------------------------

  /**
   * Dessine la carte complète.
   *
   * Le moteur compose les salissures sur la surface propre.
   * Le composant ajoute ensuite le curseur.
   */
  private render(): void {

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

      this.ctx.beginPath();

      this.ctx.arc(
        this.pointerX,
        this.pointerY,
        tool.radius,
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

    this.progress = this.dirtEngine.getProgress();

    // Le seuil de propreté est atteint : on verse la récompense
    // une seule fois, sans attendre les derniers pixels restants.
    if (this.dirtEngine.isComplete() && this.mapReward() === 0) {

      const reward = Math.max(
        50,
        Math.round(this.earnedMoney)
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

    this.progress = 0;
    this.earnedMoney = 0;
    this.mapReward.set(0);

    this.lastCleanTime = 0;

    this.render();

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
    this.render();
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
