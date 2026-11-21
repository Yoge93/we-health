/*
 * DA properties panel for the Dynamic Media(Image) block.
 *
 * DA counterpart of the Universal Editor block "dynamic-media-image":
 * - The fields, labels, options, descriptions and the Border Settings condition come from
 *   the UE model in /component-models.json (id "dynamic-media-image"); nothing is redefined.
 * - The Image field opens the AEM Assets selector configured like the UE Configurable Asset
 *   Picker (custom-asset-namespace:custom-asset): repoNames/aemTierType/filterSchema from
 *   dynamic-media-image.config.json, so the selector shows the same repository dropdown
 *   (delivery = approved Dynamic Media assets, author = all assets).
 * - The block is written in the row order the UE block renders and decorateDMImages() reads.
 *
 * The panel only works when the cursor is inside a dynamic-media-image block (New Authoring:
 * live document + block replacement). Anywhere else it shows a notice and no picker.
 */
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

export const BLOCK_NAME = 'dynamic-media-image';
const MODEL_ID = 'dynamic-media-image';
const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';
const CONFIG_URL = new URL('./dynamic-media-image.config.json', import.meta.url).href;
const NON_BLOCKS = new Set(['metadata', 'section-metadata', 'library-metadata']);
const REPO_REL = 'http://ns.adobe.com/adobecloud/rel/repository';
const DEBOUNCE_MS = 500;

export const MESSAGES = {
  notInBlock: 'Place the cursor inside a Dynamic Media(Image) block to edit its properties. Add one from Library → Blocks.',
  unsupported: 'Editing Dynamic Media(Image) properties needs New Authoring. Turn on "New Authoring" (top right) and open this panel from Panels → Extensions.',
  readOnly: 'This page is read-only.',
  notPublished: 'This author asset is not published. The block stores its publish URL, which works once the asset is published.',
  selectorFailed: 'The AEM Assets selector could not be loaded.',
};

/* ---------- UE model helpers (pure, exported for tests) ---------- */

/** UE model as row fields: containers expand, `<name>Title` collapses into `<name>`. */
export function getRowFields(model) {
  const flat = [];
  model.fields.forEach((field) => {
    if (field.component === 'container') flat.push(...field.fields);
    else flat.push(field);
  });
  const names = new Set(flat.map((f) => f.name));
  return flat.filter((f) => !(f.name.endsWith('Title') && names.has(f.name.slice(0, -5))));
}

/** Minimal JSON-logic for UE field conditions ({"==": [{"var": "preset"}, "border"]}). */
export function evaluateCondition(condition, values) {
  if (!condition) return true;
  const resolve = (arg) => (arg && typeof arg === 'object' && 'var' in arg ? values[arg.var] : arg);
  if (condition['==']) {
    const [a, b] = condition['=='].map(resolve);
    // eslint-disable-next-line eqeqeq
    return a == b;
  }
  if (condition['!=']) {
    const [a, b] = condition['!='].map(resolve);
    // eslint-disable-next-line eqeqeq
    return a != b;
  }
  return true;
}

export function defaultValues(model) {
  const values = {};
  const visit = (fields) => fields.forEach((f) => {
    if (f.fields) { visit(f.fields); return; }
    let value = f.value ?? '';
    if (f.component === 'boolean') value = f.value === true || f.value === 'true';
    if (f.component === 'select' && !f.options.some((o) => o.value === value)) value = f.options[0]?.value ?? '';
    values[f.name] = value;
  });
  visit(model.fields);
  return values;
}

/* ---------- block <-> values ---------- */

export function firstClass(el) {
  return (el?.getAttribute('class') || '').trim().split(/\s+/)[0] || '';
}

/** Blocks in the live <main>, in the same order as DA's selection.blockIndex. */
export function listBlocks(main) {
  return [...main.children]
    .filter((section) => section.tagName === 'DIV')
    .flatMap((section) => [...section.children])
    .filter((el) => el.tagName === 'DIV' && firstClass(el)
      && !NON_BLOCKS.has(firstClass(el)) && firstClass(el) !== 'default-content-wrapper');
}

export function findSelectedBlock(html, blockIndex, parse) {
  if (!Number.isInteger(blockIndex) || blockIndex < 0) return null;
  const doc = parse(html);
  const main = doc.querySelector('main') || doc.body;
  return listBlocks(main)[blockIndex] || null;
}

export function readBlock(block, model) {
  const values = defaultValues(model);
  const fields = getRowFields(model);
  const rows = [...block.children];
  fields.forEach((field, i) => {
    const cell = rows[i]?.firstElementChild || rows[i];
    if (!cell) return;
    if (field.name === 'image') {
      const link = cell.querySelector('a[href]');
      const image = cell.querySelector('img[src]');
      values.image = link?.getAttribute('href') || image?.getAttribute('src') || '';
      values.imageTitle = link?.getAttribute('title') || image?.getAttribute('alt') || '';
      return;
    }
    const text = cell.textContent.trim();
    if (field.component === 'boolean') values[field.name] = text === 'true';
    else values[field.name] = text;
  });
  if (!values['custom-class']) {
    values['custom-class'] = (block.getAttribute('class') || '').split(/\s+/)
      .filter((c) => c && c !== BLOCK_NAME).join(' ');
  }
  return values;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function toClassList(value = '') {
  return value.split(/\s+/).map((c) => c.toLowerCase().replace(/[^a-z0-9-_]/g, '')).filter(Boolean);
}

/** Builds the block in the row order of the UE block (image row first, then one row per field). */
export function buildBlockHtml(values, model) {
  const fields = getRowFields(model);
  const rows = fields.map((field) => {
    if (field.name === 'image') {
      const href = values.image;
      if (!href) return '<div><div></div></div>';
      const title = values.imageTitle ? ` title="${escapeHtml(values.imageTitle)}"` : '';
      // a[data-edit-as] shows as an image while editing and is published as a link,
      // which is what decorateDMImages() turns into a Dynamic Media <picture>.
      return `<div><div><a href="${escapeHtml(href)}"${title} data-edit-as="image">${escapeHtml(href)}</a></div></div>`;
    }
    const value = values[field.name];
    const text = field.component === 'boolean' ? String(value === true) : (value ?? '');
    return `<div><div>${escapeHtml(text)}</div></div>`;
  });
  const classes = [BLOCK_NAME, ...toClassList(values['custom-class'])];
  return `<div class="${classes.join(' ')}">${rows.join('')}</div>`;
}

/* ---------- asset selection (same outcome as the UE custom asset picker) ---------- */

export function getRepositoryId(repo) {
  return repo?.['repo:repositoryId']
    // eslint-disable-next-line no-underscore-dangle
    || repo?._embedded?.[REPO_REL]?.['repo:repositoryId']
    || repo?.repositoryId
    || '';
}

function getSeoName(name = '') {
  return name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
}

export function resolveAssetValue(asset, config) {
  const mimetype = (asset.mimetype || asset['dc:format'] || '').toLowerCase();
  const repositoryId = asset['repo:repositoryId'] || '';
  const isDelivery = repositoryId.startsWith('delivery-') || (!!asset['repo:assetId'] && !asset.path);
  const name = asset['repo:name'] || asset.name || '';
  // eslint-disable-next-line no-underscore-dangle
  const meta = asset._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset'] || {};
  const titleValue = asset['dc:title'];
  const alt = meta['dc:description'] || meta['dc:title']
    || (typeof titleValue === 'object' ? titleValue?.['o:default'] : titleValue) || '';

  if (isDelivery) {
    const host = repositoryId || config.repoNames.find((r) => r.startsWith('delivery-'));
    const id = asset['repo:assetId'] || asset['repo:id'];
    const base = `https://${host}/adobe/assets/${id}`;
    const url = mimetype.startsWith('image/')
      ? `${base}/as/${encodeURIComponent(getSeoName(name))}.${(name.split('.').pop() || 'jpg').toLowerCase()}`
      : `${base}/original/as/${encodeURIComponent(name)}`;
    return { url, alt, tier: 'delivery' };
  }
  const authorHost = repositoryId || config.repoNames.find((r) => r.startsWith('author-'));
  const publishHost = config.publishHost || authorHost.replace(/^author-/, 'publish-');
  const path = (asset.path || '').split('/').map(encodeURIComponent).join('/');
  const published = (asset.isPublishedToAemPublish ?? asset['aem:published']) === true;
  return {
    url: `https://${publishHost}${path}`, alt, tier: 'author', published,
  };
}

/* ---------- UI ---------- */

const $ = (id) => document.getElementById(id);

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

function setStatus(text, type = 'info') {
  const el = $('dmi-status');
  el.textContent = text;
  el.dataset.type = type;
}

function showNotice(text) {
  $('dmi-form').hidden = true;
  $('dmi-picker').hidden = true;
  const notice = $('dmi-notice');
  notice.textContent = text;
  notice.hidden = false;
}

function fieldId(name) {
  return `dmi-field-${name}`;
}

function renderField(field) {
  const wrap = document.createElement('div');
  wrap.className = `dmi-field dmi-field-${field.component.replace(/[^a-z]/gi, '-')}`;
  wrap.dataset.name = field.name;
  const id = fieldId(field.name);
  const description = field.description ? `<p class="dmi-help" id="${id}-help">${escapeHtml(field.description)}</p>` : '';
  const describedBy = field.description ? ` aria-describedby="${id}-help"` : '';

  if (field.component.endsWith(':custom-asset')) {
    wrap.innerHTML = `<span class="dmi-label">${escapeHtml(field.label)}</span>
      <div class="dmi-asset">
        <div class="dmi-asset-preview" id="${id}-preview"></div>
        <p class="dmi-asset-url" id="${id}-url"></p>
        <div class="dmi-asset-actions">
          <button type="button" class="dmi-btn dmi-btn-primary" id="${id}-select">Select asset</button>
          <button type="button" class="dmi-btn" id="${id}-clear">Clear</button>
        </div>
      </div>${description}`;
  } else if (field.component === 'boolean') {
    wrap.innerHTML = `<label class="dmi-switch" for="${id}">
      <input type="checkbox" role="switch" id="${id}" name="${field.name}"${describedBy}>
      <span>${escapeHtml(field.label)}</span></label>${description}`;
  } else if (field.component === 'select') {
    const options = field.options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.name)}</option>`).join('');
    wrap.innerHTML = `<label class="dmi-label" for="${id}">${escapeHtml(field.label)}</label>
      <select id="${id}" name="${field.name}"${describedBy}>${options}</select>${description}`;
  } else if (field.component === 'container') {
    wrap.innerHTML = `<fieldset><legend>${escapeHtml(field.label)}</legend></fieldset>`;
    const set = wrap.querySelector('fieldset');
    field.fields.forEach((child) => set.append(renderField(child)));
  } else {
    wrap.innerHTML = `<label class="dmi-label" for="${id}">${escapeHtml(field.label)}</label>
      <input type="text" id="${id}" name="${field.name}"${describedBy}>${description}`;
  }
  if (field.condition) wrap.dataset.condition = JSON.stringify(field.condition);
  return wrap;
}

async function init() {
  const { token, actions, capabilities = {} } = await DA_SDK;
  const form = $('dmi-form');

  const [model, config] = await Promise.all([
    fetch('/component-models.json').then((r) => r.json()).then((all) => all.find((m) => m.id === MODEL_ID)),
    fetch(CONFIG_URL).then((r) => r.json()),
  ]);
  if (!model) {
    showNotice('The Dynamic Media(Image) model was not found in /component-models.json.');
    return;
  }

  if (capabilities.liveDocument !== 1 || capabilities.sendHTMLReplace !== 1
    || typeof actions.subscribeLiveDocument !== 'function') {
    showNotice(MESSAGES.unsupported);
    return;
  }

  model.fields.forEach((field) => form.append(renderField(field)));

  let snapshot = null;
  let editingIndex = null;
  let values = defaultValues(model);
  let timer;
  let writing = Promise.resolve();
  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  const syncConditions = () => {
    form.querySelectorAll('[data-condition]').forEach((el) => {
      el.hidden = !evaluateCondition(JSON.parse(el.dataset.condition), values);
    });
  };
  syncConditions();

  const showImage = () => {
    const id = fieldId('image');
    const preview = $(`${id}-preview`);
    $(`${id}-url`).textContent = values.image || 'No asset selected';
    preview.textContent = '';
    if (values.image) {
      const img = document.createElement('img');
      img.alt = values.imageTitle || '';
      img.src = values.image.includes('/adobe/assets/') ? `${values.image}?width=400` : values.image;
      img.onerror = () => img.remove();
      preview.append(img);
    }
  };

  const fillForm = () => {
    Object.entries(values).forEach(([name, value]) => {
      const input = form.elements.namedItem(name);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = value === true;
      else input.value = value ?? '';
    });
    showImage();
    syncConditions();
  };

  const write = () => {
    writing = writing.then(async () => {
      if (!snapshot || editingIndex === null) return;
      const html = buildBlockHtml(values, model);
      setStatus('Saving…');
      let result = await actions.sendHTML(html, {
        replace: true,
        expected: { html: snapshot.html, blockIndex: editingIndex },
      });
      if (!result.ok && result.error === 'STALE_LIVE') {
        await new Promise((r) => { setTimeout(r, 300); });
        result = await actions.sendHTML(html, {
          replace: true,
          expected: { html: snapshot.html, blockIndex: editingIndex },
        });
      }
      if (result.ok) {
        if (result.html) snapshot = { html: result.html, selection: result.selection };
        setStatus('Saved', 'ok');
      } else {
        setStatus(`Not saved: ${result.message || result.error}`, 'error');
      }
    });
    return writing;
  };

  const scheduleWrite = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(write, delay);
  };

  form.addEventListener('input', (e) => {
    const { name, type } = e.target;
    if (!name) return;
    values[name] = type === 'checkbox' ? e.target.checked : e.target.value;
    syncConditions();
    scheduleWrite(e.target.tagName === 'INPUT' && type === 'text' ? DEBOUNCE_MS : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  /* image field: the UE custom asset picker equivalent */
  const pickerHost = $('dmi-picker-host');
  const closePicker = () => {
    $('dmi-picker').hidden = true;
    pickerHost.textContent = '';
  };
  $('dmi-picker-close').addEventListener('click', closePicker);
  $(`${fieldId('image')}-clear`).addEventListener('click', () => {
    values.image = '';
    showImage();
    scheduleWrite(0);
  });
  $(`${fieldId('image')}-select`).addEventListener('click', async () => {
    try {
      await loadScript(ASSET_SELECTOR_URL);
    } catch {
      setStatus(MESSAGES.selectorFailed, 'error');
      return;
    }
    $('dmi-picker').hidden = false;
    pickerHost.textContent = '';
    const mount = document.createElement('div');
    mount.className = 'dmi-picker-mount';
    pickerHost.append(mount);
    const allowed = new Set(config.repoNames);
    window.PureJSSelectors.renderAssetSelector(mount, {
      imsToken: token,
      aemTierType: config.aemTierType,
      // no fixed repositoryId: the selector then shows its repository dropdown (rail)
      rail: true,
      filterRepoList: (repos) => {
        const filtered = (repos || []).filter((repo) => allowed.has(getRepositoryId(repo)));
        return filtered.length ? filtered : repos;
      },
      filterSchema: config.filterSchema,
      featureSet: ['upload', 'collections', 'detail-panel', 'dynamic-media'],
      onClose: closePicker,
      handleSelection: (assets) => {
        const [asset] = assets || [];
        if (!asset) return;
        const picked = resolveAssetValue(asset, config);
        values.image = picked.url;
        if (!values.imageTitle && picked.alt) values.imageTitle = picked.alt;
        closePicker();
        fillForm();
        if (picked.tier === 'author' && !picked.published) setStatus(MESSAGES.notPublished, 'warn');
        scheduleWrite(0);
      },
    });
  });

  /* follow the cursor: the panel is only active inside a dynamic-media-image block */
  actions.subscribeLiveDocument((next) => {
    snapshot = next;
    const block = findSelectedBlock(next.html, next.selection?.blockIndex, parse);
    if (!block || firstClass(block) !== BLOCK_NAME) {
      editingIndex = null;
      showNotice(MESSAGES.notInBlock);
      return;
    }
    if (next.editable === false) {
      editingIndex = null;
      showNotice(MESSAGES.readOnly);
      return;
    }
    $('dmi-notice').hidden = true;
    form.hidden = false;
    if (editingIndex !== next.selection.blockIndex) {
      editingIndex = next.selection.blockIndex;
      values = readBlock(block, model);
      fillForm();
      setStatus('');
    }
  });
}

if (!window.DMI_TEST) init();
