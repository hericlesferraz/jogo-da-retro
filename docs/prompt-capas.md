# Prompt para gerar as capas dos jogos (Gemini)

A tela inicial ("Escolha o jogo") mostra um card de capa por jogo. As imagens
são opcionais — sem elas o card mostra um tile com emoji — e moram em:

- `src/client/public/capas/bomber.png`
- `src/client/public/capas/batata.png`

Não passam pelo fatiador: é só salvar o PNG direto no caminho acima. O card
usa `object-fit: cover` (proporção 16:10), então **as bordas da imagem podem
ser cortadas** — nada importante encostado nas beiradas. Se o watermark do
Gemini cair num canto visível, recortamos a faixa depois (me avise).

Gerar **primeiro a capa do Bomber**; depois anexá-la ao gerar a da Batata como
referência de estilo — é o mesmo truque do pipeline de personagens: a segunda
imagem é "do mesmo estúdio", o que mantém as duas capas coesas.

## Capa 1 — Bomber Royale

```text
Crie uma capa de videogame (key art) em pixel art, formato paisagem,
proporção aproximada 16:10, sem nenhum texto, logotipo ou moldura.

Cena: uma arena estilo Bomberman vista de um ângulo levemente elevado (quase
top-down), com chão em grade, caixas de madeira destrutíveis e pilares de
pedra. No centro, uma bomba redonda preta clássica com pavio aceso soltando
faíscas, prestes a explodir; a um lado, uma explosão em cruz — chamas laranja
e amarelas se espalhando em linhas retas pelos corredores da grade. Dois ou
três personagens chibi de pixel art (cabeça grande, corpo pequeno) correm em
pânico cômico fugindo da explosão. Personagens genéricos, sem semelhança com
pessoas reais.

Clima: noite de fliperama — fundo escuro azul-arroxeado (entre #12121f e
#23233c), iluminado pelo brilho quente da explosão (laranja #ffb830 e
vermelho). Alto contraste, cores vibrantes sobre base escura.

Requisitos técnicos:
- pixel art nítida estilo 16-bits, sem anti-aliasing borrado
- composição centralizada: nada importante encostado nas bordas da imagem
- sem texto, sem números, sem marca d'água, sem assinatura, sem moldura
```

## Capa 2 — Batata-Quente (anexar a capa 1 como referência)

Lição da primeira tentativa: pedir "mesma direção de arte" sem cercas faz o
modelo copiar também a composição e o elenco — as capas saem parecendo dois
screenshots do mesmo jogo. A versão abaixo diz explicitamente **o que não
copiar**. Bônus que funcionou na capa final: usar **os personagens do time**
na cena (anexar as sheets deles junto) — a capa da Batata ganhou identidade
própria e cara de retro do time.

```text
Use a imagem anexa APENAS como referência de estilo: pixel art 16-bits, paleta
noturna azul-arroxeada, nível de detalhe e iluminação de fliperama. NÃO repita
a composição da imagem anexa, NÃO repita a arena dela e NÃO repita os
personagens dela — este é OUTRO jogo do mesmo estúdio, com elenco e cenário
próprios.

Crie uma capa de videogame (key art) em pixel art, formato paisagem, proporção
aproximada 16:10, sem nenhum texto, logotipo ou moldura.

Cena: um pega-pega frenético com uma BATATA-BOMBA num campo aberto — chão de
azulejos em xadrez escuro, SEM grade de corredores e SEM pilares; apenas duas
ou três caixas de madeira espalhadas e um muro de pedra baixo fechando o
perímetro da arena. Um personagem chibi CORRE segurando acima da cabeça uma
batata marrom incandescente (pavio aceso, rachaduras brilhando em laranja como
lava, brilho vermelho pulsante ao redor), perseguindo outro personagem logo à
frente, que foge apavorado olhando para trás; mais dois personagens fogem em
pânico perto das bordas. Os personagens são NOVOS, com trajes em cores
diferentes dos da imagem anexa.

Clima: a luz dominante da cena é VERMELHA, vinda da batata (não laranja) —
é o que diferencia este jogo do outro. Fundo noturno azul-arroxeado escuro,
alto contraste.

Requisitos técnicos:
- pixel art nítida estilo 16-bits, sem anti-aliasing borrado
- composição centralizada: nada importante encostado nas bordas
- sem texto, sem marca d'água, sem moldura
```

## Depois de gerar

1. Salvar como `src/client/public/capas/bomber.png` e `batata.png` (as brutas
   podem ir para `art-raw/capa-bomber.png` e `capa-batata.png` como fonte).
2. Recarregar a página — o card troca o emoji pela capa sozinho.
