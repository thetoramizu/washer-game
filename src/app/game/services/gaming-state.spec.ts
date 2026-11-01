import { TestBed } from '@angular/core/testing';
import { GamingState } from './gaming-state';

describe('GamingState', () => {
  let service: GamingState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GamingState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
