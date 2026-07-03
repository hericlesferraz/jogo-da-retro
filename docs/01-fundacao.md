# Fundação compartilhada

Tudo que os dois jogos usam em comum. Um "jogo" aqui é um **modo** plugado nesta fundação — a fundação é dona do fluxo da partida; o modo é dono apenas do que acontece dentro de uma rodada.

## Fluxo de uma partida

1. **Lobby** — cada pessoa abre o link, vê a lista de personagens do time (`config/personagens.json`), escolhe o seu (sem repetição) e marca "pronto". O primeiro a entrar é o host e tem o botão de iniciar. O host também escolhe o número de rodadas (padrão 4).
2. **Rodada** — contagem de 3s, o modo roda até declarar fim (último vivo). Duração alvo: ≤ 2,5 min, garantida por mecânica de pressão do próprio modo (morte súbita / encolhimento).
3. **Intervalo** — placar parcial na tela por ~12s, próxima rodada começa sozinha.
4. **Fim** — após todas as rodadas, pódio com ranking acumulado. O último colocado é destacado ("o próximo jogo é com você 😈").

## Personagens e habilidades

Cada personagem representa uma pessoa do time: `{ id, nome, cor, sprite, habilidade }`. A habilidade é o único botão além de mover (+ o botão de bomba no Bomber) e tem **cooldown de ~10s**, mostrado no HUD.

### Arte dos personagens

Como no jogo anterior do time, cada personagem é uma **arte pixel-art de corpo inteiro representando a pessoa** (estilo RPG/Tibia — ex.: "Carlos" de mago roxo com cajado). A arte é a identidade do jogo, não um enfeite.

- **Arquivo**: PNG **256×256**, fundo transparente, personagem de frente, centralizado, de corpo inteiro. Salvo em `src/client/public/personagens/<id>.png` e referenciado no `config/personagens.json` como `/personagens/<id>.png`.
- **Lobby**: card com a arte grande e o nome embaixo na cor do personagem — mesmo visual do jogo 3.
- **Na arena**: sprite escalado (~1 célula), flip horizontal conforme a direção, animação de "bob" (balanço código-driven ao andar) e sombra elíptica. Sem spritesheet de animação na v1 — um único frame frontal por personagem basta.
- **Direção olhada**: como várias habilidades são direcionais (teleporte, chute de bomba, dash), a direção do personagem é sempre mostrada por um **indicador desenhado por código** (setinha sutil aos pés) — não depende da arte.
- **Upgrade opcional para 4 lados**: o campo `sprite` aceita tanto um caminho único (vista frontal) quanto um mapa `{ down, up, left, right }` (`SpriteRef` em `src/shared/types.ts`). Trocar no JSON basta, sem mudança de código. v1 fica na vista frontal porque gerar 4 vistas consistentes do mesmo personagem com IA é o gargalo real (32 imagens em vez de 8).
- **Placeholder**: enquanto a arte de alguém não existe (`sprite: null`), o jogo desenha um boneco simples com a cor + inicial do nome. Desenvolvimento nunca bloqueia em arte.
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
| `decoy` | Cria um clone-isca parado por 4s | — | ✔ |
| `bomb-kick` | Chuta uma bomba na direção olhada | ✔ | — |

O sistema de habilidades vive na fundação (`server/core/abilities.ts`); efeitos que dependem do modo (ex.: o que `shield` bloqueia) são resolvidos por hooks que o modo implementa.

## Rodadas e pontuação

- **Colocação**: ordem inversa de eliminação — 1º eliminado = 1 pt … vencedor = N pts (N = jogadores na rodada).
- **Bônus por modo**: Bomber dá +3 por kill; Batata dá +2 para quem fez o último repasse antes da explosão (o "kill" da batata).
- Ranking final = soma de todas as rodadas. Empate: mais vitórias de rodada; depois mais kills.

## Netcode

- Servidor autoritativo, tick fixo de **30 Hz**; snapshots para os clientes a **15 Hz**.
- Cliente envia **estado de input** (teclas seguradas) em keydown/keyup, não comandos por frame.
- Cliente renderiza com **interpolação** entre os 2 últimos snapshots (~100ms de buffer). Sem predição na v1 — com movimento simples e ping doméstico, interpolação basta.
- **Reconexão**: token no localStorage; quem cair volta no mesmo personagem com o estado atual. Jogador desconectado no meio da rodada fica parado (e provavelmente morre — azar).
- Uma sala única por servidor é suficiente (um time), mas o código usa uma abstração `Room` para não fechar portas.

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
