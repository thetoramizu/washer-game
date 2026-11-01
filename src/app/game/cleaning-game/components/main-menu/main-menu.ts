import { Component, inject } from '@angular/core';
import { GamingState } from '../../../services/gaming-state';

@Component({
  imports: [],
  selector: 'wash-main-menu',
  styleUrl: './main-menu.scss',
  templateUrl: './main-menu.html',
})
export class MainMenu {

    // Accès à l'état global du jeu.
  readonly gameState = inject(GamingState);

}
