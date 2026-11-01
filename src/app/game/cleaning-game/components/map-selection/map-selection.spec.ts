import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapSelection } from './map-selection';

describe('MapSelection', () => {
  let component: MapSelection;
  let fixture: ComponentFixture<MapSelection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapSelection],
    }).compileComponents();

    fixture = TestBed.createComponent(MapSelection);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
