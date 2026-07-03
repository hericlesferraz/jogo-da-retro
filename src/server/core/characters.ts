import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharacterDef } from '../../shared/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(here, '../../../config/personagens.json');

let cache: CharacterDef[] | null = null;

/** Team roster from config/personagens.json (read once at startup). */
export function loadCharacters(): CharacterDef[] {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as {
    personagens: CharacterDef[];
  };
  const seen = new Set<string>();
  for (const c of raw.personagens) {
    if (!c.id || !c.nome || !c.cor || !c.habilidade) {
      throw new Error(`personagens.json: entrada inválida: ${JSON.stringify(c)}`);
    }
    if (seen.has(c.id)) throw new Error(`personagens.json: id duplicado "${c.id}"`);
    seen.add(c.id);
  }
  cache = raw.personagens;
  return cache;
}

export function getCharacter(id: string): CharacterDef | undefined {
  return loadCharacters().find((c) => c.id === id);
}
