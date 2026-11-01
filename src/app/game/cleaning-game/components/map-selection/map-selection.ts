import { Component, inject } from '@angular/core';
import { GameMap } from '../../../models/game-map';
import { GAME_MAPS } from '../../../models/game-maps.data';
import { GamingState } from '../../../services/gaming-state';

@Component({
  imports: [],
  selector: 'wash-map-selection',
  styleUrl: './map-selection.scss',
  templateUrl: './map-selection.html',
})
export class MapSelection {

  readonly Object = Object;
  readonly gamingState = inject(GamingState);

  // Catalogue des cartes.
  readonly maps = GAME_MAPS;

  /**
   * Retourne le nom lisible de la difficulté.
   */
  getDifficultyLabel(difficulty: GameMap['difficulty']): string {

    const labels = {
      easy: 'Débutant',
      medium: 'Intermédiaire',
      hard: 'Difficile'
    };

    return labels[difficulty];
  }

  /**
   * Sélectionne une carte et démarre la partie.
   */
  playMap(map: GameMap): void {

    if (!this.gamingState.isMapUnlocked(map.id)) {
      return;
    }

    this.gamingState.selectMap(map);
    this.gamingState.navigateTo('game');
  }

  /**
   * Tente de débloquer une carte.
   */
  unlockMap(map: GameMap): void {

    const unlocked = this.gamingState.unlockMap(map);

    if (unlocked) {
      this.playMap(map);
    }
  }

  /**
   * Retour au menu principal.
   */
  goBack(): void {
    this.gamingState.navigateTo('main-menu');
  }
}
