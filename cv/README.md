# CV

The CV's content lives in [`cv.yaml`](cv.yaml). `npm run build` turns it into a
print-ready A4 PDF, plus an HTML version, in `out/`.

## Build

```sh
cd cv
npm install
npx playwright install chromium   # once; skip if CHROMIUM_PATH points to Chrome/Chromium
npm run build                     # → out/<Your-Name>-CV.pdf and .html
```

The build reports the page count. Aim for one or two pages.

## Customise

- **Content**: `cv.yaml`. The notes at the top of the file explain the format.
  Sections appear in the order they're written, and each key is its heading,
  so renaming a key (e.g. to `Berufserfahrung`) renames the heading.
- **Look**: `style.css`. Colours and fonts are in `:root`, and page size and
  margins are in `@page` (use `size: letter` for US Letter).
- **Fonts**: Source Sans 3 and Source Serif 4 (SIL Open Font License), installed
  from npm and embedded in the PDF.
