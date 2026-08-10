/* ════════════════════════════════════════════════════════════
   Lecture PPTX (JSZip + parsing XML minimal) et primitives de dessin
   pptxgenjs partagées entre les outils de ce repo (fichegenerator.html,
   fusion-charte.html). Toute fonction ici doit rester générique — le
   contenu spécifique à un outil (mise en page, timing, etc.) reste dans
   son propre fichier.
   ════════════════════════════════════════════════════════════ */

async function parsePptx(file){
  const zip = await JSZip.loadAsync(file);
  const presEntry = zip.file('ppt/presentation.xml');
  const relsEntry = zip.file('ppt/_rels/presentation.xml.rels');
  if(!presEntry || !relsEntry) throw new Error("Fichier .pptx invalide (structure OOXML introuvable).");

  const presXml = await presEntry.async('text');
  const relsXml = await relsEntry.async('text');
  const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
  const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');

  const relMap = {};
  Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(r=>{
    relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  });

  const sldIds = Array.from(presDoc.getElementsByTagName('p:sldId'));
  if(!sldIds.length) throw new Error("Aucune slide trouvée dans le PPTX.");

  const slidePaths = sldIds.map(sid=>{
    const rid = sid.getAttribute('r:id') || sid.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const target = relMap[rid];
    if(!target) return null;
    return 'ppt/' + target.replace(/^\.?\/?/,'');
  }).filter(Boolean);

  const slides = [];
  for(let i=0;i<slidePaths.length;i++){
    const entry = zip.file(slidePaths[i]);
    if(!entry) continue;
    const xml = await entry.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    slides.push(parseSlideXml(doc, i+1));
  }
  if(!slides.length) throw new Error("Impossible de lire les slides du PPTX.");
  return slides;
}

function parseSlideXml(doc, idx){
  const spList = Array.from(doc.getElementsByTagName('p:sp'));
  const shapes = [];
  for(const sp of spList){
    let isTitle = false;
    const ph = sp.getElementsByTagName('p:ph')[0];
    if(ph){
      const type = ph.getAttribute('type');
      if(type === 'title' || type === 'ctrTitle') isTitle = true;
    }
    const txBody = sp.getElementsByTagName('p:txBody')[0];
    if(!txBody) continue;
    const paragraphs = Array.from(txBody.getElementsByTagName('a:p')).map(ap=>
      Array.from(ap.getElementsByTagName('a:t')).map(t=>t.textContent).join('')
    );
    shapes.push({ isTitle, paragraphs });
  }
  return { n: idx, shapes };
}

function getSlideTitle(slide){
  const titleShape = slide.shapes.find(s=>s.isTitle);
  if(titleShape){
    const t = titleShape.paragraphs.join('\n').trim();
    if(t) return t;
  }
  for(const s of slide.shapes){
    const t = s.paragraphs.join('\n').trim();
    if(t && t.length < 120) return t.split('\n')[0].trim();
  }
  return '(sans titre)';
}

function classifyRole(title, idx){
  const t = title.toLowerCase();
  if(idx === 0) return 'titre';
  if(['programme','au menu','sommaire','objectif'].some(w=>t.includes(w))) return 'intro';
  if(['chapitre','partie','module','étape'].some(w=>t.includes(w))) return 'chapitre';
  if(['démo','demo','pratique','exercice','manipulation','tutoriel'].some(w=>t.includes(w))) return 'demo';
  if(['pour aller plus loin','ressource','bilan','conclusion','récap','merci','questions fréquentes'].some(w=>t.includes(w))) return 'conclusion';
  return 'contenu';
}

function cleanText(text){
  return (text || '').replace(/[^\x00-\x7FÀ-ɏ‘’–—«»]/g, '').trim();
}
function trunc(t, n){ return t.length > n ? t.slice(0,n) + '…' : t; }
function normLoose(t){ return (t||'').replace(/[^a-zA-Z0-9À-ɏ_\s]/g,'').toLowerCase().trim(); }

/* ── Identité visuelle partagée (palette, police, fonds A4) ── */
const COLORS = {
  BLU:'4388BC', TEA:'187C88', SKY:'5EB3D2', ORG:'E67D21', YEL:'F8A824',
  DRK:'2B2B2B', GRY:'6E6E6D', WHT:'FFFFFF',
  BG_BLU:'ECF5FF', BG_TEA:'EBF7F6', BG_STP:'F8F9FD', BD_STP:'DDE6ED', BG_OPT:'FFF8EF', BG_CNS:'FFFCE7',
  BRN:'5D4037', BG_BSA:'FFFCE7', BG_BDA:'EBF5FF', BG_SUITE:'EFF7FF', SEP_CLR:'DDDDDD',
};
const BADGE_CYCLE = [COLORS.SKY,COLORS.BLU,COLORS.TEA,COLORS.BLU,COLORS.TEA,COLORS.SKY];
const STEP_PALETTE = [[COLORS.BLU,COLORS.BG_BLU],[COLORS.TEA,COLORS.BG_TEA]];

const CM = v => v / 2.54;
const MARGIN_PT = CM(0.05) * 72;

function rect(slide, l, t, w, h, fill, line=null, lw=0.5){
  slide.addShape('rect', {
    x:CM(l), y:CM(t), w:CM(w), h:CM(h),
    fill:{ color:fill },
    line: line ? { color:line, width:lw } : { type:'none' },
  });
}

function textbox(slide, l, t, w, h, runs){
  const items = runs.map(r=>({
    text: r.text || '',
    options: {
      fontFace:'Arial', fontSize:r.size, bold:!!r.bold, italic:!!r.italic,
      color:r.color || COLORS.DRK, align:r.align || 'left',
      breakLine: r.brk !== false,
      paraSpaceBefore: 0, paraSpaceAfter: 1,
    },
  }));
  slide.addText(items, {
    x:CM(l), y:CM(t), w:CM(w), h:CM(h),
    margin:[0, MARGIN_PT, 0, MARGIN_PT], valign:'top', wrap:true,
  });
}

function bg(slide, path){ slide.background = { path }; }
