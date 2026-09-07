# zatto single-tab PV

A 20-second product video showing CLI additions and GUI navigation in
one browser tab: list, folders, and full-text search.

- English video: `zatto-pv.mp4`.
- Japanese video: `zatto-pv-ja.mp4`.
- Both videos: 1920 × 1080, 30 fps, H.264, silent.
- README posters: `zatto-pv-poster.jpg` and `zatto-pv-ja-poster.jpg`.
- Storyboard: `timeline.html` (the approved pre-production plan).
- Contact sheets: `storyboard.jpg` (English) and `storyboard-ja.jpg` (Japanese),
  with one frame per second from each rendered video.
- Source: `video/single-tab/` from the repository root.
- Compositions: `ZattoPv` (English) and `ZattoPvJa` (Japanese).

Render from the repository root:

```sh
pnpm video:render
```

The interface is a deterministic Remotion reconstruction, with illustrative
documents and timed cursor actions. It is not a live screen recording. The CLI
scene runs `npx @yuske-nakajima/zatto report.html` against an existing viewer
session. The package is assumed to be cached so the sequence focuses on adding
the file rather than the initial package download.

Use `pnpm video:render:en` or `pnpm video:render:ja` to render one language.
The shared source controls both versions; only the promotional copy is localized.
