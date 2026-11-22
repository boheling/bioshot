#!/bin/sh
# Test media for the M0 spike: every frame carries its own number twice, once as digits (testsrc2
# prints them) and once as a strip of black and white blocks along the bottom, bit 0 on the left,
# so a script can read which source frame ended up in which output frame.
set -e
cd "$(dirname "$0")"
S=scenes

# count30.mp4 / count24.mp4: 1920x1080, 6 s, all-intra, 10-bit strip 120 px high at the bottom
for fps in 30 24; do
  ffmpeg -v error -y \
    -f lavfi -i "testsrc2=size=1920x1080:rate=$fps:duration=6" \
    -f lavfi -i "color=black:size=10x1:rate=$fps:duration=6,format=gray,geq=lum='255*mod(floor(N/pow(2,X)),2)',scale=1920:120:flags=neighbor" \
    -filter_complex "[0][1]overlay=0:H-h" \
    -c:v libx264 -g 1 -crf 16 -pix_fmt yuv420p "count$fps.mp4"
done

# count30a.webm: 600x600 VP9 with alpha. An orange disc on nothing; a strip of blocks across its middle.
ffmpeg -v error -y \
  -f lavfi -i "color=black:size=600x600:rate=30:duration=6,format=rgba,geq=r='255':g='150':b='20':a='255*lt(hypot(X-300,Y-300),280)'" \
  -f lavfi -i "color=black:size=8x1:rate=30:duration=6,format=gray,geq=lum='255*mod(floor(N/pow(2,X)),2)',scale=400:60:flags=neighbor" \
  -filter_complex "[0][1]overlay=100:270" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 0 -crf 20 -g 1 count30a.webm

cp count30.mp4 $S/a-basic/assets/
cp count30.mp4 $S/b-offset/assets/
cp count30.mp4 $S/c-rate/assets/
cp count30.mp4 $S/d-loop/assets/
cp count30a.webm $S/e-alpha/assets/
rm count30.mp4 count30a.webm
mkdir -p $S/f-24/assets && mv count24.mp4 $S/f-24/assets/
ls -la $S/*/assets
