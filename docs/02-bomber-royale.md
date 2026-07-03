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

## Habilidades — notas específicas do modo

- `shield` bloqueia **1 explosão** (consome e entra em cooldown).
- `ghost` atravessa blocos destrutíveis (não pilares); se a duração acabar dentro de um bloco, morre esmagado (risco/recompensa).
- `bomb-kick` empurra a bomba em linha reta até colidir.
- `swap`/`push`/`freeze` perto de bombas são as jogadas mais canalhas do jogo — é intencional.

## Riscos conhecidos

- Cadeia de explosões e timing de morte por explosão precisam ser resolvidos por célula no servidor (nunca no cliente).
- Movimento em grade com deslize (corner-cutting suave) é o que faz o jogo "sentir bem" — reservar tempo de tuning.
