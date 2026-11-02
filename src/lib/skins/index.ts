// every look the game ships. a new skin is a new file here, nothing else.
import { cells } from "./cells.ts";
import { kitties } from "./kitties.ts";
import { puppies } from "./puppies.ts";
import { shapes } from "./shapes.ts";
import type { Skin } from "./types.ts";

export const SKINS: Skin[] = [cells, puppies, kitties, shapes];
export const DEFAULT_SKIN = cells;
export const skinById = (id: string | null): Skin => SKINS.find((s) => s.id === id) ?? DEFAULT_SKIN;
