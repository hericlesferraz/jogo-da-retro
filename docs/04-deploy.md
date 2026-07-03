# Deploy

Um único serviço Node serve o client estático e o WebSocket — sem banco, estado em memória, morre com a partida. Requisitos na plataforma: Node 20+, um serviço web com HTTPS (socket.io usa WSS pelo mesmo domínio/porta).

## Railway (alvo principal)

O `railway.json` do repositório já define build (`npm run build`) e start (`npm start`).

Via CLI (uma vez: `npm i -g @railway/cli` e `railway login`):

```bash
railway init     # cria o projeto (primeira vez)
railway up       # faz deploy da pasta atual
railway domain   # gera o domínio público (o link do time)
```

Ou pelo painel: **New Project → Deploy from GitHub repo** e aponte para este repositório — o `railway.json` cuida do resto. Depois, em *Settings → Networking → Generate Domain*.

Sem variáveis obrigatórias: a plataforma injeta `PORT` e o servidor a respeita (`process.env.PORT`).

## Fly.io (alternativa)

O `Dockerfile` do repositório funciona direto:

```bash
fly launch --no-deploy   # gera fly.toml (aceite a porta interna 3000)
fly deploy
```

## Checklist pós-deploy

1. Abrir o domínio em duas abas/dispositivos → lobby sincroniza.
2. Host adiciona 1 bot e inicia com 2 jogadores → rodada roda de ponta a ponta.
3. Latência: jogar do celular no 4G — interpolação deve manter o movimento liso.

## Nota de segurança/custo

O link é público enquanto o serviço estiver de pé. Para a retro basta subir no dia e **derrubar depois** (`railway down` / pausar o serviço) — evita custo e estranhos na sala.
