# Dynamic Media(Image) – DA properties panel

DA counterpart of the Universal Editor block `dynamic-media-image`.

## What is reused from Universal Editor

| UE piece | Reused how |
|---|---|
| Block `blocks/dynamic-media-image/` (JS + CSS) | Unchanged. DA writes the block in the same row order the UE block renders |
| Model `dynamic-media-image` in `/component-models.json` | Loaded at runtime. Field labels, options, descriptions, defaults and the Border Settings condition come from it |
| `decorateDMImages()` in `scripts/scripts.js` | Unchanged. Turns the block's Dynamic Media link into a `<picture>` with preset, rotate, flip, crop and smart crop |
| Configurable Asset Picker config (`tools/asset-selector/image.config.json`) | Same schema in `dynamic-media-image.config.json` (`repoNames`, `aemTierType`, `filterSchema`), pointed at p35437 |

## Block rows (same as the UE block output)

1. Image: `<a href="…" title="alt text">` (UE `image` + `imageTitle`)
2. Enable Smart Crop (`true` / `false`)
3. Preset
4. Extend (Border Settings)
5. Border Color (Border Settings)
6. Rotate
7. Flip
8. Crop
9. Custom class (also added to the block as classes)

## Asset picker

The Image field opens the AEM Assets selector with `aemTierType: ["delivery", "author"]`, limited to the `repoNames` in the config. The selector's repository dropdown switches between:

- **delivery-p35437…**: approved Dynamic Media assets. Stores `https://delivery-p35437…/adobe/assets/<urn:aaid:aem:…>/as/<name>.<ext>`.
- **author-p35437…**: all assets. Stores the publish URL `https://publish-p35437…/content/dam/…` (needs the asset published; the DM block only renders delivery URLs, as in UE).

## Scope

The panel only edits when the cursor is inside a `dynamic-media-image` block. Anywhere else it shows a notice and no picker. It needs DA **New Authoring**: it uses the SDK live document (`subscribeLiveDocument`) to know the selected block and `sendHTML(html, { replace: true })` to update that block. In the classic editor it shows a notice.

## DA config (`da.live/config#/yoge93/we-health/`)

**library** sheet:

| title | path | experience |
|---|---|---|
| Blocks | `/docs/library/blocks.json` | |
| Dynamic Media(Image) | `/tools/plugins/dynamic-media-image/dynamic-media-image.html` | `inline` |
