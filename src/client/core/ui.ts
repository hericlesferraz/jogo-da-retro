// DOM screens: intro, lobby (fighting-game style character select), HUD,
// countdown/intermission/podium overlays, toasts. The canvas only ever draws
// the arena; everything else is plain DOM.

import {
  MAX_ROUNDS_PER_MATCH,
  MIN_PLAYERS_TO_START,
  MIN_ROUNDS_PER_MATCH,
} from '../../shared/constants';
import type {
  CharacterDef,
  GameSnapshot,
  PlayerId,
  RoomView,
  ScoreRow,
} from '../../shared/types';
import { ABILITY_META, CHARACTERS, characterOf, MODE_META } from './characters';
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
  $('intro-status').textContent = text;
}

/** Player display name = their character (each person plays themself). */
function nameOf(view: RoomView, pid: PlayerId): string {
  const player = view.players.find((p) => p.id === pid);
  const char = characterOf(player?.characterId);
  return char?.nome ?? 'alguém';
}

function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

// ---------------------------------------------------------------- screens

export function showScreen(which: 'intro' | 'lobby' | 'game'): void {
  $('screen-intro').hidden = which !== 'intro';
  $('screen-lobby').hidden = which !== 'lobby';
  $('screen-game').hidden = which !== 'game';
}

// ------------------------------------------------------------------ intro

/** Title screen: roster strip + create-room (per game) / join-by-code. */
export function renderIntro(handlers: {
  onCreate: (mode: 'bomber' | 'batata') => void;
  onJoin: (code: string) => void;
  /** Pre-fills the join field (last room visited / shared link). */
  initialCode?: string;
}): void {
  const roster = $('intro-roster');
  roster.replaceChildren();
  CHARACTERS.forEach((char, i) => {
    const img = document.createElement('img');
    img.className = 'sprite';
    img.src = artFor(char).cardSrc;
    img.alt = char.nome;
    img.title = char.nome;
    img.style.animationDelay = `${(i % 8) * 0.12}s`;
    roster.appendChild(img);
  });

  $('btn-create-bomber').onclick = () => handlers.onCreate('bomber');
  $('btn-create-batata').onclick = () => handlers.onCreate('batata');

  const input = $<HTMLInputElement>('inp-code');
  if (handlers.initialCode) input.value = handlers.initialCode;
  const join = () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) return toast('Código tem 4 letras.');
    handlers.onJoin(code);
  };
  $('btn-join').onclick = join;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') join();
    e.stopPropagation(); // typing a code must not move a game character
  };
}

// ------------------------------------------------------------------ lobby

/** Last render args, so card clicks can re-render the preview locally. */
let current: { view: RoomView; myId: PlayerId | null; socket: GameSocket } | null = null;
let previewCharId: string | null = null;

export function renderLobby(view: RoomView, myId: PlayerId | null, socket: GameSocket): void {
  current = { view, myId, socket };
  const me = view.players.find((p) => p.id === myId) ?? null;
  const isHost = myId !== null && view.hostId === myId;

  const modeMeta = MODE_META[view.modeId];
  $('lobby-title').textContent = `${modeMeta.icon} ${modeMeta.nome}`;
  $('lobby-room').innerHTML =
    `sala <strong>${view.code}</strong> — fala o código pro time entrar!`;

  // default preview: what I browsed > my character > first free > first
  if (!previewCharId) {
    const firstFree = CHARACTERS.find(
      (c) => !view.players.some((p) => p.characterId === c.id),
    );
    previewCharId = me?.characterId ?? firstFree?.id ?? CHARACTERS[0]?.id ?? null;
  }

  // character cards
  const grid = $('char-grid');
  grid.replaceChildren();
  for (const char of CHARACTERS) {
    const takenBy = view.players.find((p) => p.characterId === char.id) ?? null;
    const card = document.createElement('div');
    card.className = 'char-card';
    if (takenBy) card.classList.add('taken');
    if (takenBy && takenBy.id === myId) card.classList.add('mine');
    if (char.id === previewCharId) card.classList.add('preview');

    const abilityIcon = document.createElement('span');
    abilityIcon.className = 'char-ability-icon';
    abilityIcon.textContent = ABILITY_META[char.habilidade].icon;
    card.appendChild(abilityIcon);

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

    if (takenBy) {
      const tag = document.createElement('span');
      tag.className = 'char-tag';
      tag.textContent = takenBy.id === myId ? 'você' : takenBy.isBot ? '🤖' : '✔';
      card.appendChild(tag);
    }

    card.addEventListener('click', () => {
      previewCharId = char.id;
      if (current) renderLobby(current.view, current.myId, current.socket);
    });
    grid.appendChild(card);
  }

  renderPreview(view, me, socket);

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
  } else {
    $('lobby-hint').innerHTML =
      `Escolha seu personagem e marque pronto.<br />${modeMeta.controles}`;
  }
}

/** The big side panel: pose, name, ability and the pick action. */
function renderPreview(
  view: RoomView,
  me: RoomView['players'][number] | null,
  socket: GameSocket,
): void {
  const char: CharacterDef | null = characterOf(previewCharId) ?? CHARACTERS[0] ?? null;
  if (!char) return;
  const takenBy = view.players.find((p) => p.characterId === char.id) ?? null;
  const isMine = takenBy !== null && takenBy.id === me?.id;

  $('preview-stage').style.setProperty('--preview-glow', rgba(char.cor, 0.17));
  const sprite = $<HTMLImageElement>('preview-sprite');
  sprite.src = artFor(char).cardSrc;
  sprite.alt = char.nome;

  const name = $('preview-name');
  name.textContent = char.nome;
  name.style.color = char.cor;

  $('preview-status').textContent = isMine
    ? '⭐ este é você'
    : takenBy
      ? takenBy.isBot
        ? 'já em uso por um bot 🤖'
        : `já escolhido por ${nameOf(view, takenBy.id)}`
      : 'livre';

  const meta = ABILITY_META[char.habilidade];
  const box = $('preview-ability');
  box.querySelector<HTMLElement>('.ab-icon')!.textContent = meta.icon;
  box.querySelector<HTMLElement>('.ab-name')!.textContent = meta.nome;
  box.querySelector<HTMLElement>('.ab-desc')!.textContent = meta.desc;

  const pick = $<HTMLButtonElement>('btn-pick');
  if (isMine) {
    pick.textContent = '✖ Soltar personagem';
    pick.classList.remove('primary');
    pick.disabled = false;
    pick.onclick = () => socket.emit('lobby:selectCharacter', null);
  } else if (takenBy) {
    pick.textContent = 'indisponível';
    pick.classList.remove('primary');
    pick.disabled = true;
    pick.onclick = null;
  } else {
    pick.textContent = `Escolher ${char.nome}`;
    pick.classList.add('primary');
    pick.disabled = me === null;
    pick.onclick = () => socket.emit('lobby:selectCharacter', char.id);
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
  if (mode?.modeId === 'bomber') {
    if (mode.suddenDeath.active) {
      sudden.textContent = '☠️ MORTE SÚBITA!';
      sudden.classList.add('warn');
    } else {
      const s = Math.ceil(mode.suddenDeath.startsInMs / 1000);
      sudden.textContent = `⏳ morte súbita em ${s}s`;
      sudden.classList.toggle('warn', s <= 10);
    }
  } else if (mode?.modeId === 'batata') {
    const pot = mode.potato;
    if (pot.respawnInMs > 0) {
      sudden.textContent = '🥔 a batata volta já…';
      sudden.classList.remove('warn');
    } else if (pot.onGround) {
      sudden.textContent = '🥔 batata no chão — ninguém quer!';
      sudden.classList.add('warn');
    } else if (pot.holder) {
      const holderChar = characterOf(
        view.players.find((v) => v.id === pot.holder)?.characterId,
      );
      sudden.textContent = `🥔 com ${holderChar?.nome ?? '?'}`;
      sudden.classList.toggle('warn', pot.holder === myId);
    } else {
      sudden.textContent = '';
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

  const meSnap = mode?.players.find((p) => p.id === myId) ?? null;
  const stats = $('hud-stats');
  if (meSnap && mode?.modeId === 'bomber' && 'maxBombs' in meSnap) {
    stats.textContent = `💣 ${meSnap.maxBombs}  ·  🔥 ${meSnap.range}  ·  👟 ${meSnap.speedStacks > 0 ? `+${meSnap.speedStacks * 15}%` : 'base'}`;
  } else if (meSnap && mode?.modeId === 'batata' && meSnap.alive && 'dodgeCooldownMs' in meSnap) {
    const dodge =
      meSnap.dodgeCooldownMs > 0
        ? `🌀 esquiva em ${Math.ceil(meSnap.dodgeCooldownMs / 1000)}s`
        : '🌀 esquiva pronta';
    stats.textContent =
      mode.potato.holder === myId
        ? '🥔🔥 VOCÊ está com a batata — PASSA!'
        : `🏃 fuja da batata!  ·  ${dodge}`;
  } else {
    stats.textContent = '👀 assistindo';
  }
  $('hud-keys').textContent =
    mode?.modeId === 'batata'
      ? 'espaço: esquiva · shift/E: habilidade'
      : 'espaço: bomba · shift/E: habilidade';

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

export function showPodium(
  view: RoomView,
  myId: PlayerId | null,
  socket: GameSocket,
  onLeave: () => void,
): void {
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
  const actions = document.getElementById('podium-actions');
  if (view.hostId === myId) {
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = '🔁 Jogar de novo';
    btn.onclick = () => socket.emit('podium:playAgain');
    actions?.appendChild(btn);
  } else {
    const p = document.createElement('p');
    p.className = 'overlay-sub';
    p.textContent = view.hostId
      ? `esperando ${nameOf(view, view.hostId)} (host) reiniciar…`
      : 'esperando o host reiniciar…';
    actions?.appendChild(p);
  }
  const leave = document.createElement('button');
  leave.textContent = '✕ Sair da sala';
  leave.onclick = onLeave;
  actions?.appendChild(leave);
}
