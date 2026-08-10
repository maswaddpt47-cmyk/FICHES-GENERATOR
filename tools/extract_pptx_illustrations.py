"""
Étape 1 du workflow bibliothèque d'illustrations : extrait du PPTX source la liste
des images utilisées (ppt/media/*), dédupliquées par référence, avec leur contexte
(slide, titre, rôle détecté, taille affichée, paire raster/vecteur si icône Office).

Usage :
    python3 extract_pptx_illustrations.py chemin/vers/source.pptx dossier_de_sortie/

Produit dossier_de_sortie/candidates.json — une liste de candidats à trier à la main
(voir assets/library/README.md) : ce script ne classe pas les images, il ne fait que
dresser l'inventaire pour éviter de rouvrir le zip à chaque fois.
"""
import re, os, sys, json, zipfile, shutil, tempfile


def rel_map(rels_xml):
    return dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels_xml))


def classify_role(title, idx):
    t = title.lower()
    if idx == 0:
        return 'titre'
    for w in ['programme', 'au menu', 'sommaire', 'objectif']:
        if w in t:
            return 'intro'
    for w in ['chapitre', 'partie', 'module', 'étape']:
        if w in t:
            return 'chapitre'
    for w in ['démo', 'demo', 'pratique', 'exercice', 'manipulation', 'tutoriel']:
        if w in t:
            return 'demo'
    for w in ['pour aller plus loin', 'ressource', 'bilan', 'conclusion', 'récap', 'merci', 'questions fréquentes']:
        if w in t:
            return 'conclusion'
    return 'contenu'


def get_paragraphs(sp_xml):
    out = []
    for p in re.findall(r'<a:p>(.*?)</a:p>', sp_xml, re.S):
        out.append(''.join(re.findall(r'<a:t>(.*?)</a:t>', p, re.S)))
    return out


def get_shapes(slide_xml):
    shapes = []
    for sp in re.findall(r'<p:sp>.*?</p:sp>', slide_xml, re.S):
        is_title = bool(re.search(r'<p:ph[^>]*type="(title|ctrTitle)"', sp))
        shapes.append({'isTitle': is_title, 'paragraphs': get_paragraphs(sp)})
    return shapes


def get_slide_title(shapes):
    for s in shapes:
        if s['isTitle']:
            t = '\n'.join(s['paragraphs']).strip()
            if t:
                return t
    for s in shapes:
        t = '\n'.join(s['paragraphs']).strip()
        if t and len(t) < 120:
            return t.split('\n')[0].strip()
    return '(sans titre)'


def main(pptx_path, out_dir):
    work = tempfile.mkdtemp()
    with zipfile.ZipFile(pptx_path) as z:
        z.extractall(work)

    def read(path):
        with open(os.path.join(work, path), encoding='utf-8') as f:
            return f.read()

    pres = read('ppt/presentation.xml')
    pres_rels = rel_map(read('ppt/_rels/presentation.xml.rels'))
    sldids = re.findall(r'<p:sldId[^>]*r:id="(rId\d+)"', pres)
    slide_files = [pres_rels[rid] for rid in sldids]

    seen = {}  # (raster, vector) -> candidate dict, dedup across the whole deck
    for idx, sf in enumerate(slide_files):
        slide_xml = read('ppt/' + sf)
        slide_name = sf.split('/')[-1]
        rels_path = f'ppt/slides/_rels/{slide_name}.rels'
        rels = rel_map(read(rels_path)) if os.path.exists(os.path.join(work, rels_path)) else {}

        shapes = get_shapes(slide_xml)
        title = get_slide_title(shapes)
        role = classify_role(title, idx)

        for pic in re.findall(r'<p:pic>.*?</p:pic>', slide_xml, re.S):
            main_m = re.search(r'<a:blip r:embed="(rId\d+)"', pic)
            svg_m = re.search(r'<asvg:svgBlip[^>]*r:embed="(rId\d+)"', pic)
            ext_m = re.search(r'<a:ext cx="(\d+)" cy="(\d+)"', pic)
            if not main_m:
                continue
            raster = rels.get(main_m.group(1))
            vector = rels.get(svg_m.group(1)) if svg_m else None
            if not raster:
                continue
            raster = os.path.basename(raster)
            vector = os.path.basename(vector) if vector else None
            cx, cy = (int(ext_m.group(1)), int(ext_m.group(2))) if ext_m else (None, None)
            key = (raster, vector)
            if key not in seen:
                seen[key] = {
                    'raster': raster, 'vector': vector,
                    'width_in': round(cx / 914400, 2) if cx else None,
                    'height_in': round(cy / 914400, 2) if cy else None,
                    'first_slide': idx + 1, 'slide_title': title, 'role': role,
                    'usage_count': 0, 'usage_slides': [],
                }
            seen[key]['usage_count'] += 1
            if (idx + 1) not in seen[key]['usage_slides']:
                seen[key]['usage_slides'].append(idx + 1)

    os.makedirs(out_dir, exist_ok=True)
    media_out = os.path.join(out_dir, 'media')
    os.makedirs(media_out, exist_ok=True)
    for raster, vector in seen:
        shutil.copy(os.path.join(work, 'ppt/media', raster), os.path.join(media_out, raster))
        if vector:
            shutil.copy(os.path.join(work, 'ppt/media', vector), os.path.join(media_out, vector))

    with open(os.path.join(out_dir, 'candidates.json'), 'w', encoding='utf-8') as f:
        json.dump(list(seen.values()), f, ensure_ascii=False, indent=2)

    shutil.rmtree(work)
    print(f"{len(seen)} images candidates -> {out_dir}/candidates.json (+ {out_dir}/media/)")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
