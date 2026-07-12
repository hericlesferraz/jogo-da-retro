# Batata-Quente Explosiva

Pega-pega com bomba-relógio: quem estiver segurando a bomba quando ela estourar, sai. A regra inteira se explica em uma frase no início da retro.

## Controles

- Setas/WASD — movimento livre (não é em grade)
- Espaço — **esquiva** (o botão de pânico do modo; cooldown 4s)
- Shift/E — habilidade do personagem (cooldown ~10s), como no Bomber

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
| Esquiva (espaço) | **0,5s imune + impulso de 0,25s, cooldown 4s** | contrajogada do fugitivo: o portador sempre alcança, mas o toque tem um momento esquivável — apertar na hora certa compra alguns segundos; errar o tempo desperdiça o cooldown (feedback de playtest da sessão 3) |

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

## Notas de implementação (sessão 3)

Decisões tomadas ao implementar (valores em `src/shared/constants.ts`, bloco `BATATA`):

- **Escolha do jogo**: ao **criar a sala na tela inicial** (revisado em playtest — antes era um seletor no lobby). O jogo é fixo por sala; trocar de jogo = criar outra sala.
- **Esquiva**: além dos valores da tabela acima — o portador não pode esquivar, e o cooldown aparece no HUD. Bots esquivam quando o portador chega perto.
- **Controles**: espaço = esquiva (imunidade breve + impulso na direção olhada; o portador não pode esquivar); Shift/E = habilidade, como no Bomber.
- **Skins do modo**: arte em `src/client/public/personagens/batata/` com os mesmos nomes de arquivo é usada automaticamente na arena da Batata (fallback por imagem para a arte padrão) — dá para especializar o visual sem mexer em config nem código.
- **Arena**: 20×13 unidades, 9 obstáculos aleatórios (caixas/pilares) com folga mínima de 1,7 entre si e das paredes — nunca fecha rota de fuga. Toque = distância entre centros ≤ 0,85.
- **Encolhimento**: 1,15 (x) / 0,7 (y) por lado a cada eliminação; as paredes deslizam a 2 u/s (empurram os jogadores) até o mínimo de 4,5×3,5.
- **Batata no chão** (truque do decoy): o fuse continua queimando; se estourar no chão ninguém é eliminado (renasce normal); se ninguém encostar por 4s, ela gruda no sobrevivente mais próximo (anti-trava). O portador **não** se engana com o próprio clone (nasceria nos pés dele = descarte grátis; achado em playtest).
- **Shield**: bloquear um repasse também dá 1,5s de imunidade ao bloqueador (senão o portador re-encostaria no tick seguinte, com o escudo já consumido).
- **Anti-camping**: o bônus acumula até +100% no máximo.
- **Swap**: a batata vai junto com o portador (troca só as posições) — teleportar o perigo para longe/perto é parte da graça.
- **Kill da batata**: quem fez o último repasse leva o crédito mesmo se a batata caiu no chão no meio (decoy) — quem derrubou segue "dono" dela.
- **Timer oculto no cliente**: o snapshot só expõe `heat` (fração 0..1 do fuse queimado) para acelerar o pisca-pisca — o total sorteado nunca sai do servidor.
