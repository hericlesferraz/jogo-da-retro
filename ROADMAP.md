# Roadmap

O projeto é construído em sessões de trabalho. Cada jogo fica pronto (jogável de ponta a ponta) na sua própria sessão.

## Sessão 1 — Fundação do projeto ✅ (02–03/jul/2026)

- Decisão de escopo: dois jogos sobre fundação compartilhada.
- Design docs: fundação, Bomber Royale, Batata-Quente.
- CLAUDE.md, scaffold do código verificado (dev/build/typecheck rodando).

## Sessão 2 — Bomber Royale ✅ (03/jul/2026)

1. ✅ Fundação jogável: lobby (link, personagem, ready-check, host inicia, bots), netcode (tick 30Hz + snapshots 15Hz + interpolação), rodadas, placar com desempate, reconexão por token, "jogar de novo".
2. ✅ Modo Bomber completo: movimento em grade com corner-assist, bombas, cadeia, blocos, power-ups, morte súbita em espiral, as 9 habilidades (decoy ganhou versão bônus no Bomber).
3. ✅ Playtest: smoke headless (`npm run smoke` / `smoke:full`), partida completa no navegador com 2 humanos + 2 bots até o pódio; morte súbita validada de ponta a ponta.
4. 🔜 Deploy: arquivos prontos (`railway.json`, `Dockerfile`, passo a passo em `docs/04-deploy.md`) — falta o usuário autenticar na plataforma e subir (± 5 min).
5. ✅ Skill de projeto `playtest` criada (`.claude/skills/playtest/`).

**Pendências do usuário (não bloqueiam nada):**
- ✅ Personagens reais do time (16/jul/2026): 9 sheets geradas pelo usuário, fatiadas com `tools/slice_sprites.py` e configuradas em `config/personagens.json` (habilidade casada com o tema visual de cada arte; `bomb-kick` evitada por não ter efeito na Batata — dash repete em AG e Vini).
- Deploy com a conta do time (roteiro em `docs/04-deploy.md`).

## Sessão 3 — Batata-Quente (12/jul/2026)

1. ✅ Modo batata completo: movimento livre com colisão círculo-retângulo, portador/repasse por toque, imunidade pós-repasse, fuse oculto 15–25s com pisca por `heat`, encolhimento animado da arena por eliminação, anti-camping, truque do decoy (batata no chão), shield bloqueia repasse, bot próprio (caça/foge/esquiva). Snapshot virou união discriminada por `modeId`.
2. ✅ **Salas por código** (feedback de playtest): cria-se a sala na tela inicial escolhendo o jogo, código de 4 letras para o time entrar; salas isoladas, GC de salas abandonadas, reconexão por token + código na URL.
3. ✅ **Esquiva** (feedback de playtest): espaço = imunidade breve + impulso com cooldown 4s — contrajogada à vantagem do portador.
4. ✅ Correções de playtest: proporção dos sprites na arena (desenho respeita o aspect da arte), portador não se engana com o próprio decoy, jogador não fica preso em obstáculo quando a parede encolhe.
5. ✅ Skins por modo: arte opcional em `personagens/batata/` com fallback automático para a arte padrão.
6. ✅ Temas visuais por rodada na batata (noite/cozinha/quintal/gelo, sorteados sem repetir) e som procedural via WebAudio (bipe na piscada da batata, blip no repasse, boom na explosão).
7. ✅ Smoke tests: `npm run smoke[:full]` e `smoke:batata[:full]` — cobrindo criação/entrada de sala, código inválido e o ciclo de cada modo.
8. 🔜 Playtest em grupo, tuning dos valores jogando (esquiva, fuse, encolhimento) e deploy (roteiro em `docs/04-deploy.md`).

**Decisões da sessão** em `docs/03-batata-quente.md` → "Notas de implementação".

## Sessão 4 — Time real e tela de seleção (16/jul/2026)

1. ✅ 9 personagens do time (arte do usuário) fatiados e configurados; fatiador com defringe e remoção opcional de bolsões (`--pockets`).
2. ✅ Tela inicial virou "Escolha o jogo": capas clicáveis por jogo (criar sala) + entrada por código; capas geradas via `docs/prompt-capas.md`, com fallback de emoji quando ausentes.

## Sessão 5+ — Polimento (opcional, quando for a vez dele de novo)

- Emojis de torcida para espectadores mortos, efeitos visuais/sonoros, novos mapas, novas habilidades, histórico de temporada entre retros.
