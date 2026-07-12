---
name: playtest
description: Sobe o jogo em dev e abre N abas de navegador para playtest local do Jogo da Retro. Use quando o usuário pedir para playtestar, testar o jogo, ou "abrir o jogo" localmente.
---

# Playtest local do Jogo da Retro

Objetivo: deixar o jogo rodando com N jogadores (padrão 2) prontos para testar em minutos.

## Passos

1. **Servidor dev**: verifique se já está de pé (`curl -sf http://localhost:5173 >/dev/null` e `curl -sf http://localhost:3000/socket.io/?EIO=4&transport=polling`). Se não, rode `npm run dev` em background e espere o log mostrar `Local: http://localhost:5173` e `listening on :3000`. Se a porta 3000 estiver ocupada por outro projeto, use `PORT=3210 npm run dev` (o proxy do Vite acompanha o `PORT`) — cuidado para não matar o processo do outro projeto.
2. **Abas**: abra N abas (padrão 2; o usuário pode pedir mais).
   - Com as ferramentas do Chrome (claude-in-chrome): `tabs_create_mcp` + `navigate`.
   - Sem elas: sugira ao usuário abrir `http://localhost:5173` manualmente.
   - **Importante**: abas no mesmo navegador compartilham `localStorage` → mesmo token → mesmo jogador. Para múltiplos jogadores na mesma máquina, varie a origem: `http://localhost:5173`, `http://127.0.0.1:5173` (e, se precisar de mais, o IP da máquina na rede local). Janela anônima também funciona.
3. **Preencher a sala**: na primeira aba, clique no jogo desejado em "Criar sala" (💣/🥔) — ela vira host e o lobby mostra o **código de 4 letras**. Nas outras abas, digite o código em "Entrar em sala". Em cada aba: selecione um card, confirme com "Escolher <nome>" e clique "Estou pronto". Para encher a partida sem mais abas, use "🤖 + bot" (host).
4. **Iniciar**: host clica "▶ Iniciar partida". O jogo é fixo por sala — para trocar de jogo, crie outra sala.
5. **Validação rápida sem navegador**: `npx tsx tools/smoke-match.ts` (fluxo até a primeira morte, ~15s) ou `--full` (partida inteira até o pódio, ≤ ~3min). Para a batata: `--batata` / `--batata --full` (ou `npm run smoke:batata[:full]`).

## Encerrar

Mate o processo `npm run dev` (e qualquer `tsx src/server/index.ts` que tenha sobrado do smoke).

## Dicas de teste

### Bomber
- Movimento/corner-assist: andar segurando a tecla contra quinas — deve deslizar, não travar.
- Cadeia: duas bombas próximas → a segunda detona junto.
- Morte súbita: espere 90s de rodada — blocos caem em espiral das bordas.

### Batata-Quente
- Repasse: encostar em alguém com a batata — brilho vermelho troca de jogador, quem passou fica com anel tracejado (imune 1,5s).
- Pisca: perto de estourar, o brilho do portador pulsa visivelmente mais rápido.
- Encolhimento: a cada eliminação as paredes deslizam para dentro (borda vermelha pulsante).
- Decoy: usar a habilidade Isca e atrair o portador — a batata cai no chão no lugar do clone.

### Ambos
- Reconexão: recarregue a aba no meio da rodada — deve voltar no mesmo personagem.
