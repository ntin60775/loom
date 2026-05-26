/**
 * Mock: @earendil-works/pi-tui
 */

export const Key = {
  alt: (char: string) => ({ key: `alt+${char}`, ctrl: false, meta: false, shift: false }),
};
