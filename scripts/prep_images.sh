#!/bin/sh
# Re-cuts the tile artwork into assets/art/*.webp (2x the tile's art box).
# Needs ImageMagick 7. Run from the repo root: sh scripts/prep_images.sh
# Malik on Tech uses the headshot from the malikontech-site repo (src-img/avatar.jpg).
set -e
tmp=$(mktemp -d)
raw() { curl -fsSL -o "$tmp/$2" "https://raw.githubusercontent.com/TrustlessMike/$1"; }
raw Jam/HEAD/docs/brand/logo.png jam.png
raw stack-app/HEAD/docs/brand/profile-panel.png stack.png
raw Kashout/HEAD/docs/brand/logo.png kashout.png
raw art-of-battle/HEAD/docs/brand/logo.png aob.png
raw opencontroller/HEAD/docs/brand/logo.png oc.png
raw dispo-spinner/HEAD/docs/brand/logo.png dispo.png
raw vibe-guild/HEAD/public/og.png guild.png
curl -fsSL -o "$tmp/champions.png" "https://avatars.githubusercontent.com/u/340468789?v=4&s=460"
cp "${HEADSHOT:-$HOME/malikontech-site/src-img/avatar.jpg}" "$tmp/malik.jpg"

# logo <src> <out> <w> <h> <fit-percent>: trim the logo, fit it, pad with its own background
logo() {
  bg=$(magick "$tmp/$1" -format '%[pixel:p{4,4}]' info:)
  bw=$(( $3 * $5 / 100 )); bh=$(( $4 * $5 / 100 ))
  magick "$tmp/$1" -fuzz 14% -trim +repage -resize "${bw}x${bh}" \
    -background "$bg" -gravity center -extent "$3x$4" -quality 86 "assets/art/$2.webp"
}
# mono <src> <out> <w> <h> <fit-percent> <ink> <bg-top> <bg-bottom>: a dark-on-light logo re-inked for the dark grid
mono() {
  bw=$(( $3 * $5 / 100 )); bh=$(( $4 * $5 / 100 ))
  magick "$tmp/$1" -fuzz 14% -trim +repage -resize "${bw}x${bh}" -colorspace gray -negate -level 8%,70% -background black -gravity center -extent "$3x$4" "$tmp/mask.png"
  magick -size "$3x$4" "xc:$6" "$tmp/mask.png" -gravity center -alpha off -compose copy_opacity -composite "$tmp/ink.png"
  magick -size "$3x$4" "gradient:$7-$8" \( -size "$3x$4" "radial-gradient:rgba(255,255,255,0.11)-rgba(255,255,255,0)" \) -compose screen -composite \
    "$tmp/ink.png" -gravity center -compose over -composite -quality 88 "assets/art/$2.webp"
}
# cover <src> <out> <w> <h> [gravity]
cover() {
  magick "$tmp/$1" -resize "$3x$4^" -gravity "${5:-center}" -extent "$3x$4" -quality 84 "assets/art/$2.webp"
}
# the avatar has a soft vignette, so feather it into pure black instead of trimming
magick "$tmp/champions.png" -resize 196x196 -background black -vignette 0x10+4+4 -gravity center -extent 826x204 -quality 86 assets/art/open-champions.webp
mono jam.png jam 826 204 46 "#eef3ff" "#14254a" "#0a1328"
mono stack.png stack 402 204 58 "#d4fbc8" "#16301d" "#0b170f"
logo kashout.png kashout 402 204 74
logo aob.png art-of-battle 402 204 84
logo oc.png opencontroller 402 204 80
logo dispo.png dispo-spinner 402 204 86
cover guild.png vibe-guild 402 204 west
magick "$tmp/malik.jpg" -resize 402x -gravity north -crop 402x204+0+50 +repage -quality 84 assets/art/malikontech.webp
rm -rf "$tmp"
ls -l assets/art
