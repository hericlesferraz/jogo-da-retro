# Plano: música temática (título, lobby e partida)

Objetivo: três ambientes sonoros em loop, **volume baixo por padrão** (o time
joga em call), com mute persistente. Filosofia de sempre: **arquivo ausente =
silêncio, nada quebra** — a infra entra primeiro, as faixas quando existirem.

## Slots de arquivo (convenção)

Em `src/client/public/audio/`:

| Arquivo | Toca em | Vibe sugerida |
|---|---|---|
| `musica-titulo.mp3` | tela "Escolha o jogo" | arcade convidativo, brilhante |
| `musica-lobby.mp3` | seleção de personagem | groove calmo de espera, tenso de leve |
| `musica-bomber.mp3` | partida de Bomber | energético, urgente |
| `musica-batata.mp3` | partida de Batata | frenético, cômico, tic-tac |

Fallback: se `musica-bomber/batata.mp3` não existir, tentar `musica-partida.mp3`
(faixa única para os dois modos); se nada existir, silêncio.

## Implementação (1 sessão, ~30–45 min)

1. **`client/core/audio.ts` — MusicPlayer**: um `HTMLAudioElement` com
   `loop = true`, `volume = MUSIC_VOLUME` (0.15 em `constants.ts`).
   `setScene(scene: 'titulo' | 'lobby' | 'bomber' | 'batata' | null)`:
   troca a faixa com fade de ~400ms (interval baixando/subindo volume);
   mesma cena = no-op; `null` (rodada acabou? manter) — na prática a cena
   segue a tela. Erro de load (404) → desiste em silêncio.
2. **Hooks em `main.ts`**: já existe o ponto exato — `applyScreens()` +
   `onRoomState()` sabem tela e `view.modeId`. intro → 'titulo';
   lobby → 'lobby'; countdown/playing/intermission/podium → modeId.
3. **Autoplay**: navegador exige gesto. O unlock de `audio.ts` já escuta o
   primeiro pointerdown/keydown — o MusicPlayer deve tentar `play()` no
   `setScene` e, se bloqueado (promise rejeitada), re-tentar no unlock.
4. **Mute**: botão 🔊/🔇 fixo (canto inferior direito, visível em todas as
   telas, z acima dos overlays), estado em `localStorage['retro-mute']`.
   Mute silencia música E efeitos (beep/boom ganham o mesmo gate).
5. **Validação**: playtest — música não pode brigar com os bipes da batata
   (se brigar, baixar MUSIC_VOLUME); troca de tela faz fade sem clique; F5
   no meio da partida volta com a música certa; mute persiste.

## Volume da aba inteira (opção sem código — vale divulgar pro time)

Além do mute do jogo, o navegador já permite controlar TODO o som da aba —
importante com o time em call:

- **Chrome/Edge**: clique direito na aba → **"Silenciar site"** (mudo total,
  liga/desliga com um clique).
- **Sistema (volume gradual por app)**: no Windows, Misturador de Volume; no
  Linux (pavucontrol) e macOS, o navegador aparece como fonte — dá para
  *baixar* o jogo sem silenciar a call.
- No jogo, uma linha no guia de comandos do lobby pode lembrar isso
  ("som alto? dá para silenciar a aba no navegador").

Opcional na implementação: em vez de só mute liga/desliga, o botão pode abrir
um **volume mestre** (slider 0–100% aplicado a música + efeitos, persistido em
localStorage) — cobre o meio-termo sem depender do sistema de cada um.

## Conseguindo as faixas (curadoria é do usuário — precisa de ouvido)

- **Pixabay Music** (licença livre, sem atribuição): buscar "chiptune loop",
  "8-bit arcade" — baixar `.mp3` direto.
- **OpenGameArt.org**: filtrar CC0 (CC-BY exige crédito no README).
- **Gerar com IA (Suno)** — prompts prontos, pedir sempre "seamless loop":
  - título: *"upbeat 8-bit chiptune arcade menu theme, bright and welcoming,
    seamless loop, no vocals, 60s"*
  - lobby: *"chill 8-bit chiptune waiting room groove, playful, light tension,
    seamless loop, no vocals, 60s"*
  - bomber: *"fast 8-bit chiptune battle theme, urgent and explosive energy,
    seamless loop, no vocals, 90s"*
  - batata: *"frantic comedic 8-bit chiptune chase theme with ticking clock
    feel, accelerating tension, seamless loop, no vocals, 90s"*
- Loop sem "clique": cortar o arquivo num zero-crossing (Audacity) ou pedir
  loop perfeito na geração. Mono/128kbps basta (arquivos pequenos no deploy).
