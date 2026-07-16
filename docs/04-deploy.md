# Deploy

Um único serviço Node serve o client estático e o WebSocket — sem banco, estado em memória, morre com a partida. Requisitos na plataforma: Node 20+, um serviço web com HTTPS (socket.io usa WSS pelo mesmo domínio/porta).

Custo de referência: uma retro (20 min de jogo, container pequeno de pé por
algumas horas) consome **centavos** em qualquer plano medido. Preços
conferidos em julho/2026 — revalidar se passar muito tempo.

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

**Custo**: o Trial dá US$ 5 de crédito uma vez, sem cartão (expira em 30
dias) — cobre dezenas de retros. Depois a conta vira plano Free com US$ 1 de
crédito/mês, que ainda cobre uma retro mensal **se o serviço for derrubado
após o uso** (ver nota no fim).

## Render (alternativa 100% grátis)

Free tier real (750 h de instância/mês): **New Web Service → repo do GitHub**,
build `npm run build`, start `npm start` — a plataforma injeta `PORT`.
Caveats do free:

- O serviço **hiberna após 15 min sem tráfego** e leva ~1 min para acordar —
  abrir o link uns 2 min antes da retro resolve.
- Instância modesta (512 MB, 0.1 CPU). Deve segurar 9 jogadores a 30 Hz, mas
  rode o checklist abaixo com bots lá antes do dia.

## Fly.io (não é mais grátis)

Cortou o free tier para contas novas (trial de 2 h de VM/7 dias, depois exige
cartão; menor VM ~US$ 2/mês). O `Dockerfile` do repositório continua
funcionando, mas só vale se centavos no cartão não incomodarem:

```bash
fly launch --no-deploy   # gera fly.toml (aceite a porta interna 3000)
fly deploy
```

## Túnel do próprio PC (R$ 0, zero deploy)

Rodar local e expor por túnel — o extremo do "sobe no dia, morre depois":

```bash
npm run build && npm start                      # produção local na :3000
cloudflared tunnel --url http://localhost:3000  # ou: ngrok http 3000
```

- **Cloudflare Tunnel (quick tunnel)**: grátis sem conta, **sem limite de
  banda** (teto de 200 requisições simultâneas — irrelevante para 9
  jogadores), WebSocket funciona por padrão. URL aleatória `trycloudflare.com`
  a cada subida — tanto faz, o link vai no chat do time de qualquer jeito.
- **ngrok**: mesmo fluxo, mas o plano free tem franquia de banda (~1 GB/mês);
  uma partida com 9 jogadores consome centenas de MB — cabe numa sessão,
  sem folga para várias.

Depende da máquina e da conexão do host ficarem de pé durante o jogo; com
ping doméstico a interpolação segura bem.

## Checklist pós-deploy

1. Abrir o domínio em duas abas/dispositivos → lobby sincroniza.
2. Host adiciona 1 bot e inicia com 2 jogadores → rodada roda de ponta a ponta.
3. Latência: jogar do celular no 4G — interpolação deve manter o movimento liso.

## Nota de segurança/custo

O link é público enquanto o serviço estiver de pé. Para a retro basta subir no dia e **derrubar depois** (`railway down` / pausar o serviço) — evita custo e estranhos na sala.
