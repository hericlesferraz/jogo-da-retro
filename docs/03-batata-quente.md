# Batata-Quente Explosiva

Pega-pega com bomba-relógio: quem estiver segurando a bomba quando ela estourar, sai. A regra inteira se explica em uma frase no início da retro.

## Controles

- Setas/WASD — movimento livre (não é em grade)
- Espaço — habilidade do personagem (cooldown ~10s)

## Rodada

1. A bomba surge com um jogador aleatório. O portador ganha brilho vermelho pulsante visível de longe.
2. O portador precisa **encostar** em alguém para passar a bomba.
3. Timer **oculto e semi-aleatório (15–25s)** — a bomba pisca cada vez mais rápido perto de estourar.
4. Estourou → portador eliminado; a bomba renasce com um sobrevivente aleatório após 2s.
5. A **arena encolhe** um degrau a cada eliminação (paredes se fecham), forçando aproximação.
6. Com 8 jogadores são 7 explosões ≈ **2,5 min** de rodada — termina sozinha, sem morte súbita extra.

## As duas regras que fazem o jogo funcionar

| Regra | Valor inicial | Por quê |
|---|---|---|
| Portador anda mais rápido | **+15%** | sem isso o portador nunca alcança ninguém e o jogo trava |
| Imunidade após passar | **1,5s** | sem isso vira ping-pong infinito entre dois jogadores grudados |

## Arena

Campo aberto com obstáculos (caixas/pilares) espalhados para criar rotas de fuga — colisão círculo-retângulo simples. Sem física de empurrão entre jogadores (atravessar é permitido, exceto o toque do repasse).

## Pontuação

- Colocação: 1º eliminado = 1 pt … vencedor = 8 pts.
- "Kill": **+2** para quem fez o último repasse antes da explosão.
- Padrão da partida: **4 rodadas** (rodadas curtas → dá até para 5).

## Habilidades — notas específicas do modo

- `shield` bloqueia **1 repasse** (a bomba não gruda; consome e entra em cooldown).
- `decoy` cria um clone-isca parado por 4s — portador desatento passa a bomba no clone e ela cai no chão (fica no lugar, primeiro a encostar pega).
- `push` empurrar um colega **na direção do portador** é a jogada mais canalha do modo — é intencional.
- `dash`/`teleport` servem tanto para fugir quanto para caçar.

## Riscos conhecidos

- O toque do repasse é sensível a lag ("eu não encostei!"): o servidor decide, com hitbox de toque um pouco generosa e feedback visual/sonoro forte no momento do repasse para não deixar dúvida.
- Anti-camping: se ninguém for tocado por 10s, a velocidade do portador sobe gradualmente (+5%/s) até alguém ser pego.
