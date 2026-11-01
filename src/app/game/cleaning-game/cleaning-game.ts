
import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy
} from '@angular/core';

@Component({
  imports: [],
  selector: 'app-cleaning-game',
  styleUrl: './cleaning-game.scss',
  templateUrl: './cleaning-game.html',
})
export class CleaningGame implements AfterViewInit {

  @ViewChild('gameCanvas')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly WIDTH = 800;
  private readonly HEIGHT = 500;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  private cleanLayer!: HTMLCanvasElement;
  private dirtLayer!: HTMLCanvasElement;

  private cleanCtx!: CanvasRenderingContext2D;
  private dirtCtx!: CanvasRenderingContext2D;

  private isCleaning = false;
  private pointerX = -100;
  private pointerY = -100;
  private pointerInside = false;

  private brushSize = 38;

  private initialDirt = 0;
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

    // Création des couches indépendantes
    this.cleanLayer = document.createElement('canvas');
    this.dirtLayer = document.createElement('canvas');

    this.cleanLayer.width = this.WIDTH;
    this.cleanLayer.height = this.HEIGHT;

    this.dirtLayer.width = this.WIDTH;
    this.dirtLayer.height = this.HEIGHT;

    this.cleanCtx = this.cleanLayer.getContext('2d')!;

    this.dirtCtx = this.dirtLayer.getContext(
      '2d',
      { willReadFrequently: true }
    )!;

    this.generateCleanSurface();
    this.generateDirtySurface();

    this.initialDirt = this.calculateDirt();

    this.render();
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
  // Génération de la salissure
  // --------------------------------

  private generateDirtySurface(): void {
    const ctx = this.dirtCtx;

    ctx.globalCompositeOperation = 'source-over';

    // Couche générale de saleté
    ctx.fillStyle = '#514d32';
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    // Taches de mousse et de moisissure
    for (let i = 0; i < 250; i++) {

      const x = Math.random() * this.WIDTH;
      const y = Math.random() * this.HEIGHT;

      const radius = 5 + Math.random() * 35;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);

      ctx.fillStyle =
        Math.random() > 0.5
          ? 'rgba(45, 85, 35, 0.8)'
          : 'rgba(80, 65, 35, 0.7)';

      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // --------------------------------
  // Gestion du pointeur
  // --------------------------------

  onPointerDown(event: PointerEvent): void {
    this.isCleaning = true;

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

  private cleanAtPointer(): void {
    const ctx = this.dirtCtx;

    ctx.save();

    ctx.globalCompositeOperation = 'destination-out';

    // Pinceau doux
    const gradient = ctx.createRadialGradient(
      this.pointerX,
      this.pointerY,
      this.brushSize * 0.2,
      this.pointerX,
      this.pointerY,
      this.brushSize
    );

    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;

    ctx.beginPath();

    ctx.arc(
      this.pointerX,
      this.pointerY,
      this.brushSize,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
this.render();

const now = performance.now();

if (now - this.lastProgressUpdate > 150) {
  this.updateProgress();
  this.lastProgressUpdate = now;
}
  }

  // --------------------------------
  // Rendu
  // --------------------------------

  private render(): void {
    if (!this.ctx) return;

    this.ctx.clearRect(
      0,
      0,
      this.WIDTH,
      this.HEIGHT
    );

    // Surface propre
    this.ctx.drawImage(this.cleanLayer, 0, 0);

    // Couche sale
    this.ctx.drawImage(this.dirtLayer, 0, 0);

    // Indicateur du pinceau
    if (this.pointerInside) {

      this.ctx.beginPath();

      this.ctx.arc(
        this.pointerX,
        this.pointerY,
        this.brushSize,
        0,
        Math.PI * 2
      );

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

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

  private calculateDirt(): number {
    const image = this.dirtCtx.getImageData(
      0,
      0,
      this.WIDTH,
      this.HEIGHT
    );

    let total = 0;

    for (let i = 3; i < image.data.length; i += 4) {
      total += image.data[i];
    }

    return total;
  }

  private updateProgress(): void {
    if (!this.initialDirt) return;

    const remaining = this.calculateDirt();

    this.progress = Math.min(
      100,
      Math.max(
        0,
        (1 - remaining / this.initialDirt) * 100
      )
    );
  }

  // --------------------------------
  // Réinitialisation
  // --------------------------------

  resetGame(): void {
    this.generateDirtySurface();

    this.initialDirt = this.calculateDirt();
    this.progress = 0;

    this.render();
  }
}
