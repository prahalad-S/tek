import { additionalThemes, additionalDarkThemes } from "./additionalThemes";
import { Sun, Moon, Zap, Smile, Minus, PartyPopper, Layers, Circle, Shapes, Square, Blocks, Watch, LayoutGrid, PanelsTopLeft, Grid2X2, Disc3, Cpu, Newspaper } from "lucide-react";

export const themeOptions = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "retro", label: "Retro", Icon: Zap },
  { value: "kids", label: "Kids", Icon: Smile },
  { value: "minimalism", label: "Minimalism", Icon: Minus },
  { value: "maximalism", label: "Maximalism", Icon: PartyPopper },
  { value: "glassmorphism", label: "Glassmorphism", Icon: Layers },
  { value: "neumorphism", label: "Neumorphism", Icon: Circle },
  { value: "claymorphism", label: "Claymorphism", Icon: Shapes },
  { value: "brutalism", label: "Brutalism", Icon: Square },
  { value: "neo-brutalism", label: "Neo-Brutalism", Icon: Blocks },
  { value: "skeuomorphism", label: "Skeuomorphism", Icon: Watch },
  { value: "flat", label: "Flat Design", Icon: LayoutGrid },
  { value: "material", label: "Material Design", Icon: PanelsTopLeft },
  { value: "bento", label: "Bento UI", Icon: Grid2X2 },
  { value: "y2k", label: "Y2K Design", Icon: Disc3 },
  { value: "cyberpunk", label: "Cyberpunk", Icon: Cpu },
  { value: "editorial", label: "Editorial Design", Icon: Newspaper },
  ...additionalThemes,
];
export const darkThemes = new Set(["dark", "cyberpunk", ...additionalDarkThemes]);
export function themeFromSpeech(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return themeOptions.flatMap(option => [option.value, option.label].map(name => ({ option, match: name.toLowerCase().replace(/[^a-z0-9]/g, "") })))
    .sort((a, b) => b.match.length - a.match.length)
    .find(candidate => normalized.includes(candidate.match))?.option;
}