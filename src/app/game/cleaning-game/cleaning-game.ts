import { Component, inject } from '@angular/core';
import { GamingState } from '../services/gaming-state';
import { MainMenu } from './components/main-menu/main-menu';
import { MapSelection } from './components/map-selection/map-selection';
import { GameScreen } from './components/game-screen/game-screen';
import { Shop } from './components/shop/shop';

/**
 * Conteneur principal : il ne fait qu'afficher l'écran
 * demandé par l'état de navigation.
 *
 * Tout le logic de jeu a été déplacé vers les sous-composants :
 * MainMenu, MapSelection, Shop et GameScreen.
 */
@Component({
  imports: [MainMenu, MapSelection, Shop, GameScreen],
  selector: 'app-cleaning-game',
  styleUrl: './cleaning-game.scss',
  templateUrl: './cleaning-game.html',
})
export class CleaningGame {

  readonly gamingState = inject(GamingState);

}
