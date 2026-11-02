import { Component, inject, signal } from '@angular/core';
import { GamingState } from '../../../services/gaming-state';
import { SaveState } from '../../../services/save-state';

@Component({
  imports: [],
  selector: 'wash-main-menu',
  styleUrl: './main-menu.scss',
  templateUrl: './main-menu.html',
})
export class MainMenu {

  // Accès à l'état global du jeu.
  readonly gameState = inject(GamingState);

  // Accès à la sauvegarde (résumé, suppression).
  readonly saveState = inject(SaveState);

  // Confirmation à deux temps : le premier clic sur « Supprimer »
  // arme la confirmation, le second efface réellement la sauvegarde.
  readonly confirmDelete = signal(false);

  /**
   * Efface la sauvegarde et recharge l'état d'un nouveau joueur.
   */
  deleteSave(): void {

    this.gameState.resetProgress();

    this.confirmDelete.set(false);
  }

  /**
   * Désarme la confirmation si le joueur change d'avis.
   */
  cancelDelete(): void {
    this.confirmDelete.set(false);
  }
}
