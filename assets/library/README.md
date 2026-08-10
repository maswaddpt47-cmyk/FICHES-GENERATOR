# Bibliothèque d'illustrations

Illustrations, icônes et gabarits extraits des PPTX fournis, pour réutilisation dans
la génération des fiches/mémos. Alimentée au fil des PPTX qu'on me remet à retraiter.

## Structure

```
assets/library/
  catalog.json        catalogue avec métadonnées (voir ci-dessous)
  illustrations/       visuels de contenu (scènes, diagrammes) — grands, ~1 par slide
  gabarits/             cadres/mockups vides (ex. carte de capture d'écran non remplie)
  icones/               pictogrammes réutilisables (compas, bouclier, coche, etc.)
```

Chaque entrée de `catalog.json` contient : `id`, `category`, `file` (chemin relatif
dans ce dossier), `format`, `source_pptx`, `first_seen_slide`, `slide_title`, `role`
(rôle de slide au sens de `fichegenerator.html` : titre/intro/chapitre/demo/contenu/
conclusion), `description` (rédigée après inspection visuelle), `tags`, et
`sha256_12` (empreinte du fichier raster d'origine, pour repérer les doublons entre
PPTX au fil du temps).

Format retenu : **SVG quand PowerPoint en fournit un** (icônes vectorielles avec
fallback PNG intégré) — le PNG de repli n'est pas conservé, seul le SVG est gardé
dans la bibliothèque. Sinon PNG brut.

## Workflow pour un nouveau PPTX

1. `python3 tools/extract_pptx_illustrations.py chemin/source.pptx dossier_tmp/`
   → dresse l'inventaire (`candidates.json` + copies dans `dossier_tmp/media/`) de
   toutes les images du PPTX avec leur contexte (slide, titre, rôle, taille, paire
   raster/vecteur), dédupliquées par référence.
2. Tri manuel (inspection visuelle de chaque candidat) : décider catégorie
   (illustration scène/diagramme vs gabarit vide vs icône générique), nom descriptif,
   description, tags — la taille affichée (`width_in`/`height_in`) aide à distinguer
   grandes illustrations (≥ ~0.5 pouce) des petits pictogrammes.
3. Avant de copier dans `assets/library/`, comparer le `sha256_12` aux entrées
   existantes de `catalog.json` pour éviter de dupliquer une icône déjà présente
   (les jeux d'icônes Office reviennent souvent identiques d'un PPTX à l'autre).
4. Copier le(s) fichier(s) retenu(s) dans le sous-dossier de catégorie, ajouter
   l'entrée correspondante à `catalog.json`.

Ce tri reste volontairement manuel à l'étape 2 : un pictogramme "bouclier" ou une
"carte vide" ne se détecte pas de façon fiable par la seule métadonnée XML — il faut
regarder l'image.

## Entrée actuelle

- Source : `B4_Demarches_administratives_en_ligne.pptx` (12 slides)
- 4 illustrations, 2 gabarits, 17 icônes
