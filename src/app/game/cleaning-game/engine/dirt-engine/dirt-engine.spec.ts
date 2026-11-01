import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DirtEngine } from './dirt-engine';

describe('DirtEngine', () => {
  let component: DirtEngine;
  let fixture: ComponentFixture<DirtEngine>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DirtEngine],
    }).compileComponents();

    fixture = TestBed.createComponent(DirtEngine);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
