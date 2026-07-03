// Client-side roster: bundled straight from config/personagens.json.
import rawConfig from '../../../config/personagens.json';
import type { AbilityId, CharacterDef } from '../../shared/types';

export const CHARACTERS: CharacterDef[] = rawConfig.personagens.map((c) => ({
  ...c,
  habilidade: c.habilidade as AbilityId,
}));

const byId = new Map(CHARACTERS.map((c) => [c.id, c]));

export function characterOf(id: string | null | undefined): CharacterDef | null {
  return (id && byId.get(id)) || null;
}

/** Display bits for UI (pt-BR). */
export const ABILITY_META: Record<AbilityId, { icon: string; nome: string; desc: string }> = {
  dash: { icon: '💨', nome: 'Dash', desc: 'Impulso rápido na direção do movimento' },
  shield: { icon: '🛡️', nome: 'Escudo', desc: 'Bloqueia 1 explosão' },
  teleport: { icon: '✨', nome: 'Teleporte', desc: 'Teleporte curto na direção olhada' },
  freeze: { icon: '❄️', nome: 'Congelar', desc: 'Congela o jogador mais próximo por 1,5s' },
  push: { icon: '👋', nome: 'Empurrão', desc: 'Empurra o jogador mais próximo' },
  swap: { icon: '🔀', nome: 'Troca', desc: 'Troca de posição com alguém aleatório' },
  ghost: { icon: '👻', nome: 'Fantasma', desc: 'Atravessa blocos por 2s' },
  decoy: { icon: '🎭', nome: 'Isca', desc: 'Cria um clone-isca parado por 4s' },
  'bomb-kick': { icon: '🦵', nome: 'Chute', desc: 'Chuta uma bomba na direção olhada' },
};

export const POWERUP_META = {
  range: { icon: '🔥', nome: '+1 alcance' },
  bomb: { icon: '💣', nome: '+1 bomba' },
  speed: { icon: '👟', nome: '+15% velocidade' },
} as const;
