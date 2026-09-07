# zatto single-tab PV

A 20-second Japanese product video showing CLI additions and GUI navigation in
one browser tab: list, folders, and full-text search.

- Video: `zatto-pv.mp4` (1920 × 1080, 30 fps, H.264, silent).
- Storyboard: `timeline.html` (the approved pre-production plan).
- Contact sheet: `storyboard.jpg` (one frame per second from the rendered video).
- Source: `video/single-tab/` from the repository root.
- Composition: `ZattoSingleTab`.

Render from the repository root:

```sh
pnpm video:render:v2
```

The interface is a deterministic Remotion reconstruction, with illustrative
documents and timed cursor actions. It is not a live screen recording. The CLI
scene runs `npx @yuske-nakajima/zatto report.html` against an existing viewer
session. The package is assumed to be cached so the sequence focuses on adding
the file rather than the initial package download.

The original `media/zatto-demo.mp4` and `media/zatto-demo.gif` remain available.

Validation: the MP4 decodes successfully and contains 600 frames over 20 seconds.
The project typecheck, focused Biome checks, and all 384 tests passed. CLI-to-GUI
addition, folder navigation, and full-text results were also observed in an
isolated running application session.
