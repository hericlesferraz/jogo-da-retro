# Bomber Royale

Bomberman clássico adaptado para 8 jogadores, com os personagens do time e suas habilidades únicas. Último vivo vence a rodada; kills valem pontos.

## Controles

- Setas/WASD — mover (movimento em grade com deslize suave)
- Espaço — soltar bomba
- Shift ou E — habilidade do personagem (cooldown ~10s)

## Arena

- Grade **17×13** (dimensionada para 8 spawns seguros: 4 cantos + 4 meios de borda, cada spawn com bolso livre em L).
- Pilares fixos indestrutíveis no padrão clássico (posições ímpares).
- **~55%** das células livres preenchidas com blocos destrutíveis no início.

## Bombas e explosões

| Parâmetro | Valor inicial |
|---|---|
| Timer da bomba | 2,5s |
| Alcance base | 2 células (cruz) |
| Bombas simultâneas base | 1 |
| Explosão em cadeia | bomba atingida detona imediatamente |
| Bloco destrutível | para a explosão e é destruído |

## Power-ups

Blocos destruídos têm **30%** de chance de dropar:

- 🔥 +1 alcance (máx 6)
- 💣 +1 bomba simultânea (máx 5)
- 👟 +15% velocidade (máx +60%)

## Morte súbita

Aos **90s** de rodada, blocos indestrutíveis começam a cair em espiral das bordas para o centro (1 por meio segundo), esmagando quem estiver embaixo. Garante fim da rodada em ≤ 2,5 min.

## Pontuação

- Kill: **+3** (dono da bomba que matou; se explodiu a si mesmo, ninguém pontua).
- Colocação: 1º eliminado = 1 pt … vencedor = 8 pts.
- Padrão da partida: **4 rodadas**.

## Movimento

- Velocidade base **4,2 células/s** (+15% por 👟, máx +60%).
- Movimento contínuo com colisão por célula: o centro do jogador só cruza para célula passável, com **funil para o centro do corredor** e **corner assist** (encostou na quina já inclinado para uma abertura → desliza para ela). Diagonal não existe; com duas teclas seguradas vale a **mais recente**, e se ela estiver bloqueada tenta a outra (deslizar ao longo de parede).

## Habilidades — notas específicas do modo

- `shield` bloqueia **1 explosão** (consome e entra em cooldown; armado por até 5s).
- `ghost` atravessa blocos destrutíveis (não pilares); se a duração acabar dentro de um bloco, morre esmagado (risco/recompensa). Não atravessa bombas.
- `bomb-kick` chuta a bomba da célula à frente em linha reta (8 células/s) até colidir com parede, bloco, bomba ou jogador; se deslizar sobre fogo, detona.
- `teleport` pisca até 3 células na direção olhada, caindo na célula livre mais distante (atravessa blocos e pilares — é a graça).
- `dash` = 180ms a 16 células/s (~3 células), na direção olhada, com colisão.
- `push` empurra o alvo 3 células na direção oposta ao lançador (eixo dominante), parando em obstáculos.
- `decoy` (bônus do modo) cria um clone parado por 4s que queima em explosões — vale bomba desperdiçada do inimigo.
- `swap`/`push`/`freeze` perto de bombas são as jogadas mais canalhas do jogo — é intencional.

## Riscos conhecidos

- Cadeia de explosões e timing de morte por explosão precisam ser resolvidos por célula no servidor (nunca no cliente).
- Movimento em grade com deslize (corner-cutting suave) é o que faz o jogo "sentir bem" — reservar tempo de tuning.
