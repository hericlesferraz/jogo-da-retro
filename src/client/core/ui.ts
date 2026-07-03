// DOM screens: lobby, HUD, countdown/intermission/podium overlays, toasts.
// The canvas only ever draws the arena; everything else is plain DOM.

import {
  MAX_ROUNDS_PER_MATCH,
  MIN_PLAYERS_TO_START,
  MIN_ROUNDS_PER_MATCH,
} from '../../shared/constants';
import type {
  BomberPlayerSnap,
  GameSnapshot,
  PlayerId,
  RoomView,
  ScoreRow,
} from '../../shared/types';
import { ABILITY_META, CHARACTERS, characterOf } from './characters';
import { artFor } from './sprites';
import type { GameSocket } from './socket';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export function toast(message: string): void {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  $('toasts').appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

export function setConnectionStatus(text: string): void {
  $('lobby-status').textContent = text;
}

/** Player display name = their character (each person plays themself). */
function nameOf(view: RoomView, pid: PlayerId): string {
  const player = view.players.find((p) => p.id === pid);
  const char = characterOf(player?.characterId);
  return char?.nome ?? 'alguém';
}

// ---------------------------------------------------------------- screens

export function showScreen(which: 'lobby' | 'game'): void {
  $('screen-lobby').hidden = which !== 'lobby';
  $('screen-game').hidden = which !== 'game';
}

// ------------------------------------------------------------------ lobby

export function renderLobby(view: RoomView, myId: PlayerId | null, socket: GameSocket): void {
  const me = view.players.find((p) => p.id === myId) ?? null;
  const isHost = myId !== null && view.hostId === myId;

  // character cards
  const grid = $('char-grid');
  grid.replaceChildren();
  for (const char of CHARACTERS) {
    const takenBy = view.players.find((p) => p.characterId === char.id) ?? null;
    const card = document.createElement('div');
    card.className = 'char-card';
    if (takenBy) card.classList.add('taken');
    if (takenBy && takenBy.id === myId) card.classList.add('mine');

    const img = document.createElement('img');
    img.className = 'sprite';
    img.src = artFor(char).cardSrc;
    img.alt = char.nome;
    card.appendChild(img);

    const name = document.createElement('div');
    name.className = 'char-name';
    name.textContent = char.nome;
    name.style.color = char.cor;
    card.appendChild(name);

    const ability = document.createElement('div');
    ability.className = 'char-ability';
    const meta = ABILITY_META[char.habilidade];
    ability.textContent = `${meta.icon} ${meta.nome}`;
    ability.title = meta.desc;
    card.appendChild(ability);

    if (takenBy) {
      const tag = document.createElement('span');
      tag.className = 'char-tag';
      tag.textContent =
        takenBy.id === myId ? 'você' : takenBy.isBot ? '🤖 bot' : 'escolhido';
      card.appendChild(tag);
      card.style.boxShadow =
        takenBy.id === myId ? '' : `0 0 0 2px ${char.cor}55`;
    }

    card.addEventListener('click', () => {
      if (!me || me.spectator) return;
      if (takenBy && takenBy.id !== myId) return;
      socket.emit('lobby:selectCharacter', takenBy && takenBy.id === myId ? null : char.id);
    });
    grid.appendChild(card);
  }

  // player list
  const list = $('player-list');
  list.replaceChildren();
  for (const p of view.players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const char = characterOf(p.characterId);
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = char?.cor ?? '#555';
    row.appendChild(dot);
    const label = document.createElement('span');
    const bits: string[] = [];
    bits.push(char?.nome ?? 'escolhendo…');
    if (p.id === myId) bits.push('(você)');
    label.textContent = bits.join(' ');
    row.appendChild(label);
    const who = document.createElement('span');
    who.className = 'who';
    const tags: string[] = [];
    if (p.isHost) tags.push('👑 host');
    if (p.isBot) tags.push('🤖');
    if (!p.connected) tags.push('📴 desconectado');
    else if (p.spectator) tags.push('👀 espectador');
    else tags.push(p.ready ? '✅ pronto' : '⌛');
    who.textContent = tags.join(' · ');
    row.appendChild(who);
    list.appendChild(row);
  }

  // controls
  const readyBtn = $<HTMLButtonElement>('btn-ready');
  readyBtn.disabled = !me || me.spectator || !me.characterId;
  readyBtn.textContent = me?.ready ? '❌ Cancelar pronto' : 'Estou pronto!';
  readyBtn.classList.toggle('primary', !me?.ready);
  readyBtn.onclick = () => socket.emit('lobby:ready', !me?.ready);

  const hostBox = $('host-controls');
  hostBox.hidden = !isHost;
  if (isHost) {
    const sel = $<HTMLSelectElement>('sel-rounds');
    if (sel.options.length === 0) {
      for (let r = MIN_ROUNDS_PER_MATCH; r <= MAX_ROUNDS_PER_MATCH; r++) {
        const opt = document.createElement('option');
        opt.value = String(r);
        opt.textContent = String(r);
        sel.appendChild(opt);
      }
    }
    sel.value = String(view.roundsPerMatch);
    sel.onchange = () => socket.emit('lobby:rounds', Number(sel.value));
    $('btn-add-bot').onclick = () => socket.emit('lobby:addBot');

    const entrants = view.players.filter((p) => p.characterId);
    const humansPending = entrants.filter((p) => !p.isBot && p.connected && !p.ready);
    const startBtn = $<HTMLButtonElement>('btn-start');
    startBtn.disabled = entrants.length < MIN_PLAYERS_TO_START || humansPending.length > 0;
    startBtn.onclick = () => socket.emit('lobby:start');
    $('lobby-hint').textContent =
      entrants.length < MIN_PLAYERS_TO_START
        ? `Precisa de pelo menos ${MIN_PLAYERS_TO_START} jogadores (bots contam).`
        : humansPending.length > 0
          ? `Esperando ficar pronto: ${humansPending.map((p) => nameOf(view, p.id)).join(', ')}`
          : 'Tudo pronto — bora! 🚀';
  }
}

// -------------------------------------------------------------------- HUD

export function updateHud(
  view: RoomView,
  snap: GameSnapshot | null,
  myId: PlayerId | null,
): void {
  $('hud-round').textContent = `Rodada ${view.currentRound}/${view.roundsPerMatch}`;

  const mode = snap?.mode;
  const sudden = $('hud-sudden');
  if (mode) {
    if (mode.suddenDeath.active) {
      sudden.textContent = '☠️ MORTE SÚBITA!';
      sudden.classList.add('warn');
    } else {
      const s = Math.ceil(mode.suddenDeath.startsInMs / 1000);
      sudden.textContent = `⏳ morte súbita em ${s}s`;
      sudden.classList.toggle('warn', s <= 10);
    }
  }

  const chips = $('hud-players');
  chips.replaceChildren();
  if (mode) {
    for (const p of mode.players) {
      const char = characterOf(
        view.players.find((v) => v.id === p.id)?.characterId,
      );
      if (!char) continue;
      const chip = document.createElement('span');
      chip.className = 'hud-chip' + (p.alive ? '' : ' dead');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = char.cor;
      chip.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = p.kills > 0 ? `${char.nome} 💥${p.kills}` : char.nome;
      chip.appendChild(label);
      chips.appendChild(chip);
    }
  }

  const meSnap: BomberPlayerSnap | null =
    mode?.players.find((p) => p.id === myId) ?? null;
  const stats = $('hud-stats');
  if (meSnap) {
    stats.textContent = `💣 ${meSnap.maxBombs}  ·  🔥 ${meSnap.range}  ·  👟 ${meSnap.speedStacks > 0 ? `+${meSnap.speedStacks * 15}%` : 'base'}`;
  } else {
    stats.textContent = '👀 assistindo';
  }

  const myChar = characterOf(view.players.find((p) => p.id === myId)?.characterId);
  const abilityBox = $('hud-ability');
  if (meSnap && myChar) {
    abilityBox.style.visibility = 'visible';
    const meta = ABILITY_META[myChar.habilidade];
    const cd = meSnap.abilityCooldownMs;
    $('ability-label').textContent =
      cd > 0 ? `${meta.icon} ${meta.nome} (${Math.ceil(cd / 1000)}s)` : `${meta.icon} ${meta.nome} — pronta!`;
    $('ability-bar').classList.toggle('cooling', cd > 0);
    $('ability-fill').style.width = `${Math.round((1 - cd / 10000) * 100)}%`;
  } else {
    abilityBox.style.visibility = 'hidden';
  }

  const banner = $('dead-banner');
  const meLobby = view.players.find((p) => p.id === myId);
  if (view.phase === 'playing' && meSnap && !meSnap.alive) {
    banner.hidden = false;
    banner.textContent = '💀 Você foi eliminado — assistindo a rodada';
  } else if (view.phase !== 'lobby' && meLobby && (meLobby.spectator || !meSnap)) {
    banner.hidden = false;
    banner.textContent = '👀 Partida em andamento — você entra na próxima!';
  } else {
    banner.hidden = true;
  }
}

// --------------------------------------------------------------- overlays

export function hideOverlay(): void {
  $('overlay').hidden = true;
  $('overlay').classList.remove('countdown');
}

export function showCountdown(msLeft: number): void {
  const overlay = $('overlay');
  overlay.hidden = false;
  overlay.classList.add('countdown');
  const n = Math.ceil(msLeft / 1000);
  $('overlay-panel').innerHTML = `<div class="countdown-num">${n > 0 ? n : 'JÁ!'}</div>`;
}

function scoreTable(rows: ScoreRow[], view: RoomView, opts: { withDelta: boolean }): string {
  const medals = ['🥇', '🥈', '🥉'];
  const body = rows
    .map((row) => {
      const char = characterOf(row.characterId);
      const medal = row.rank <= 3 ? (medals[row.rank - 1] ?? '') : '';
      const isLast = row.rank === Math.max(...rows.map((r) => r.rank)) && rows.length > 2;
      return `<tr class="${isLast ? 'last-place' : ''}">
        <td><span class="medal">${medal}</span>${row.rank}º</td>
        <td><span class="row-name"><span class="dot" style="background:${char?.cor ?? '#555'}"></span>${char?.nome ?? '?'}</span></td>
        ${opts.withDelta ? `<td class="num delta">+${row.lastRoundDelta}</td>` : ''}
        <td class="num">${row.kills}</td>
        <td class="num">${row.roundWins}</td>
        <td class="num"><strong>${row.total}</strong></td>
      </tr>`;
    })
    .join('');
  return `<table class="score">
    <thead><tr>
      <th></th><th>Jogador</th>${opts.withDelta ? '<th class="num">Rodada</th>' : ''}
      <th class="num">💥</th><th class="num">🏆</th><th class="num">Total</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

export function showIntermission(view: RoomView): void {
  const overlay = $('overlay');
  overlay.hidden = false;
  overlay.classList.remove('countdown');
  const winner = view.lastRound?.winner;
  const winnerLine = winner
    ? `🏆 <strong style="color:${characterOf(view.players.find((p) => p.id === winner)?.characterId)?.cor ?? '#fff'}">${nameOf(view, winner)}</strong> venceu a rodada!`
    : 'Ninguém sobreviveu… 💥';
  $('overlay-panel').innerHTML = `
    <h2>Fim da rodada ${view.currentRound}</h2>
    <p style="margin-bottom: 1rem">${winnerLine}</p>
    ${scoreTable(view.scoreboard, view, { withDelta: true })}
    <p class="overlay-sub">próxima rodada em <strong id="intermission-count">…</strong></p>
  `;
}

export function setIntermissionCountdown(seconds: number): void {
  const el = document.getElementById('intermission-count');
  if (el) el.textContent = `${seconds}s`;
}

export function showPodium(view: RoomView, myId: PlayerId | null, socket: GameSocket): void {
  const overlay = $('overlay');
  overlay.hidden = false;
  overlay.classList.remove('countdown');
  const rows = view.scoreboard;
  const winner = rows[0];
  const maxRank = Math.max(...rows.map((r) => r.rank));
  const losers = rows.filter((r) => r.rank === maxRank);
  const winnerChar = characterOf(winner?.characterId);

  const loserLine =
    rows.length > 2 && losers.length > 0
      ? `<div class="podium-loser">😈 ${losers
          .map((l) => `<strong>${characterOf(l.characterId)?.nome ?? '?'}</strong>`)
          .join(' e ')} — o próximo jogo da retro é com você${losers.length > 1 ? 's' : ''}!</div>`
      : '';

  $('overlay-panel').innerHTML = `
    <h2>🏁 Fim de jogo!</h2>
    ${
      winnerChar
        ? `<p style="margin-bottom:1rem">👑 Campeã(o): <strong style="color:${winnerChar.cor}">${winnerChar.nome}</strong></p>`
        : ''
    }
    ${scoreTable(rows, view, { withDelta: false })}
    ${loserLine}
    <div class="actions" id="podium-actions"></div>
  `;
  if (view.hostId === myId) {
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = '🔁 Jogar de novo';
    btn.onclick = () => socket.emit('podium:playAgain');
    document.getElementById('podium-actions')?.appendChild(btn);
  } else {
    const p = document.createElement('p');
    p.className = 'overlay-sub';
    p.textContent = 'esperando o host reiniciar…';
    document.getElementById('podium-actions')?.appendChild(p);
  }
}
