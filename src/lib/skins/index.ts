// every look the game ships. a new skin is a new file here, nothing else.
import { bubbles } from "./bubbles.ts";
import { cells } from "./cells.ts";
import { kitties } from "./kitties.ts";
import { numbers } from "./numbers.ts";
import { puppies } from "./puppies.ts";
import { shapes } from "./shapes.ts";
import type { Skin } from "./types.ts";

export const SKINS: Skin[] = [bubbles, numbers, cells, puppies, kitties, shapes];
/** a fresh player gets bubbles; a saved look is kept */
export const DEFAULT_SKIN = bubbles;
export const skinById = (id: string | null): Skin => SKINS.find((s) => s.id === id) ?? DEFAULT_SKIN;
