# Asset delivery (DA library plugin)

Opens the AEM Assets selector from the DA editor library, with an **Asset delivery** dropdown above it.

| Asset delivery | What the selector lists | What gets inserted | Requirement in AEM |
|---|---|---|---|
| Dynamic Media (approved assets) | Approved assets only (locked filter) | Dynamic Media with OpenAPI URL `https://delivery-pXXX-eYYY.adobeaemcloud.com/adobe/assets/urn:aaid:aem:…/as/<name>.avif`. Images go in as DA "edit as image" links: you see the image in DA, and the page publishes a link | Asset approved (`dam:assetStatus=approved`, activation target `delivery`) |
| Standard asset (DA default) | All assets | `<img>` with the AEM publish URL `https://publish-pXXX-eYYY.adobeaemcloud.com/content/dam/…`. EDS copies it into the media bus on preview, exactly like DA's built-in AEM Assets button | Asset published |

On the site, `decorateDMImageLinks()` in `scripts/scripts.js` turns Dynamic Media image links into a responsive `<picture>` (webp + jpg/png, 750/2000 px). Links inside the `dynamic-media-image` block keep using `decorateDMImages()` with its preset, rotate, flip, crop and smart crop options.

## Setup

DA site config (`https://da.live/config#/yoge93/we-health/`):

- **library** sheet: `title` = `AEM Assets`, `path` = `/tools/plugins/asset-delivery/asset-delivery.html`, `experience` = `fullsize-dialog`
- **data** sheet (all optional):
  - `asset-delivery.repositoryId` – default `author-p35437-e2207568.adobeaemcloud.com`
  - `asset-delivery.dm.origin` – default: repository id with `author-` → `delivery-`
  - `asset-delivery.publish.origin` – default: repository id with `author-` → `publish-`
  - `asset-delivery.basepath` – default `/adobe/assets`
  - `asset-delivery.default` – `dm` (default) or `standard`

Authors need access to the AEM environment with their Adobe ID (same IMS org). The last chosen delivery mode is remembered per browser.
