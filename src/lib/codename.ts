/**
 * A friendly, made-up name for an anonymous candidate ("Cedar 24"). Built from the role-scoped
 * reference, so the same person gets a different name on each role and can't be linked across them.
 */
// None of these appear in any person's or organisation's name in the demo data (checked), so a made-up name never hints at a real one.
const WORDS = ['Slate', 'Flint', 'Heron', 'Aspen', 'Sorrel', 'Briar', 'Ember', 'Harbor', 'Larch', 'Marram', 'Quill', 'Sage', 'Thistle', 'Yarrow', 'Basil', 'Clover', 'Dune', 'Opal', 'Kestrel', 'Plover', 'Teal', 'Umber', 'Indigo', 'Saffron', 'Cinder', 'Pebble', 'Fjord', 'Lumen', 'Onyx', 'Cobalt', 'Garnet', 'Jasper', 'Amber', 'Bramble', 'Cairn', 'Dahlia', 'Ebony', 'Falcon', 'Gale', 'Hollis', 'Iris', 'Juno', 'Kelp', 'Lotus', 'Mica', 'Nectar', 'Ochre', 'Pine', 'Quartz', 'Raven', 'Sable', 'Tansy', 'Vesper', 'Wisp', 'Zephyr', 'Arden', 'Cypress', 'Drift', 'Echo', 'Fable', 'Glade', 'Inlet', 'Lagoon', 'Lyric', 'Nova', 'Orbit', 'Prism', 'Ripple', 'Sierra', 'Tundra'];

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function codename(ref: string) {
  const h = hash(ref);
  return `${WORDS[h % WORDS.length]} ${String((Math.floor(h / WORDS.length) % 90) + 10)}`;
}

export const PALETTES = ['forest', 'clay', 'olive', 'sand'] as const;
export type Palette = (typeof PALETTES)[number];
export const paletteFor = (ref: string): Palette => PALETTES[hash(ref + ':art') % PALETTES.length];
export const variantFor = (ref: string) => hash(ref + ':shape') % 3;
