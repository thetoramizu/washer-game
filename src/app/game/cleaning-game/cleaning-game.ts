
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { DIRT_TYPES } from '../models/dirt-types.data';
import { DirtEngine } from './engine/dirt-engine/dirt-engine';
import { GameMap } from '../models/game-map';
import { GAME_MAPS } from '../models/game-maps.data';
import { GamingState } from '../services/gaming-state';
import { MainMenu } from './components/main-menu/main-menu';
import { MapSelection } from './components/map-selection/map-selection';
import { CleaningTool } from '../models/cleaning-tool';
import { GameScreen } from './components/game-screen/game-screen';
import { Shop } from './components/shop/shop';

@Component({
  imports: [MainMenu, MapSelection, Shop, GameScreen],
  selector: 'app-cleaning-game',
  styleUrl: './cleaning-game.scss',
  templateUrl: './cleaning-game.html',
})
export class CleaningGame implements AfterViewInit {

  @ViewChild('gameCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly gamingState = inject(GamingState);

  dirtTypes = DIRT_TYPES;

  // Catalogue des cartes disponibles.
  readonly maps = GAME_MAPS;

  // Carte actuellement sélectionnée.
  activeMap: GameMap = GAME_MAPS[0];

  // Dimensions de la carte actuellement chargée.
  private get WIDTH(): number {
    return this.activeMap.width;
  }

  private get HEIGHT(): number {
    return this.activeMap.height;
  }

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  // Moteur indépendant qui gère toutes les salissures.
  private dirtEngine!: DirtEngine;

  // Image de référence de la surface propre.
  // Elle ne sera générée qu'une seule fois.
  private cleanImage!: ImageData;

  // // Catalogue des outils disponibles.
  // readonly tools = CLEANING_TOOLS;

  // // Outil actuellement utilisé.
  // // Pour le moment, on utilise uniquement l'éponge.
  // activeTool = CLEANING_TOOLS[0];

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

  public gameState: GamingState = inject(GamingState);

  ngAfterViewInit(): void {

    // Le Canvas n'existe pas encore dans le DOM
    // lorsque le joueur est dans un autre écran.
    // L'initialisation sera effectuée au lancement d'une partie.

  }

  

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
      dirt => this.activeMap.dirtDensity[dirt.id] !== undefined
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
      this.activeMap.dirtDensity
    );

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
 * avec l'outil sélectionné.
 */

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

  // Actualise le rendu uniquement si quelque chose a changé.
  if (result.changed) {
    this.render();
  }

  // Actualisation périodique de la progression.
  if (now - this.lastProgressUpdate > 150) {

    this.updateProgress();

    this.lastProgressUpdate = now;
  }
}

  // private cleanAtPointer(): void {

  //   const now = performance.now();

  //   // Calcule le temps écoulé depuis le dernier nettoyage.
  //   // On limite le delta pour éviter les gros sauts.
  //   const deltaTime = this.lastCleanTime === 0
  //     ? 1 / 60
  //     : Math.min((now - this.lastCleanTime) / 1000, 0.05);

  //   this.lastCleanTime = now;

  //   // Le moteur s'occupe de toutes les règles de nettoyage.
  //   const result = this.dirtEngine.cleanAt(
  //     this.pointerX,
  //     this.pointerY,
  //     this.activeTool,
  //     deltaTime
  //   );

  //   // On actualise le rendu uniquement si quelque chose a changé.
  //   if (result.changed) {
  //     this.render();
  //   }

  //   // Actualisation périodique de la progression.
  //   if (now - this.lastProgressUpdate > 150) {

  //     this.updateProgress();

  //     this.lastProgressUpdate = now;
  //   }
  // }

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

    if (!this.ctx || !this.dirtEngine || !this.cleanImage) {
      return;
    }

    // Le moteur génère l'image finale de la carte.
    this.dirtEngine.render(
      this.ctx,
      this.cleanImage
    );

    // Affichage du curseur de nettoyage.
    if (this.pointerInside) {

      this.ctx.beginPath();

      this.ctx.arc(
        this.pointerX,
        this.pointerY,
        this.activeTool?.radius ?? 0,
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
      this.activeMap.dirtDensity
    );
    this.progress = 0;

    this.lastCleanTime = 0;

    this.render();

    this.updateProgress();
  }

  /**
 * Sélectionne un outil parmi ceux disponibles.
 */

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

  // selectTool(toolId: string): void {

  //   const tool = this.tools.find(
  //     item => item.id === toolId
  //   );

  //   // Ignore les identifiants inconnus.
  //   if (!tool) return;

  //   this.activeTool = tool;

  //   // Réinitialise le chronomètre pour éviter
  //   // un deltaTime trop important lors du changement.
  //   this.lastCleanTime = 0;

  //   // Actualise le curseur pour afficher le nouveau rayon.
  //   this.render();
  // }

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

    this.activeMap = selectedMap;

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

  /**
 * Retourne l'outil équipé avec ses améliorations.
 *
 * GamingState calcule les caractéristiques finales
 * à partir du catalogue et des niveaux achetés.
 */
get activeTool(): CleaningTool | undefined {
  return this.gamingState.getEquippedTool();
}

}
