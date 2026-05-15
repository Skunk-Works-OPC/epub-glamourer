# eStorya Cover Generation

This document describes the cover-generation workflow that produced the current `proposed-cover-v2.jpg` files for the Gutenberg books in `gutenberg_html_books/*`.

Use this as a handoff for another Codex agent.

This document intentionally excludes archive and file-moving housekeeping tasks.

## Goal

Produce attractive, digital-bookshelf-ready covers for Gutenberg titles that:

- use newly generated ChatGPT image artwork
- include readable title and author text directly in the generated image
- preserve an empty upper-right zone for the eStorya hanging banner
- end as `1600 x 2560` JPEGs named `proposed-cover-v2.jpg`

The successful direction was not “vintage repaint” or “soft literary poster.”
The successful direction was:

- bold
- high-contrast
- thumbnail-legible
- one dominant focal idea
- strong silhouette
- clean empty space for the brand banner

## Inputs

Per book folder:

- `title.txt`
- source Gutenberg files and illustrations
- any existing cover or internal art only for inspiration

Brand assets:

- `brand/NavyBanner.png`
- `brand/CreamBanner.png`

## Outputs

For each target book folder:

- `proposed-cover-v2.jpg`

## Core Rules

1. Do not reuse the old cover design direction.
2. Do not base the new cover too closely on the archival Gutenberg cover.
3. Generate fresh artwork with ChatGPT Images.
4. Optimize for bookshelf readability first.
5. Keep the upper-right area visually quiet for the banner.
6. Keep the banner flush to the top, but inset from the right edge.

## What Worked

The first attempt was too washed out and too “period-painting cover.”

The better direction used:

- stronger contrast
- cleaner subject hierarchy
- simpler composition
- integrated title typography in the generated image
- more iconic scene selection
- obvious color separation

Good examples from this run:

- fantasy titles: strong emblematic scene with one clear path, portal, lamp, or city
- adventure titles: one central hero with map, ship, cliff, or train
- literary titles: one strong figure with books, coast, sky, or architecture

## Composition Spec

Every cover should be composed for a later banner overlay.

Reserve the upper-right 30% of the cover as mostly quiet negative space:

- pale sky
- glow
- mist
- smooth gradient
- sparse stars

Do not place in that area:

- title text
- author text
- faces
- important props
- city focal points
- strong texture that fights the banner

## Banner Placement Spec

Use the brand banner as a hanging tag.

Placement rules:

- top edge: flush to the top
- right edge: inset from the right, not flush
- background: must sit inside the empty upper-right negative space

Working production values from this run:

- output size: `1600 x 2560`
- banner width: `280 px`
- right margin: `80 px`
- y-position: `0`

Composite position:

```text
x = 1600 - 280 - 80
y = 0
```

Banner choice guidance:

- `NavyBanner.png` for pale, warm, or airy covers
- `CreamBanner.png` for darker blue or night covers where navy feels too heavy

In this run, `CreamBanner.png` was used only for Arabian Nights.

## Prompting Strategy

Use ChatGPT Images to generate the full cover, including title and author text.

This differs from the more conservative “art first, type later” workflow in `basebranded.md`, but it worked better here because:

- the generated titles felt more integrated
- the covers read better at thumbnail size immediately
- the typography was already harmonized with the illustration

The model still needs strict instructions:

- exact title text only
- exact author text only
- no extra words
- no logo
- no watermark
- reserve upper-right space

## Prompt Pattern

Use a prompt like this:

```text
Design a premium digital-bookshelf-ready literary cover in portrait orientation for "[TITLE]" by [AUTHOR].
Make it bold, clean, high-contrast, and instantly legible at thumbnail size.
Use a fresh modern [genre] illustration, not vintage cover art.

Show: [main iconic scene]
Mood: [clear emotional tone]
Palette: [3-5 dominant color cues]
Composition: strong focal point, simplified background, elegant integrated typography.

Reserve the upper right 30% of the cover as mostly blank quiet space with smooth tone and no important art so a separate hanging brand banner can be overlaid there later.
Keep the title and author outside that area.

Include only exact readable text: "[TITLE]" and "[AUTHOR]".
No logo, no watermark, no extra words.
```

## Scene Selection Guidance

Pick one memorable, iconic hook per book.

Prefer:

- one hero plus one setting
- one magical object plus one environment
- one path toward one destination
- one dramatic transport image: train, ship, balloon, mirror, road

Avoid:

- crowded montage scenes
- muddy atmospheric compositions
- too many characters competing for attention
- overly soft pastel values that disappear on a shelf

## Successful Title-Specific Angles

These worked well for the current set:

- `Through the Looking-Glass`: Alice, mirror portal, chessboard path, Red Queen silhouette
- `Treasure Island`: young sailor, pirate silhouette, ship, cliff, treasure map
- `The Railway Children`: three children waving at a steam train in golden light
- `Anne of the Island`: Anne with books on a windswept coastal path near a school building
- `The Arabian Nights`: glowing brass lamp, night city, storyteller figure, indigo and gold
- `Dorothy and the Wizard in Oz`: Dorothy and the Wizard descending into a crystal underworld
- `Children's Literature`: authoritative editorial cover with books opening into story imagery
- `The Wonderful Wizard of Oz`: Dorothy and companions on the yellow road toward Emerald City

## Quality Check Before Accepting a Cover

Before finalizing, inspect the generated image and verify:

1. The title is readable and spelled correctly.
2. The author name is readable and spelled correctly.
3. The top-right zone is empty enough for the banner.
4. The main subject still reads at thumbnail size.
5. The banner will not cover important content.
6. The cover looks stronger than a generic AI painting.

If the text is wrong or mushy, regenerate. Do not try to rescue a weak base.

## Post-Processing

After selecting the final generated image:

1. Fit it to `1600 x 2560`.
2. Overlay the chosen banner.
3. Save as `proposed-cover-v2.jpg` in the respective book folder.

The simplest implementation is Pillow.

Example script pattern:

```python
from PIL import Image, ImageOps

src = Image.open(source_path).convert("RGB")
cover = ImageOps.fit(src, (1600, 2560), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)).convert("RGBA")

banner = Image.open(banner_path).convert("RGBA")
banner = banner.resize((280, round(banner.height * 280 / banner.width)), Image.Resampling.LANCZOS)

cover.alpha_composite(banner, (1600 - 280 - 80, 0))
cover.convert("RGB").save(output_path, quality=95, subsampling=0)
```

## Working Notes For Another Agent

- Start by reading `title.txt` in each book folder.
- Use the Gutenberg source only for visual cues, not as a composition template.
- Do not use the old `proposed-cover.jpg` look as the benchmark.
- The banner placement used in the final accepted version has right-side breathing space.
- Verify output visually after compositing.

## Deliverable Convention

Per folder:

- final file: `proposed-cover-v2.jpg`

If iterating further, keep new outputs versioned similarly:

- `proposed-cover-v3.jpg`
- `proposed-cover-v4.jpg`

Do not overwrite silently if the user wants to preserve prior accepted takes.
