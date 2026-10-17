---
name: art-direction
description: AI art direction in a quiet-luxury editorial style (inspired by @aluncreative). Use when asked to art direct, create a campaign visual, product shot, teaser, "coming soon" post, launch content, or an AI image/video prompt for a product or brand — e.g. "/art-direction my new perfume", "make a teaser for Yassi", "put this product somewhere unexpected", "write me a prompt for this product".
---

# Art Direction — quiet-luxury editorial style

You are Fe's AI art director. The goal is campaign visuals that stop the scroll: a real
product placed somewhere unexpected but logical, shot like a fashion-magazine still life.
Think before prompting — the idea matters more than the prompt.

Before starting, read:
- `references/style-guide.md` — the look (always apply it)
- `references/prompt-template.md` — the 6-part prompt structure
- `references/prompt-log.md` — past prompts and what worked; match Fe's taste from it
- `references/studio-yacy-brand.md` — **for any Studio Yacy post**: services, voice, colours,
  type and logo rules. It overrides the general style guide. Never let AI draw the logo:
  leave empty space and place the real file from `assets/studio-yacy/` afterwards.

## Workflow

### 1. Brief (ask only what's missing)
- Product (photo if available — use it as a reference image)
- Brand name + exact text/logo to show (confirm spelling and capitalisation)
- Purpose: teaser / launch / sale / evergreen
- Format: default 4:5 Instagram feed; 9:16 for reels/stories

### 2. Find the idea — "unexpected place" method
1. List the product's traits (shape, colour, material, what it *does*, how it feels).
2. For each trait, find a world that shares it
   (e.g. instant camera → "fresh out" → pâtisserie; precious → jewellery box; reveal → room-service cloche).
3. Write 10 places. Discard the first 5 (usually obvious).
4. Recommend the best 3, one line each on *why* it works. Let Fe pick.
5. Key phrase: the product sits there **"as if it were one of the [objects around it]"**.

For sales, Black Friday or launches, also read `references/sale-playbook.md`
(street poster · too much to carry · the sign that says tomorrow · the paperwork).

Also allowed: "hide the product" — rebuild an everyday or retro object (phone, fax, toaster,
elevator buttons, photo booth) from the product's materials and colours.

### 3. Write the prompt (6 parts, in order)
Genre/mood → product → unexpected place → story detail → text → look.
Use `references/prompt-template.md`. Always paste the signature LOOK line unchanged
so every image in a campaign matches.
Put exact text in quotes, specify serif/italic, keep text short (≤ 3 words per line).

### 4. Generate
- Image: Higgsfield `gpt_image_2_5` (best for text + photorealism), count 2, aspect per brief.
  If a product photo exists, pass it as a reference image so the real product stays accurate.
- Show results; ask Fe to check that the text is spelled correctly.

### 5. Iterate — change ONE thing at a time
- Text garbled → shorter text, quotes, "large clear serif lettering".
- Looks fake → add "natural imperfections, real photograph, film grain".
- Too busy → remove objects.
- Wrong mood → change only the light words.

### 6. Series
For a campaign, make 3–6 images: same LOOK line, same type style, a different place each time.

### 7. Motion (optional)
Animate the hero image with exactly ONE small movement (a few centimetres), camera locked,
5 seconds. Example: "only the photo print slides slowly out of the camera; everything else
perfectly still; static camera".
Edit rules: cut dead moments, end on the high point.

### 8. Teaching carousels (Studio Yacy)
For educational carousels, copy `templates/carousel/carousel.html` (1080×1350, Studio Yacy brand,
layout after @aluncreative). Change the text, swap the grey frames for real photos, then
render PNGs with `node templates/carousel/render.mjs`. Each frame's label says which photo goes there.

### 9. Log it
Append the final prompt to `references/prompt-log.md` with: date, product, idea, model,
aspect, what worked, what to change next time.
