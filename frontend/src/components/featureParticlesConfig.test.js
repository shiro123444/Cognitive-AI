import { describe, expect, it } from 'vitest';
import { particleStyleFor } from './featureParticlesConfig';

describe('particleStyleFor', () => {
  it('makes emphasized organic particles visibly larger and stronger', () => {
    const normal = particleStyleFor('organic');
    const emphasized = particleStyleFor('organic', true);

    expect(emphasized.size).toBeGreaterThan(normal.size);
    expect(emphasized.opacity).toBeGreaterThan(normal.opacity);
    expect(emphasized.deformation).toBeGreaterThan(normal.deformation);
  });
});
