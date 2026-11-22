import type { ReactNode } from 'react';

export type GlobeDot = { id: string; category: string };
export type GlobeProps = {
  dots: GlobeDot[];
  selectedId: string | null;
  /** An area picked in "What's inside": its dots stay bright, the rest dim. */
  focusCategory: string | null;
  /** Records an answer actually used, in order: lit, pulsed and joined up. */
  litIds: string[];
  reducedMotion: boolean;
  onSelect: (id: string | null) => void;
  /** Shown next to the selected dot. */
  callout: ReactNode;
};
