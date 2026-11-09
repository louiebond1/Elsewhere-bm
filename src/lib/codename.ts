/**
 * A friendly, made-up name for an anonymous candidate ("Cedar 24"). Built from the role-scoped
 * reference, so the same person gets a different name on each role and can't be linked across them.
 */
const WORDS = ['Cedar', 'Slate', 'Reed', 'Birch', 'Flint', 'Maple', 'Heron', 'Juniper', 'Rowan', 'Alder', 'Willow', 'Hazel', 'Linden', 'Aspen', 'Sorrel', 'Fern', 'Moss', 'Briar', 'Cove', 'Ember', 'Harbor', 'Larch', 'Marram', 'Quill', 'Sage', 'Thistle', 'Wren', 'Yarrow', 'Basil', 'Clover', 'Dune', 'Elm'];

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function codename(ref: string) {
  const h = hash(ref);
  return `${WORDS[h % WORDS.length]} ${String((Math.floor(h / WORDS.length) % 90) + 10)}`;
}

export const PALETTES = ['forest', 'clay', 'olive', 'sand'] as const;
export type Palette = (typeof PALETTES)[number];
export const paletteFor = (ref: string): Palette => PALETTES[hash(ref + ':art') % PALETTES.length];
export const variantFor = (ref: string) => hash(ref + ':shape') % 3;
