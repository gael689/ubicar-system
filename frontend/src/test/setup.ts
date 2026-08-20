import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

/**
 * `matchMedia` no existe en jsdom y varios componentes lo consultan al montar.
 * Sin este stub, montar cualquier pantalla revienta antes de llegar al assert.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// jsdom no implementa el scroll programático, y el calendario lo usa para
// centrarse en el día de hoy al abrirse.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollTo = vi.fn();
