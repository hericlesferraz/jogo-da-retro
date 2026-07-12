# Fundação compartilhada

Tudo que os dois jogos usam em comum. Um "jogo" aqui é um **modo** plugado nesta fundação — a fundação é dona do fluxo da partida; o modo é dono apenas do que acontece dentro de uma rodada.

## Fluxo de uma partida

1. **Sala** — na tela inicial, uma pessoa **cria a sala escolhendo o jogo** (Bomber Royale ou Batata-Quente — um único deploy serve os dois) e recebe um **código de 4 letras**; o resto do time digita o código para entrar (o código também vai na URL, então recarregar reconecta). O jogo é fixo por sala — para trocar, cria-se outra sala.
2. **Lobby** — cada pessoa vê a lista de personagens do time (`config/personagens.json`), escolhe o seu (sem repetição) e marca "pronto". Quem criou a sala é o host, escolhe o número de rodadas (padrão 4) e tem o botão de iniciar.
3. **Rodada** — contagem de 3s, o modo roda até declarar fim (último vivo). Duração alvo: ≤ 2,5 min, garantida por mecânica de pressão do próprio modo (morte súbita / encolhimento).
4. **Intervalo** — placar parcial na tela por ~12s, próxima rodada começa sozinha.
5. **Fim** — após todas as rodadas, pódio com ranking acumulado. O último colocado é destacado ("o próximo jogo é com você 😈").

## Personagens e habilidades

Cada personagem representa uma pessoa do time: `{ id, nome, cor, sprite, habilidade }`. A habilidade fica no Shift/E nos dois modos e tem **cooldown de ~10s**, mostrado no HUD; o espaço é a ação primária de cada modo (bomba no Bomber, esquiva na Batata).

### Arte dos personagens

Como no jogo anterior do time, cada personagem é uma **arte pixel-art de corpo inteiro representando a pessoa** (estilo RPG/Tibia — ex.: "Carlos" de mago roxo com cajado). A arte é a identidade do jogo, não um enfeite.

- **Arquivo**: PNG **256×256**, fundo transparente, personagem de frente, centralizado, de corpo inteiro. Salvo em `src/client/public/personagens/<id>.png` e referenciado no `config/personagens.json` como `/personagens/<id>.png`.
- **Lobby**: card com a arte grande e o nome embaixo na cor do personagem — mesmo visual do jogo 3.
- **Na arena**: sprite escalado (~1 célula), flip horizontal conforme a direção, animação de "bob" (balanço código-driven ao andar) e sombra elíptica. Sem spritesheet de animação na v1 — um único frame frontal por personagem basta.
- **Direção olhada**: como várias habilidades são direcionais (teleporte, chute de bomba, dash), a direção do personagem é sempre mostrada por um **indicador desenhado por código** (setinha sutil aos pés) — não depende da arte.
- **Upgrade opcional para 4 lados**: o campo `sprite` aceita tanto um caminho único (vista frontal) quanto um mapa `{ down, up, left, right }` (`SpriteRef` em `src/shared/types.ts`). Trocar no JSON basta, sem mudança de código. (Validado: o pipeline de sheets já entrega as 4 vistas.)
- **Upgrade futuro para animação de quadros** (andar, idle): evoluir `SpriteRef` para aceitar uma lista de frames por direção. A mudança fica restrita ao schema do config + o desenho do jogador no renderizador do cliente — o servidor não conhece arte. Animações de **efeitos** (explosão, dash, congelamento) nem dependem disso: são disparadas pelos eventos do servidor e desenhadas proceduralmente ou com spritesheets próprios, 100% no cliente.
- **Placeholder**: enquanto a arte de alguém não existe (`sprite: null`), o jogo desenha um boneco simples com a cor + inicial do nome. Desenvolvimento nunca bloqueia em arte.
- **Skins por modo (opcional)**: um modo pode ter arte especializada — mesmos arquivos, num subdiretório com o nome do modo (ex.: `personagens/batata/<id>-down.png`). O cliente usa a skin quando ela existe e cai para a arte padrão imagem a imagem. Nada muda no config.
- **Produção da arte** (pipeline oficial): gerar com IA de imagem (Gemini), passando **uma imagem de referência de estilo + a foto da pessoa**, pedindo uma *character sheet* com **3 vistas do mesmo personagem em uma única imagem** (frontal, lateral direita, costas — lado a lado, mesma escala, pés alinhados, fundo branco puro, sem texto/sombra). Gerar as vistas juntas é o que garante consistência do personagem; a 4ª direção (esquerda) é a lateral flipada. O slot de tema da roupa/acessório deve casar com a habilidade da pessoa (freeze → mago de gelo, etc.). O prompt completo fica em `docs/prompt-personagens.md`. Depois, um script fatia a sheet em PNGs individuais e remove o fundo branco. Só a vista frontal é indispensável — sheets com vistas ruins não bloqueiam nada.

Habilidades planejadas — a maioria funciona nos dois modos:

| Habilidade | Efeito | Bomber | Batata |
|---|---|---|---|
| `dash` | Impulso rápido na direção do movimento | ✔ | ✔ |
| `shield` | Bloqueia 1 explosão / 1 repasse de bomba | ✔ | ✔ |
| `teleport` | Teleporte curto na direção olhada | ✔ | ✔ |
| `freeze` | Congela o jogador mais próximo por 1,5s | ✔ | ✔ |
| `push` | Empurra o jogador mais próximo para longe (ou para perto do perigo) | ✔ | ✔ |
| `swap` | Troca de posição com um jogador aleatório vivo | ✔ | ✔ |
| `ghost` | Atravessa blocos/obstáculos por 2s | ✔ | ✔ |
| `decoy` | Cria um clone-isca parado por 4s | ✔ | ✔ |
| `bomb-kick` | Chuta uma bomba na direção olhada | ✔ | — |

Notas de implementação (sessão 2): `shield` fica armado por até **5s** se nada o consumir (sem isso, seria escudo permanente com cooldown); `freeze`/`push` miram o inimigo mais próximo num raio de **7 células**; habilidade que falha (sem alvo, teleporte bloqueado) **não gasta cooldown**. `decoy` ganhou versão no Bomber — clone parado que queima em explosões (inimigos gastam bomba à toa) — para ninguém ficar sem habilidade no modo.

O sistema de habilidades vive na fundação (`server/core/abilities.ts`); efeitos que dependem do modo (ex.: o que `shield` bloqueia) são resolvidos por hooks que o modo implementa.

## Rodadas e pontuação

- **Colocação**: ordem inversa de eliminação — 1º eliminado = 1 pt … vencedor = N pts (N = jogadores na rodada).
- **Bônus por modo**: Bomber dá +3 por kill; Batata dá +2 para quem fez o último repasse antes da explosão (o "kill" da batata).
- Ranking final = soma de todas as rodadas. Empate: mais vitórias de rodada; depois mais kills.

## Netcode

- Servidor autoritativo, tick fixo de **30 Hz**; snapshots para os clientes a **15 Hz**.
- Cliente envia **estado de input** (teclas seguradas) em keydown/keyup, não comandos por frame.
- Cliente renderiza com **interpolação** entre os 2 últimos snapshots (~100ms de buffer). Sem predição na v1 — com movimento simples e ping doméstico, interpolação basta.
- Além dos snapshots, o servidor emite **eventos pontuais** (bomba explodiu, jogador eliminado, power-up pego, repasse da batata) — é o gancho do cliente para animações, partículas e sons. Apresentação nunca é derivada "adivinhando" diffs de snapshot; todo efeito nasce de um evento.
- **Reconexão**: o auto-reingresso acontece **só quando a URL tem `?sala=`** (recarregar a página mantém, então quem cai volta no mesmo personagem). Abrir o site "limpo" sempre mostra a tela inicial — o último código visitado só pré-preenche o campo de entrar (ninguém fica preso numa sala velha). "Sair da sala" (lobby e pódio) limpa tudo e volta à tela inicial. Jogador desconectado no meio da rodada fica parado (e provavelmente morre — azar).
- **Salas por código**: o servidor mantém várias salas isoladas (`RoomManager` em `server/core/rooms.ts`), cada uma com seu jogo, código de 4 letras (sem 0/O/1/I — é lido em voz alta) e loop próprio; salas sem humanos conectados por 5 min são removidas.

## Áudio

- Música de fundo em loop (uma faixa por modo) + efeitos sonoros disparados pelos **eventos do servidor** (explosão, repasse, eliminação, power-up, contagem regressiva) — mesma fonte que alimenta as animações.
- `client/core/audio.ts`: manifest de arquivos em `src/client/public/audio/`, com volumes separados para música e efeitos e botão de mute no lobby/HUD.
- O time joga **em call** durante a retro: música começa em volume baixo por padrão, cada um ajusta o seu.
- Navegadores só liberam áudio após um gesto do usuário — o clique de "pronto" no lobby satisfaz isso naturalmente.
- Fontes de áudio: faixas chiptune royalty-free (OpenGameArt, itch.io, Pixabay) ou geradas por IA.

## Espectador

Quem morre continua vendo a arena inteira (visão top-down já mostra tudo). Nice-to-have: mortos podem soltar emojis de torcida que flutuam na tela.

## Interface `GameMode` (contrato, rascunho em `src/shared/types.ts`)

```ts
interface GameMode<Snapshot> {
  id: string;
  startRound(players: PlayerId[]): void;
  tick(dtMs: number, inputs: Map<PlayerId, PlayerInput>): void;
  snapshot(): Snapshot;              // enviado aos clientes a cada net tick
  roundResult(): RoundResult | null; // não-nulo quando a rodada terminou
}
```

No cliente, cada modo fornece o renderizador equivalente (`render(snapshot, ctx)`), e a fundação cuida de telas, HUD de placar/cooldown e input.

## Deploy

Um único servidor Node serve o client estático e o WebSocket. Alvo: **Railway** (ou Fly.io) — deploy por comando único, HTTPS e domínio prontos. Nada de banco de dados: o estado vive em memória e morre com a partida.
