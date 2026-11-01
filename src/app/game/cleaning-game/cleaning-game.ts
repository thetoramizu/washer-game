
import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { DIRT_TYPES } from '../models/dirt-types.data';
import { CLEANING_TOOLS } from '../models/cleaning-tools.data';
import { DirtEngine } from './engine/dirt-engine/dirt-engine';

@Component({
  imports: [],
  selector: 'app-cleaning-game',
  styleUrl: './cleaning-game.scss',
  templateUrl: './cleaning-game.html',
})
export class CleaningGame implements AfterViewInit {

  @ViewChild('gameCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  dirtTypes = DIRT_TYPES;


  private readonly WIDTH = 800;
  private readonly HEIGHT = 500;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  // Moteur indépendant qui gère toutes les salissures.
  private dirtEngine!: DirtEngine;

  // Image de référence de la surface propre.
  // Elle ne sera générée qu'une seule fois.
  private cleanImage!: ImageData;

  // Catalogue des outils disponibles.
  readonly tools = CLEANING_TOOLS;

  // Outil actuellement utilisé.
  // Pour le moment, on utilise uniquement l'éponge.
  activeTool = CLEANING_TOOLS[0];

  // Temps du dernier nettoyage, pour calculer le deltaTime.
  private lastCleanTime = 0;

  // Contexte utilisé uniquement pour générer la surface propre.
  private cleanCtx!: CanvasRenderingContext2D;

  // private cleanLayer!: HTMLCanvasElement;
  // // Toutes les couches de salissures
  // private dirtLayers: Map<
  //   string,
  //   HTMLCanvasElement
  // > = new Map();

  // private cleanCtx!: CanvasRenderingContext2D;
  // private dirtContexts: Map<
  //   string,
  //   CanvasRenderingContext2D
  // > = new Map();

  private isCleaning = false;
  private pointerX = -100;
  private pointerY = -100;
  private pointerInside = false;

  // private brushSize = 38;

  // private initialDirt = 0;
  progress = 0;

  private lastProgressUpdate = 0;


  ngAfterViewInit(): void {
    this.initializeGame();
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

    // Création du moteur de salissures.
    this.dirtEngine = new DirtEngine(
      this.WIDTH,
      this.HEIGHT,
      this.dirtTypes
    );

    // Génération des différentes salissures.
    this.dirtEngine.generate();

    // Affichage initial.
    this.render();

    this.updateProgress();
  }
  // private initializeGame(): void {
  //   this.canvas = this.canvasRef.nativeElement;

  //   this.canvas.width = this.WIDTH;
  //   this.canvas.height = this.HEIGHT;

  //   this.ctx = this.canvas.getContext('2d')!;

  //   // Création de la surface propre
  //   this.cleanLayer = document.createElement('canvas');
  //   this.cleanLayer.width = this.WIDTH;
  //   this.cleanLayer.height = this.HEIGHT;

  //   this.cleanCtx = this.cleanLayer.getContext('2d')!;

  //   // Création des différentes couches sales
  //   for (const dirt of this.dirtTypes) {

  //     const layer = document.createElement('canvas');

  //     layer.width = this.WIDTH;
  //     layer.height = this.HEIGHT;

  //     const context = layer.getContext('2d')!;

  //     this.dirtLayers.set(dirt.id, layer);
  //     this.dirtContexts.set(dirt.id, context);
  //   }

  //   this.generateCleanSurface();
  //   this.generateDirtySurfaces();

  //   this.initialDirt = this.calculateDirt();

  //   this.render();
  // }

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

  // // --------------------------------
  // // Génération de la salissure
  // // --------------------------------

  // private generateDirtySurfaces(): void {

  //   for (const dirt of this.dirtTypes) {

  //     const ctx = this.dirtContexts.get(dirt.id);

  //     if (!ctx) continue;

  //     ctx.clearRect(
  //       0,
  //       0,
  //       this.WIDTH,
  //       this.HEIGHT
  //     );

  //     // Chaque salissure possède sa propre apparence
  //     for (let i = 0; i < 90; i++) {

  //       const x = Math.random() * this.WIDTH;
  //       const y = Math.random() * this.HEIGHT;

  //       const radius = 8 + Math.random() * 35;

  //       ctx.beginPath();

  //       ctx.arc(
  //         x,
  //         y,
  //         radius,
  //         0,
  //         Math.PI * 2
  //       );

  //       ctx.fillStyle = dirt.color;
  //       ctx.globalAlpha = 0.65 + Math.random() * 0.35;

  //       ctx.fill();
  //     }

  //     ctx.globalAlpha = 1;
  //   }
  // }


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
  private cleanAtPointer(): void {

    const now = performance.now();

    // Calcule le temps écoulé depuis le dernier nettoyage.
    // On limite le delta pour éviter les gros sauts.
    const deltaTime = this.lastCleanTime === 0
      ? 1 / 60
      : Math.min((now - this.lastCleanTime) / 1000, 0.05);

    this.lastCleanTime = now;

    // Le moteur s'occupe de toutes les règles de nettoyage.
    const result = this.dirtEngine.cleanAt(
      this.pointerX,
      this.pointerY,
      this.activeTool,
      deltaTime
    );

    // On actualise le rendu uniquement si quelque chose a changé.
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

  //   for (const dirt of this.dirtTypes) {

  //     const ctx = this.dirtContexts.get(dirt.id);

  //     if (!ctx) continue;

  //     ctx.save();

  //     ctx.globalCompositeOperation = 'destination-out';

  //     const gradient = ctx.createRadialGradient(
  //       this.pointerX,
  //       this.pointerY,
  //       this.brushSize * 0.2,
  //       this.pointerX,
  //       this.pointerY,
  //       this.brushSize
  //     );

  //     gradient.addColorStop(0, 'rgba(0,0,0,1)');
  //     gradient.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  //     gradient.addColorStop(1, 'rgba(0,0,0,0)');

  //     ctx.fillStyle = gradient;

  //     ctx.beginPath();

  //     ctx.arc(
  //       this.pointerX,
  //       this.pointerY,
  //       this.brushSize,
  //       0,
  //       Math.PI * 2
  //     );

  //     ctx.fill();

  //     ctx.restore();
  //   }

  //   this.render();

  //   const now = performance.now();

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
        this.activeTool.radius,
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

  // private render(): void {

  //   if (!this.ctx) return;

  //   this.ctx.clearRect(
  //     0,
  //     0,
  //     this.WIDTH,
  //     this.HEIGHT
  //   );

  //   // 1. Surface propre
  //   this.ctx.drawImage(this.cleanLayer, 0, 0);

  //   // 2. Toutes les couches de salissures
  //   for (const dirt of this.dirtTypes) {

  //     const layer = this.dirtLayers.get(dirt.id);

  //     if (layer) {
  //       this.ctx.drawImage(layer, 0, 0);
  //     }
  //   }

  //   // 3. Curseur de nettoyage
  //   if (this.pointerInside) {

  //     this.ctx.beginPath();

  //     this.ctx.arc(
  //       this.pointerX,
  //       this.pointerY,
  //       this.brushSize,
  //       0,
  //       Math.PI * 2
  //     );

  //     this.ctx.strokeStyle = '#ffffff';
  //     this.ctx.lineWidth = 2;
  //     this.ctx.stroke();

  //     this.ctx.beginPath();

  //     this.ctx.arc(
  //       this.pointerX,
  //       this.pointerY,
  //       3,
  //       0,
  //       Math.PI * 2
  //     );

  //     this.ctx.fillStyle = '#ffffff';
  //     this.ctx.fill();
  //   }
  // }

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

  // private calculateDirt(): number {

  //   let total = 0;

  //   for (const dirt of this.dirtTypes) {

  //     const ctx = this.dirtContexts.get(dirt.id);

  //     if (!ctx) continue;

  //     const image = ctx.getImageData(
  //       0,
  //       0,
  //       this.WIDTH,
  //       this.HEIGHT
  //     );

  //     for (let i = 3; i < image.data.length; i += 4) {
  //       total += image.data[i];
  //     }
  //   }

  //   return total;
  // }

  // private updateProgress(): void {
  //   if (!this.initialDirt) return;

  //   const remaining = this.calculateDirt();

  //   this.progress = Math.min(
  //     100,
  //     Math.max(
  //       0,
  //       (1 - remaining / this.initialDirt) * 100
  //     )
  //   );
  // }

  // --------------------------------
  // Réinitialisation
  // --------------------------------

  /**
 * Génère une nouvelle carte avec des salissures fraîches.
 */
  resetGame(): void {

    this.dirtEngine.generate();

    this.progress = 0;

    this.lastCleanTime = 0;

    this.render();

    this.updateProgress();
  }
  // resetGame(): void {

  //   this.generateDirtySurfaces();

  //   this.initialDirt = this.calculateDirt();

  //   this.progress = 0;

  //   this.render();
  // }
}
