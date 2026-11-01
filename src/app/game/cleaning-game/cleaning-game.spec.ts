import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CleaningGame } from './cleaning-game';

describe('CleaningGame', () => {
  let component: CleaningGame;
  let fixture: ComponentFixture<CleaningGame>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CleaningGame],
    }).compileComponents();

    fixture = TestBed.createComponent(CleaningGame);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
