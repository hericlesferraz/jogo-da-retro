# Roadmap

O projeto é construído em sessões de trabalho. Cada jogo fica pronto (jogável de ponta a ponta) na sua própria sessão.

## Sessão 1 — Fundação do projeto ✅ (02–03/jul/2026)

- Decisão de escopo: dois jogos sobre fundação compartilhada.
- Design docs: fundação, Bomber Royale, Batata-Quente.
- CLAUDE.md, scaffold do código verificado (dev/build/typecheck rodando).

## Sessão 2 — Bomber Royale

1. Fundação jogável: lobby (entrar por link, escolher personagem, ready-check, host inicia), netcode (tick do servidor + snapshots + interpolação no cliente), estrutura de rodadas e placar.
2. Modo Bomber: grade, movimento, bombas e explosões em cadeia, blocos destrutíveis, power-ups, morte súbita, habilidades dos personagens.
3. Playtest local com bots/abas múltiplas, ajuste de tuning.
4. Deploy (Railway ou Fly.io) e teste com link real.
5. Criar skill de projeto para playtest (rodar server + abrir N abas).

**Pendências do usuário para esta sessão:**
- Preencher `config/personagens.json` com as pessoas reais do time (nome, cor e habilidade de cada um).
- Sprites pixel-art de cada pessoa (PNG 256×256, fundo transparente — specs e template de prompt em `docs/01-fundacao.md`). Não bloqueia: sem sprite o jogo usa placeholder com cor + inicial, e a arte pode chegar depois.

## Sessão 3 — Batata-Quente

1. Modo batata sobre a fundação pronta: movimento livre, portador/repasse, timer oculto, encolhimento da arena.
2. Reaproveitar personagens, habilidades, placar e telas.
3. Playtest, tuning e deploy.

## Sessão 4+ — Polimento (opcional, quando for a vez dele de novo)

- Emojis de torcida para espectadores mortos, efeitos visuais/sonoros, novos mapas, novas habilidades, histórico de temporada entre retros.
