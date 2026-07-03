# Prompt para gerar a arte dos personagens (Gemini)

Anexar duas imagens: **imagem 1** = o elenco de personagens do universo Bomberman (arte oficial com vários personagens temáticos); **imagem 2** = foto da pessoa. Manter o esqueleto idêntico para todo mundo, trocando só a foto e o `[TEMA]` — e usar sempre a mesma imagem 1, para o estilo não derivar entre pessoas.

A sacada que faz funcionar: a imagem 1 não é "referência para não copiar" — o personagem novo é **um integrante do mesmo elenco**. Todos compartilham o DNA do traje Bomberman (macacão, luvas, capacete com antena) e o `[TEMA]` personaliza por cima, exatamente como o cowboy/cavaleiro/vovô do elenco original. E dizer explicitamente para **não usar a roupa da foto** — sem isso, o modelo veste o personagem com a camiseta do selfie.

O `[TEMA]` vem do catálogo por papel no fim deste doc — cada pessoa com silhueta, acessório e paleta próprios (é o que evita todo mundo sair parecido). Se der para alinhar a habilidade do jogo por cima (clérigo CS com `shield`, ladino com `dash`), é bônus.

```text
Crie uma character sheet (folha de personagem) de UM ÚNICO personagem de videogame
em pixel art, com proporções chibi (cabeça grande, cerca de metade da altura do
corpo), como os personagens do universo Bomberman da imagem 1.

O personagem é um NOVO integrante do elenco da imagem 1 e deve vestir o traje
clássico desse universo: macacão arredondado, luvas grandes, botas, cinto com
fivela e capacete arredondado com antena e esfera brilhante no topo. Assim como
os personagens da imagem 1, o traje base é personalizado pelo tema abaixo — o
capacete pode ser adaptado ao tema (chapéu de cowboy com antena, elmo de
cavaleiro com antena, etc.).

O rosto dentro da abertura do capacete é uma versão estilizada da pessoa da
imagem 2: preserve o penteado e a cor do cabelo aparecendo sob o capacete,
barba/bigode, óculos (se houver) e tom de pele. NÃO use as roupas da foto —
o personagem veste o traje temático, não a roupa da pessoa.

Tema do personagem: [TEMA — colar do catálogo abaixo]. O tema define as cores
do traje e os acessórios que o personagem segura.

A imagem deve conter exatamente 3 vistas do MESMO personagem, lado a lado em uma
única fileira, nesta ordem, da esquerda para a direita:
1. vista frontal (de frente para a câmera)
2. vista lateral (virado para a direita)
3. vista de costas

Requisitos técnicos:
- As 3 vistas no mesmo tamanho e mesma escala, com os pés alinhados na mesma
  linha de base e espaço vazio entre elas
- Pose neutra em pé, corpo inteiro visível da cabeça aos pés
- Mesma paleta de cores nas 3 vistas — é o mesmo personagem em ângulos diferentes
- Fundo branco puro, liso, sem cenário e sem sombra projetada no chão
- Deixe uma margem generosa de fundo branco vazio ao redor de toda a fileira —
  nenhuma parte dos personagens deve encostar nas bordas da imagem
- Sem texto, sem rótulos, sem marca d'água, sem moldura
```

A margem não é estética: o Gemini carimba um watermark (losango) no canto inferior direito da imagem. Com margem, ele cai no fundo branco e o script de fatiamento o remove sozinho; sem margem, ele pode cair **em cima** do personagem (aconteceu na primeira amostra — exigiu retoque manual).

## Catálogo de temas por papel

Ajustar o gênero das palavras conforme a pessoa. A cor dominante do tema deve ser única por pessoa e repetida no campo `cor` do `config/personagens.json` (placar e trilha combinam com a arte).

| Papel | `[TEMA]` | Paleta |
|---|---|---|
| Dev 1 | um artífice-ferreiro com óculos de proteção na testa, avental de couro, luva mecânica e martelo rúnico gigante, engrenagens de bronze flutuando ao redor | bronze, cobre e marrom |
| Dev 2 | um alquimista com frascos de poção borbulhante no cinto, luvas grossas e um tomo de receitas preso por corrente | verde-esmeralda e couro escuro |
| Dev 3 | um caçador de bugs com rede, lanterna e chapéu de explorador, cercado por pequenos besouros brilhantes fugindo dele | verde-musgo e caqui |
| Dev 4 | um ladino encapuzado com máscara meio-rosto, adagas gêmeas e pergaminhos de runas saindo dos bolsos | cinza-azulado e preto |
| Analista de dados | um oráculo com bola de cristal que mostra gráficos e constelações, vestes com padrão de estrelas e telescópio de latão nas costas | azul-índigo e dourado |
| Vendas | um mercador rico de casaco de veludo, anéis chamativos, balança dourada numa mão e bolsa de moedas transbordando na outra | vinho e dourado |
| CS | um clérigo curandeiro com cajado de cristal luminoso, vestes claras e uma aura suave de cura ao redor das mãos | branco e dourado com azul-claro |
| UX/UI | um ilusionista-artista com pincel mágico gigante pingando tinta que vira borboletas coloridas, paleta de pintor no braço e boina | respingos multicoloridos sobre base clara |
| PM | um general-estrategista com capa de comandante, luneta na mão, mapa tático no cinto e bandeirinhas de missão | vermelho e aço |
| PO | um escriba real com coroa pequena torta, carregando um pergaminho interminável que se desenrola pelo chão, pena atrás da orelha e selo de cera | verde-esmeralda e dourado |

## Depois de gerar

1. Salvar a sheet bruta em `art-raw/<id>.png` (id = slug da pessoa, ex.: `carlos.png`).
2. Fatiar: `python3 tools/slice_sprites.py art-raw/<id>.png` — separa as 3 vistas, remove o fundo branco (preservando brancos internos como olhos), espelha a lateral para gerar a esquerda e salva `<id>-down/right/left/up.png` em `src/client/public/personagens/`. Fragmentos soltos (watermark no fundo) são removidos automaticamente; se o watermark cair **em cima** do personagem, gere a imagem de novo (com a margem do prompt isso não deve acontecer).
3. Apontar no `config/personagens.json`: `"sprite": { "down": "/personagens/<id>-down.png", "up": "/personagens/<id>-up.png", "left": "/personagens/<id>-left.png", "right": "/personagens/<id>-right.png" }`.
4. Só a **vista frontal é indispensável** — se lateral ou costas vierem ruins, use `"sprite": "/personagens/<id>-down.png"` (frontal + flip) e melhore depois.
