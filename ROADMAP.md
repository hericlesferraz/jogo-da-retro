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
- Preencher `config/personagens.json` com as pessoas reais do time (nome, cor e habilidade de cada um).
- Sprites pixel-art de cada pessoa (pipeline em `docs/prompt-personagens.md`); sem sprite o jogo usa placeholder com cor + inicial.
- Deploy com a conta do time (roteiro em `docs/04-deploy.md`).

## Sessão 3 — Batata-Quente

1. Modo batata sobre a fundação pronta: movimento livre, portador/repasse, timer oculto, encolhimento da arena.
2. Reaproveitar personagens, habilidades, placar e telas.
3. Playtest, tuning e deploy.

## Sessão 4+ — Polimento (opcional, quando for a vez dele de novo)

- Emojis de torcida para espectadores mortos, efeitos visuais/sonoros, novos mapas, novas habilidades, histórico de temporada entre retros.
