# zatto single-tab PV

A 25-second product video: an AI agent writes a Markdown plan that arrives in
one browser tab, the reader comments on a sentence, and the AI replies and edits
the line. It ends with folders, another file, and full-text search.

- Feature tours: `zatto-pv-tour.mp4` (English) and `zatto-pv-tour-ja.mp4`
  (Japanese), 40 seconds. They share the first 17 seconds with the product
  video, then show task lists, the CLI, favorites, folders, search, and
  workspaces. Render them with `pnpm video:render:tour`.
- English video: `zatto-pv.mp4`.
- Japanese video: `zatto-pv-ja.mp4`.
- Both videos: 1920 × 1080, 30 fps, H.264, silent.
- README animations: `zatto-pv.gif` and `zatto-pv-ja.gif`, 800 × 450,
  15 fps, infinite loop, with Bayer dithering at scale 5.
- Still posters: `zatto-pv-poster.jpg` and `zatto-pv-ja-poster.jpg`, the frame
  at 16 seconds where the AI's reply arrives.
- Contact sheets: `storyboard.jpg` (English) and `storyboard-ja.jpg` (Japanese),
  with one frame per second from each rendered video, five by five.
- Source: `video/single-tab/` from the repository root.
- Compositions: `ZattoPv` (English) and `ZattoPvJa` (Japanese); tours are
  `ZattoPvTour` and `ZattoPvTourJa`.

Render from the repository root:

```sh
pnpm video:render
```

The interface is a deterministic Remotion reconstruction, with illustrative
documents, review thread and timed cursor actions. It is not a live screen
recording. The terminal shows a generic AI agent rather than a specific product.

Use `pnpm video:render:en` or `pnpm video:render:ja` to render one language.
The shared source controls both versions; the promotional copy, the filmed
plan, and the review thread are localized.

Generate the README animations from the MP4s using FFmpeg from the repository
root. Each animation links to its full-resolution MP4. This conversion reads
the MP4s and writes only GIF files:

```sh
for video_name in zatto-pv zatto-pv-ja; do
  ffmpeg -y -i "media/${video_name}.mp4" \
    -filter_complex '[0:v]fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle' \
    -loop 0 "media/${video_name}.gif"
done
```

Generate the posters and contact sheets the same way:

```sh
for video_name in zatto-pv zatto-pv-ja; do
  ffmpeg -y -ss 16 -i "media/${video_name}.mp4" -frames:v 1 -q:v 3 "media/${video_name}-poster.jpg"
done
ffmpeg -y -i media/zatto-pv.mp4 -vf "fps=1,scale=384:-1,tile=5x5" -frames:v 1 -q:v 4 media/storyboard.jpg
ffmpeg -y -i media/zatto-pv-ja.mp4 -vf "fps=1,scale=384:-1,tile=5x5" -frames:v 1 -q:v 4 media/storyboard-ja.jpg
```
