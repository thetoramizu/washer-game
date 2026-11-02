import { Component, inject } from '@angular/core';
import { GamingState } from '../../../services/gaming-state';
import { AudioService } from '../../../services/audio-service';

@Component({
  imports: [],
  selector: 'wash-main-menu',
  styleUrl: './main-menu.scss',
  templateUrl: './main-menu.html',
})
export class MainMenu {

    // Accès à l'état global du jeu.
  readonly gameState = inject(GamingState);

  private readonly audio = inject(AudioService);

  /**
   * Bascule les sons : le clic est un geste utilisateur, on
   * peut donc débloquer l'AudioContext ici — si le joueur
   * active le son dans le menu, il entendra la confirmation.
   */
  toggleSound(): void {

    this.audio.unlock();

    this.gameState.toggleSound();

    if (this.gameState.soundEnabled()) {
      this.audio.playClick();
    }
  }

}
