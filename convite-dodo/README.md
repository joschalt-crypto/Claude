# Convite animado — Dodó 3 anos (tema Ursinho Pooh)

Vídeo vertical (1080×1920, ~17 s) no estilo "diorama de papel" que vai se montando camada por camada:
céu → morros → pinheiros → grama → árvores → varal → polaroides do Dodó → colmeia e bastidor com foto →
turma do Pooh → abelhinhas → Pooh subindo no balão vermelho → pano de renda com o texto "bordado".

## Editar os textos
Tudo fica em `scene/config.js` (nome, idade, chamada, data/hora e local).

## Gerar o vídeo
As imagens (fotos da família e recortes da ilustração do Pooh) **não** ficam no repositório, que é público.
Coloque-as em `scene/img/` (`pooh.png`, `hive.png`, `friends_l.png`, `friends_r.png`,
`foto_spaghetti.jpg`, `foto_vovo.jpg`, `foto_mae.jpg`, `foto_hoop.jpg`) — `scripts/prep.py` gera esses arquivos
a partir das fotos originais e do recorte feito com `scripts/rmbg.mjs` (`@imgly/background-removal-node`).

```sh
python3 scripts/music.py musica.wav                      # caixinha de música "Parabéns a Você"
node scripts/render.cjs video scene convite.mp4 30 musica.wav
node scripts/render.cjs stills scene . 17                # só o quadro final, em PNG
```

Requer Node com Playwright/Chromium e ffmpeg.
