# Jogo da Retro

Jogo multiplayer em tempo real para a retrospectiva do time: ~8 jogadores, partida de 5–10 minutos, todo mundo entra pelo navegador — quem cria a sala escolhe o jogo na tela inicial e compartilha um código de 4 letras. Regra do ritual do time: o último colocado do ranking é o responsável pelo jogo da próxima retro.

São dois jogos construídos sobre uma **fundação compartilhada**:

- **Bomber Royale** — Bomberman com personagens do time e habilidades únicas → `docs/02-bomber-royale.md`
- **Batata-Quente** — pega-pega com bomba-relógio → `docs/03-batata-quente.md`

A fundação (lobby, personagens, habilidades, rodadas, placar, netcode) está especificada em `docs/01-fundacao.md`. Leia antes de mexer em qualquer sistema compartilhado. O roadmap por sessão está em `ROADMAP.md`.

## Stack e arquitetura

- Node.js + TypeScript, socket.io, Canvas 2D, Vite. **Sem framework de frontend e sem engine de jogo** — a meta é simplicidade e estabilidade para rodar na retro.
- **Servidor autoritativo**: toda a lógica de jogo roda no servidor em tick fixo. O cliente só envia estado de input e renderiza snapshots com interpolação. Nunca decidir resultado de colisão/eliminação no cliente.
- **Modos de jogo são plugins**: cada jogo implementa a interface `GameMode` (`src/shared/types.ts`) e vive em `src/server/modes/<modo>/` + `src/client/modes/<modo>/`. Lobby, personagens, habilidades, rodadas, placar e netcode pertencem à fundação (`core/`) — nunca duplicar isso dentro de um modo.

## Estrutura

```
src/shared/          tipos, protocolo, constantes (importado por client e server)
src/server/core/     lobby, sala, rodadas, placar, loop de tick, habilidades
src/server/modes/    um diretório por jogo (bomber/, batata/)
src/client/core/     conexão, captura de input, telas de lobby/placar/pódio
src/client/modes/    renderizador Canvas de cada jogo
src/client/public/personagens/  sprites finais do time (transparentes, 4 vistas por pessoa; subpasta <modo>/ = skins opcionais do modo, com fallback)
config/personagens.json  pessoas do time (nome, cor, sprite, habilidade)
art-raw/             sheets brutas geradas por IA (fonte da arte; pipeline em docs/prompt-personagens.md)
tools/slice_sprites.py  fatia uma sheet em sprites transparentes por vista
```

## Comandos

```
npm run dev        # client (vite, :5173) + server (tsx watch, :3000) juntos
npm run build      # build de produção do client em dist/client
npm start          # produção: server serve o client buildado em :3000
npm run typecheck  # tsc --noEmit
```

## Convenções

- Textos de UI em pt-BR; código (identificadores, comentários) em inglês.
- Nenhuma dependência nova sem necessidade real.
- Todo tuning de gameplay (velocidades, timers, pontos, tamanhos) fica em `src/shared/constants.ts` ou no doc de design do modo — nunca hardcoded no meio da lógica.
- O estado de jogo é serializável (vira snapshot pro cliente): objetos simples, sem closures nem referências circulares.
- Os valores de tuning dos docs de design são ponto de partida — ajustar jogando, e atualizar o doc quando o valor mudar.
