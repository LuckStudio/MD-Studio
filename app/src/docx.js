import { loadVendor } from './enhance.js';

// ═══════════════════════════════════════════════════
// EXPORTAR A WORD (.docx) SIN SERVIDOR
// ═══════════════════════════════════════════════════
// Recorre el HTML ya renderizado (el mismo que el export a HTML) y escribe WordprocessingML a mano:
// títulos, párrafos, negrita/cursiva/tachado/código, enlaces, listas (con numeración real),
// citas y avisos, bloques de código, tablas, imágenes (también diagramas Mermaid rasterizados) y
// fórmulas (como texto TeX). Se empaqueta con fflate (carga perezosa).
export const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
export const xesc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const MAX_IMG_EMU = 5486400;         // 6 pulgadas

export function dataUriToBytes(uri) {
  const m = uri.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}
export const loadImage = uri => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });

// SVG (Mermaid) → PNG
export async function svgToPng(svg) {
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  let w = vb[2] || parseFloat(svg.getAttribute('width')) || 600, h = vb[3] || parseFloat(svg.getAttribute('height')) || 400;
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  clone.removeAttribute('style');
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)));
  const canvas = document.createElement('canvas');
  canvas.width = w * 2; canvas.height = h * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  return { type: 'image/png', bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

export async function buildDocx(root, title) {
  await loadVendor('vendor/fflate.min.js');
  const rels = [];          // { id, type, target, external }
  const media = [];         // { name, bytes, type }
  const nums = [];          // numeraciones con reinicio (una por lista ordenada)
  let rid = 10, drawId = 1;
  const addRel = (type, target, external) => { const id = 'rId' + (rid++); rels.push({ id, type, target, external }); return id; };

  async function pictureXml(bytes, type, w, h, alt) {
    const ext = type.includes('png') ? 'png' : type.includes('jpeg') || type.includes('jpg') ? 'jpeg' : type.includes('gif') ? 'gif' : 'png';
    const name = `image${media.length + 1}.${ext === 'jpeg' ? 'jpg' : ext}`;
    media.push({ name, bytes, type: ext === 'jpeg' ? 'jpeg' : ext });
    const id = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/' + name);
    let cx = Math.round(w * 9525), cy = Math.round(h * 9525);
    if (cx > MAX_IMG_EMU) { cy = Math.round(cy * MAX_IMG_EMU / cx); cx = MAX_IMG_EMU; }
    const n = drawId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Imagen ${n}" descr="${xesc(alt || '')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  const run = (text, f = {}) => {
    const pr = (f.b ? '<w:b/>' : '') + (f.i ? '<w:i/>' : '') + (f.s ? '<w:strike/>' : '') +
      (f.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:shd w:val="clear" w:color="auto" w:fill="F3EFE9"/>' : '') +
      (f.link ? '<w:rStyle w:val="Hyperlink"/>' : '') + (f.sup ? '<w:vertAlign w:val="superscript"/>' : '') + (f.color ? `<w:color w:val="${f.color}"/>` : '');
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xesc(text)}</w:t></w:r>`;
  };

  async function inline(node, f = {}) {
    let out = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { out += run(c.nodeValue.replace(/\s+/g, ' '), f); continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName.toLowerCase();
      if (t === 'strong' || t === 'b') out += await inline(c, { ...f, b: true });
      else if (t === 'em' || t === 'i') out += await inline(c, { ...f, i: true });
      else if (t === 'del' || t === 's') out += await inline(c, { ...f, s: true });
      else if (t === 'sup') out += await inline(c, { ...f, sup: true });
      else if (t === 'code') out += run(c.textContent, { ...f, code: true });
      else if (t === 'br') out += '<w:r><w:br/></w:r>';
      else if (t === 'input') out += run(c.checked || c.hasAttribute('checked') ? '☑ ' : '☐ ', f);
      else if (t === 'a') {
        const href = c.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) out += `<w:hyperlink r:id="${addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', href, true)}">${await inline(c, { ...f, link: true })}</w:hyperlink>`;
        else out += await inline(c, f);
      } else if (t === 'img') {
        const src = c.getAttribute('src') || '';
        const d = src.startsWith('data:') ? dataUriToBytes(src) : null;
        if (d && /^image\/(png|jpeg|jpg|gif)$/.test(d.type)) {
          try { const im = await loadImage(src); out += await pictureXml(d.bytes, d.type, im.naturalWidth, im.naturalHeight, c.getAttribute('alt')); continue; } catch (e) { /* alt */ }
        }
        out += run('[' + (c.getAttribute('alt') || 'imagen') + ']', { ...f, i: true });
      } else if (c.classList && c.classList.contains('math-inline')) out += run('$' + (c.dataset.tex || '') + '$', { ...f, code: true });
      else out += await inline(c, f);
    }
    return out;
  }

  const para = (inner, style, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${inner}</w:p>`;

  async function blocks(parent, ctx = {}) {
    let out = '';
    for (const n of parent.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) out += para(run(n.nodeValue.trim()), ctx.style); continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(t)) out += para(await inline(n), 'Heading' + t[1]);
      else if (t === 'p') out += para(await inline(n), ctx.style);
      else if (t === 'ul' || t === 'ol') out += await list(n, 0, t === 'ol' ? newNum() : 1);
      else if (t === 'blockquote') {
        const title = n.querySelector(':scope > .callout-title');
        if (title) out += para(run(title.textContent, { b: true }), 'Quote');
        const clone = n.cloneNode(true); clone.querySelector(':scope > .callout-title')?.remove();
        out += await blocks(clone, { style: 'Quote' });
      } else if (t === 'pre') {
        for (const line of n.textContent.replace(/\n$/, '').split('\n')) out += para(run(line || ' ', { code: false }), 'Code');
      } else if (t === 'table') out += await table(n);
      else if (t === 'hr') out += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>';
      else if (n.classList.contains('mermaid-block') && n.querySelector('svg')) {
        try { const p = await svgToPng(n.querySelector('svg')); out += para(await pictureXml(p.bytes, p.type, p.w, p.h, 'Diagrama'), '', '<w:jc w:val="center"/>'); }
        catch (e) { out += para(run('[Diagrama]', { i: true })); }
      } else if (n.classList.contains('math-block')) out += para(run(n.dataset.tex || n.textContent, { code: true }), '', '<w:jc w:val="center"/>');
      else if (n.classList.contains('frontmatter')) continue;
      else if (t === 'img') out += para(await inline({ childNodes: [n] }), ctx.style);
      else out += await blocks(n, ctx);
    }
    return out;
  }

  function newNum() { nums.push(nums.length + 3); return nums[nums.length - 1]; }    // ids ≥ 3: 1 = viñetas, 2 = decimal base
  async function list(ul, depth, numId) {
    let out = '';
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue;
      const nested = [...li.children].filter(c => /^(UL|OL)$/.test(c.tagName));
      const copy = li.cloneNode(true); copy.querySelectorAll(':scope > ul, :scope > ol').forEach(x => x.remove());
      out += para(await inline(copy), 'ListParagraph', `<w:numPr><w:ilvl w:val="${Math.min(depth, 4)}"/><w:numId w:val="${numId}"/></w:numPr>`);
      for (const nl of nested) out += await list(nl, depth + 1, nl.tagName === 'OL' ? newNum() : 1);
    }
    return out;
  }

  async function table(tb) {
    const rows = [...tb.rows];
    const cols = Math.max(...rows.map(r => r.cells.length));
    const colW = Math.floor(9026 / cols);
    let out = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + colW + '"/>'.repeat(cols)}</w:tblGrid>`;
    for (const r of rows) {
      out += '<w:tr>';
      for (const c of r.cells) {
        const head = c.tagName === 'TH';
        const al = { center: 'center', right: 'right', left: 'left' }[c.getAttribute('align') || ''];
        out += `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F3EFE9"/>' : ''}</w:tcPr>` +
               para(await inline(c, head ? { b: true } : {}), '', al ? `<w:jc w:val="${al}"/>` : '') + '</w:tc>';
      }
      out += '</w:tr>';
    }
    return out + '</w:tbl><w:p/>';
  }

  const bodyXml = await blocks(root);
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${bodyXml}${sect}</w:body></w:document>`;

  const lvl = (i, fmt, text, left) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>' : ''}</w:lvl>`;
  const bulletLvls = [0, 1, 2, 3, 4].map(i => lvl(i, 'bullet', '', 720 + i * 360)).join('');
  const decLvls = [0, 1, 2, 3, 4].map(i => lvl(i, i % 2 ? 'lowerLetter' : 'decimal', `%${i + 1}.`, 720 + i * 360)).join('');
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${bulletLvls}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${decLvls}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>` +
    nums.map(id => `<w:num w:numId="${id}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('') + '</w:numbering>';

  const hs = [[1, 32], [2, 28], [3, 24], [4, 22], [5, 22], [6, 22]].map(([n, sz]) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="2A2622"/><w:sz w:val="${sz}"/></w:rPr></w:style>`).join('');
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' + hs +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="CF6A4C"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:color w:val="5C544C"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F6F2EC"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="120" w:right="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="B5472B"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join('') +
    '</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${xesc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('') + '</Relationships>';
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title)}</dc:title><dc:creator>MD Studio</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;

  const { zipSync, strToU8 } = window.fflate;
  const files = {
    '[Content_Types].xml': strToU8(contentTypes), '_rels/.rels': strToU8(rootRels), 'docProps/core.xml': strToU8(core),
    'word/document.xml': strToU8(documentXml), 'word/styles.xml': strToU8(stylesXml), 'word/numbering.xml': strToU8(numberingXml),
    'word/_rels/document.xml.rels': strToU8(relsXml),
  };
  media.forEach(m => { files['word/media/' + m.name] = m.bytes; });
  return zipSync(files, { level: 6 });
}
