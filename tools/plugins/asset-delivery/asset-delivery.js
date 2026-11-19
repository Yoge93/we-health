/*
 * DA library plugin: AEM Assets with an "Asset delivery" choice per insert.
 *
 * - Dynamic Media: the selector only lists approved assets. The selected asset must be
 *   approved for delivery. The plugin inserts a Dynamic Media with OpenAPI URL
 *   (https://delivery-pXXX-eYYY.adobeaemcloud.com/adobe/assets/urn:aaid:aem:.../as/name.avif).
 *   Images go in as DA "edit as image" links: authors see the image in DA, and the
 *   published page gets a link that scripts.js turns into a responsive <picture>, so the
 *   image is served by Dynamic Media instead of being copied into the media bus.
 * - Standard: the same behaviour as DA's built-in AEM Assets (author + publish mode).
 *   The asset must be published. The plugin inserts the AEM publish URL, and EDS copies
 *   the image into the media bus on preview.
 *
 * Configuration (optional) in the DA site config, sheet "data", key / value:
 *   asset-delivery.repositoryId    author-pXXX-eYYY.adobeaemcloud.com (else aem.repositoryId)
 *   asset-delivery.dm.origin       Dynamic Media host (default: repositoryId, author -> delivery)
 *   asset-delivery.publish.origin  publish host (default: repositoryId, author -> publish)
 *   asset-delivery.basepath        DM base path (default /adobe/assets)
 *   asset-delivery.default         dm | standard (default dm)
 */
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';
const DEFAULT_REPOSITORY_ID = 'author-p35437-e2207568.adobeaemcloud.com';
const DEFAULT_BASE_PATH = '/adobe/assets';
const METADATA_REL = 'http://ns.adobe.com/adobecloud/rel/metadata/asset';
const RENDITION_REL = 'http://ns.adobe.com/adobecloud/rel/rendition';
const MODE_STORAGE_KEY = 'we-health.asset-delivery.mode';

export const MESSAGES = {
  noFormat: 'The selected asset has no format and cannot be used.',
  notApproved: 'This asset is not approved for Dynamic Media delivery. Approve it in AEM Assets (status "Approved", activation target "Delivery") or switch Asset delivery to "Standard asset".',
  notPublished: 'This asset is not published to AEM publish. Publish it in AEM Assets, or switch Asset delivery to "Dynamic Media" if it is approved.',
  selectorFailed: 'The AEM Assets selector could not be loaded. Check your network connection and that you are signed in to Adobe.',
};

const MODES = {
  dm: {
    hint: 'Only approved assets are listed. Images are delivered by Dynamic Media with OpenAPI.',
  },
  standard: {
    hint: 'All assets are listed. The AEM publish URL is inserted and EDS copies the image on preview. The asset must be published.',
  },
};

/* ---------- pure helpers (exported for testing) ---------- */

export function getMimetype(asset) {
  return (asset?.mimetype || asset?.['dc:format'] || '').toLowerCase();
}

export function isImage(asset) {
  return getMimetype(asset).startsWith('image/');
}

function getMetadata(asset) {
  // eslint-disable-next-line no-underscore-dangle
  return asset?._embedded?.[METADATA_REL] || {};
}

export function getSeoName(name = '') {
  return name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
}

export function getAssetAlt(asset) {
  const meta = getMetadata(asset);
  const title = asset?.['dc:title'];
  return meta['Iptc4xmpExt:ExtDescrAccessibility']
    || asset?.['Iptc4xmpExt:ExtDescrAccessibility']
    || meta['dc:description']
    || meta['dc:title']
    || (typeof title === 'object' ? title?.['o:default'] : title)
    || getSeoName(asset?.name || '').replace(/[-_]+/g, ' ')
    || '';
}

export function isApprovedForDelivery(asset) {
  const meta = getMetadata(asset);
  const status = meta['dam:assetStatus'] || asset?.['dam:assetStatus'];
  const target = meta['dam:activationTarget'] || asset?.['dam:activationTarget'];
  return status === 'approved' && (!target || target === 'delivery');
}

export function isPublished(asset) {
  return (asset?.isPublishedToAemPublish ?? asset?.['aem:published']) === true;
}

function normalizeBasePath(basePath = DEFAULT_BASE_PATH) {
  const normalized = `/${basePath}`.replace(/^\/+/, '/').replace(/\/+$/, '');
  return normalized || DEFAULT_BASE_PATH;
}

export function buildDmUrl(asset, dmOrigin, basePath = DEFAULT_BASE_PATH) {
  const base = `https://${dmOrigin}${normalizeBasePath(basePath)}/${asset['repo:id']}`;
  const mimetype = getMimetype(asset);
  if (mimetype.startsWith('image/')) return `${base}/as/${encodeURIComponent(getSeoName(asset.name))}.avif`;
  if (mimetype.startsWith('video/')) return `${base}/play`;
  return `${base}/original/as/${encodeURIComponent(asset.name)}`;
}

export function buildPublishUrl(asset, publishOrigin) {
  if (getMimetype(asset).startsWith('video/')) {
    // eslint-disable-next-line no-underscore-dangle
    const play = asset._links?.[RENDITION_REL]?.find((link) => link.href.endsWith('/play'))?.href;
    if (play) return play;
  }
  const path = asset.path.split('/').map(encodeURIComponent).join('/');
  return `https://${publishOrigin}${path}`;
}

function escapeAttr(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Resolves a selected asset into the HTML to insert, or an error message.
 * @returns {{ html: string } | { error: string }}
 */
export function resolveSelection(asset, mode, config) {
  if (!asset?.['aem:formatName'] && !getMimetype(asset)) return { error: MESSAGES.noFormat };
  const alt = getAssetAlt(asset);

  if (mode === 'dm') {
    if (!isApprovedForDelivery(asset)) return { error: MESSAGES.notApproved };
    const href = buildDmUrl(asset, config.dmOrigin, config.basePath);
    if (isImage(asset)) {
      // DA parses a[data-edit-as] as an image node: shown as an image while editing,
      // saved and published as a link (so it bypasses the media bus).
      return { href, html: `<a href="${escapeAttr(href)}" title="${escapeAttr(alt)}" data-edit-as="image">${escapeAttr(href)}</a>` };
    }
    return { href, html: `<a href="${escapeAttr(href)}">${escapeAttr(href)}</a>` };
  }

  if (!isPublished(asset)) return { error: MESSAGES.notPublished };
  const href = buildPublishUrl(asset, config.publishOrigin);
  if (isImage(asset)) {
    return { href, html: `<img src="${escapeAttr(href)}" alt="${escapeAttr(alt)}">` };
  }
  return { href, html: `<a href="${escapeAttr(href)}">${escapeAttr(href)}</a>` };
}

export function approvedOnlyFilterProps() {
  return {
    filterSchema: [{
      fields: [{
        element: 'radiogroup',
        name: 'property=dam:assetStatus=',
        defaultValue: ['approved'],
        readOnly: true,
        orientation: 'vertical',
        options: [{ label: 'Approved', value: 'approved', readOnly: true }],
      }],
      header: 'Asset Status',
      groupKey: 'AssetStatusGroup',
    }],
    filterSchemaSource: 'hybrid-merge-deep',
  };
}

/* ---------- configuration ---------- */

function configEntries(json) {
  if (!json) return [];
  if (json[':type'] === 'multi-sheet') {
    const first = json.data || json[json[':names']?.[0]];
    return first?.data || [];
  }
  return json.data || [];
}

async function fetchSiteConfig(org, site, token) {
  const entries = [];
  const urls = [`https://admin.da.live/config/${org}/`, `https://admin.da.live/config/${org}/${site}/`];
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return resp.ok ? resp.json() : null;
    } catch {
      return null;
    }
  }));
  // site values win over org values
  results.reverse().forEach((json) => entries.push(...configEntries(json)));
  return (key) => entries.find((row) => row.key === key)?.value || null;
}

export function buildConfig(get) {
  const repositoryId = get('asset-delivery.repositoryId') || get('aem.repositoryId') || DEFAULT_REPOSITORY_ID;
  return {
    repositoryId,
    dmOrigin: get('asset-delivery.dm.origin') || repositoryId.replace(/^author-/, 'delivery-'),
    publishOrigin: get('asset-delivery.publish.origin') || repositoryId.replace(/^author-/, 'publish-'),
    basePath: get('asset-delivery.basepath') || get('aem.assets.prod.basepath') || DEFAULT_BASE_PATH,
    defaultMode: get('asset-delivery.default') === 'standard' ? 'standard' : 'dm',
  };
}

/* ---------- UI ---------- */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.PureJSSelectors) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

function showMessage(text, type = 'error') {
  const el = document.getElementById('asset-delivery-message');
  el.className = `asset-delivery-message ${type}`;
  el.textContent = text;
  el.hidden = !text;
}

function readStoredMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeMode(mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}

async function init() {
  const { context, token, actions } = await DA_SDK;
  const select = document.getElementById('asset-delivery-mode');
  const hint = document.getElementById('asset-delivery-hint');
  const host = document.getElementById('asset-delivery-selector');

  const get = await fetchSiteConfig(context.org, context.repo || context.site, token);
  const config = buildConfig(get);

  const stored = readStoredMode();
  select.value = MODES[stored] ? stored : config.defaultMode;

  try {
    await loadScript(ASSET_SELECTOR_URL);
  } catch {
    host.textContent = '';
    showMessage(MESSAGES.selectorFailed);
    return;
  }

  const handleSelection = (assets) => {
    const [asset] = assets || [];
    if (!asset) return;
    const mode = select.value;
    const result = resolveSelection(asset, mode, config);
    if (result.error) {
      showMessage(result.error);
      return;
    }
    showMessage('');
    actions.sendHTML(result.html);
    actions.closeLibrary();
  };

  const render = () => {
    const mode = select.value;
    hint.textContent = MODES[mode].hint;
    showMessage('');
    // A fresh mount point per mode so the selector re-initialises with new filters.
    host.textContent = '';
    const mount = document.createElement('div');
    mount.style.height = '100%';
    host.append(mount);
    const props = {
      imsToken: token,
      repositoryId: config.repositoryId,
      aemTierType: 'author',
      featureSet: mode === 'dm'
        ? ['upload', 'collections', 'detail-panel', 'dynamic-media']
        : ['upload', 'collections', 'detail-panel'],
      handleSelection,
      onClose: () => actions.closeLibrary(),
      ...(mode === 'dm' ? approvedOnlyFilterProps() : {}),
    };
    window.PureJSSelectors.renderAssetSelector(mount, props);
  };

  select.addEventListener('change', () => {
    storeMode(select.value);
    render();
  });
  render();
}

if (!window.ASSET_DELIVERY_TEST) init();
