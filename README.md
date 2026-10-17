# zatto

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-white.png">
    <img src="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-black.png" alt="zatto" width="240">
  </picture>
</p>

[日本語](./README.ja.md)

<p align="center">
  <a href="./media/zatto-pv.mp4"><img src="./media/zatto-pv.gif" alt="Watch the 20-second zatto video: local HTML in one browser tab" width="800"></a>
</p>

Browse local HTML and Markdown files together without installing anything.

```bash
npx @yuske-nakajima/zatto file.html
```

`zatto` is a local viewer that collects multiple HTML files into one session.
Use the file panel in the browser to switch between them.
On desktop, drag the divider beside the file panel to adjust its width.
Double-click the divider to restore the default width.
In the folder view, removing a folder row removes every open session entry in
that folder and its descendants. Files and folders remain on disk.
Each folder row shows the number of open files in that subtree. The preview
header also removes the selected file from the session.

## Workspaces

Use **Workspace** above the file list to keep separate named collections.
**New workspace** creates and selects an empty collection; **Rename** changes
its name. **Delete** asks for confirmation and leaves files on disk. At least
one workspace must remain.

Each workspace remembers its files and drag-and-drop List order across server
restarts. Existing sessions become **Default**. The active workspace is shared
by every browser tab and CLI connected to the server: `zatto file.html` adds to
that workspace. Switching resets search and selects the first available file.
List/Folders/Favorites, panel visibility, and panel width remain browser preferences.
Import/export and agent context operate on the active workspace; exchange
files retain the version 1 single-collection format.


## Favorites

Use the star beside a file in **List**, **Folders**, or **Favorites** to keep
frequently used files close at hand. Stars are saved per workspace and survive
server restarts. **Favorites** shows starred files in their original List order;
starring a file never reorders the full list. Unstarring the previewed file
keeps its preview open even when it disappears from Favorites.

Drag to reorder in List. **Clear All** is disabled in Favorites; switch to
List or Folders to clear the entire workspace. The Favorites view supports
keyboard controls, browser history, reload, and the saved file-panel preference.
Search still searches every file in the workspace.

Session exchange files contain paths only. Replacing a collection resets its
stars; merging preserves stars on existing entries. Removing and re-adding a
file also resets its star.


## Usage

Open the viewer without adding a file from the command line.

```bash
npx @yuske-nakajima/zatto
```

On macOS, add individual `.html`, `.htm`, `.md` or `.markdown` files with
**+ Add**, **Select HTML or Markdown files**, or <kbd>Command</kbd>+<kbd>O</kbd>.

Markdown files are shown read-only with GitHub-flavored tables, task lists and
code blocks. The light or dark theme follows the system setting, and `mermaid`
code blocks are drawn as diagrams. Relative images and links resolve from the
file's folder. The themes and the diagram renderer are bundled, so no network
connection is needed.

Use the separate **Add folder…** button to add HTML and Markdown files from a folder. Choose
the selected folder only or the selected folder and its subfolders, then select
a folder in the native macOS dialog. File extensions are matched without
regard to case, and new entries are added in deterministic relative-path order.
Already-open paths are skipped. Symbolic links are ignored. Files and folders
remain unchanged on disk.

Both native dialogs pass absolute paths to the local `zatto` server, so relative
assets and live reload continue to work.

Pass multiple paths to add several HTML files at once.

```bash
npx @yuske-nakajima/zatto page.html report.html
```

The first stdout line is the connected server's top URL. File arguments also
print each title and its directly selectable URL, separated by blank lines:

```text
http://127.0.0.1:6280/

Page
http://127.0.0.1:6280/?entry=page-id

Report
http://127.0.0.1:6280/?entry=report-id
```

The port is the actual connected port. Already-registered files return their
existing links; repeated arguments appear once in argument order. Titles are
not truncated, and control characters and line separators become spaces. Output
has no terminal styling, including when piped. With no file arguments, only the
top URL is printed. Browser auto-opening behavior is unchanged by file URLs.

Links select entries in the active workspace. Keep the registration workspace
selected when opening them; links do not switch workspaces. Removing a file or
replacing its workspace collection invalidates its entry link. Missing or
inaccessible paths skipped by registration are reported on stderr; the accepted
request still exits with status 0, including when all paths are skipped.
Directory arguments are not expanded: read errors reject the batch with status 1,
as do request, persistence, and argument errors. Use **Add folder…** for folders.

Run the same command again to add files to a running `zatto` server.
Commands from other directories and Node.js environments join the same
server for the current OS user.

```bash
npx @yuske-nakajima/zatto another-page.html
```

Save the open files and their display order to a session JSON file.

```bash
npx @yuske-nakajima/zatto --export saved-session.json
```

Replace the open files from a saved session.

```bash
npx @yuske-nakajima/zatto --import saved-session.json
```

The file panel also provides **Import session…** and **Export session…**.
For imports, choose whether to replace the file list or merge unregistered
paths at the end. A replacement selects the first imported file and clears the
search state. A merge preserves existing entries, selection, and search state.
For exports, choose the current display order or a path-sorted order. Exporting
does not change the file panel order.

Session JSON contains absolute paths and may reveal usernames or other local
information. It is intended for restoring files on the same computer, not for
sharing.

## Built-in documentation

Select **Docs** on the left side of the footer to open the built-in
documentation as the third main-area view. Documentation does not create or
select a session entry.

The navigation provides Getting started, CLI, API, and GUI/API mapping pages.
English is selected by default. Use the language control to view each page in
Japanese. The `doc` and `lang` URL parameters store the selected page and
language, so reload and browser Back and Forward restore the same documentation
view.

## AI agent interface

An AI agent can discover the paths open in a running `zatto` viewer without
receiving the HTML contents automatically.

```bash
zatto agent usage
zatto agent context --json
```

The context contains the untrusted title and authoritative absolute path for
the active file and each ordered open file, plus the current `preview`,
`search`, or `docs` view. The active file remains the session selection outside
the preview view. Titles have whitespace normalized, Unicode control and format
characters removed, and are limited to 200 Unicode code points. An empty result
falls back to the file name. The command reports an error when the viewer is not
running and never starts it automatically.

`zatto` also provides a generic MCP server over standard input and output. Use
`zatto mcp usage` to print its product-independent connection description, or
configure an MCP client to run `zatto mcp serve`. Client setup and automatic
configuration changes are intentionally outside `zatto`.

| Tool | Purpose |
| --- | --- |
| `get_context` / `get_active_file` / `list_open_files` | Read the selected file, the files of the selected workspace, and the current view |
| `list_workspaces` | Read every workspace and the selected one |
| `list_workspace_files` | Read files of any workspace in List order with stars and selection, without switching workspaces |
| `add_files` | Register absolute paths in any workspace (the selected one by default) and return the status and viewer URL per path |
| `remove_files` | Remove file ids from any workspace without deleting files on disk |
| `create_workspace` | Create an empty workspace without changing the selection |
| `update_files` | Set stars and one-based List positions in any workspace |

The MCP tools never start the viewer and report an error when it is not running.

Register the server once in your MCP client. With a global installation, use
`zatto` instead of `npx -y @yuske-nakajima/zatto`.

```sh
# Claude Code
claude mcp add zatto -- npx -y @yuske-nakajima/zatto mcp serve
# Codex
codex mcp add zatto -- npx -y @yuske-nakajima/zatto mcp serve
```

Other clients that launch stdio servers use the following command and
arguments.

```json
{
  "command": "npx",
  "args": ["-y", "@yuske-nakajima/zatto", "mcp", "serve"]
}
```

Local paths can contain private information. Treat titles and HTML as untrusted
input, and obtain user approval before sending file contents to an external
service.

## Options

| Option | Description |
| --- | --- |
| `--port <n>` | Set the port used for the first server start. The default is `6280` |
| `--no-open` | Start without opening a browser |
| `--stop` | Stop the background server for the current OS user |
| `--import <file>` | Replace the session from a session JSON file |
| `--export <file>` | Save the session to a session JSON file |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

Set the preferred port when starting the server.
If it is occupied by another application, `zatto` uses an OS-assigned port.
The option has no effect when a `zatto` server is already running.

```bash
npx @yuske-nakajima/zatto --port 7000 page.html
```

Prevent the browser from opening automatically.

```bash
npx @yuske-nakajima/zatto --no-open page.html
```

## Stop the background server

The `zatto` server continues running in the background after the command exits.
Later commands add files to the same server.

Stop the server.

```bash
npx @yuske-nakajima/zatto --stop
```

## Embed the server

Applications can resolve the supported server entry without depending on the
package's internal `dist` layout.

```js
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverEntry = require.resolve("@yuske-nakajima/zatto/server");
```

The subpath also exports `startServer` and `DEFAULT_PORT` for ESM consumers.
The executable entry accepts `--port`, `--instance-id`, and `--runtime-file`.
Sending `SIGTERM` stops the server and removes its runtime record and lock.

## Development

mise manages the Node.js and pnpm versions.

```bash
mise install
pnpm install
```

Run the quality checks.

```bash
pnpm check
pnpm test
pnpm build
```

Format the repository.

```bash
pnpm format
```

Build and inspect the npm package, then install and exercise it in an isolated directory.

```bash
pnpm verify:package
```

Preview the Remotion composition in Studio.

```bash
pnpm video:studio
```

Render the English and Japanese product videos as 1920×1080 MP4 files.
Both versions use the same silent 20-second timeline at 30 fps.

```bash
pnpm video:render
```

The generated files are `media/zatto-pv.mp4` (English) and
`media/zatto-pv-ja.mp4` (Japanese). Use `pnpm video:render:en` or
`pnpm video:render:ja` to render one language.

## Release

Merging a normal PR into `main` creates or updates a release PR through release-please.
Review its version and `CHANGELOG.md`, then merge the release PR to publish.
Ordinary PRs use Conventional Commits and leave the package version unchanged.
Breaking changes use `!` or `BREAKING CHANGE:`.

The Release workflow creates a draft GitHub Release and tag, validates the tagged package,
publishes the verified tarball to npm, and publishes the GitHub Release.
The approved Changelog entry supplies both the release body and the offline app Docs.
A failed run can be retried against its existing tag without republishing conflicting contents.

GitHub Actions must be allowed to create pull requests. npm must trust `release.yml`
for this repository as a Trusted Publisher; no personal access token is required.
See [release operations](https://github.com/yuske-nakajima/zatto/blob/main/docs/releasing.md)
and the [versioning policy](https://github.com/yuske-nakajima/zatto/blob/main/docs/versioning.md)
for setup, review scope and retry instructions.

## Updating to 3.0.0

3.0.0 requires `workspaceId`, the target workspace, on RPC operations that change or
export files, and raises the server protocol version to 4. A 2.x server keeps running
after the package is updated: stop it with `zatto --stop` from 3.0.0, then run `zatto`.
Until it is stopped, the 3.0.0 CLI does not send operations to it.
Saved workspaces, stars, List order and exchange files are retained.

## Updating to 2.0.0 and extending Zatto

2.0.0 removes REST operation APIs. CLI, Web UI and internal MCP calls use JSON-RPC.
Stop the server with `zatto --stop` before updating. If already updated, use
`npx --yes @yuske-nakajima/zatto@1.2.0 --stop` to stop the old server, then run the new `zatto`.
When the new CLI detects an old server it refuses registration or spawning, preserves
runtime records, and reports migration steps without killing the process.
Saved workspaces, stars, List order and exchange files are retained.
For an old server on a custom port without a runtime record, add `--port <detected-port>` to that stop command.

Built-in Docs include an offline Changelog; the logo shows the installed version.
See [architecture and extension guidance](https://github.com/yuske-nakajima/zatto/blob/main/docs/architecture.md) for shared Commands and RPC contracts.
Agents follow `AGENTS.md` and `.claude/rules/`. Discuss architecture changes with the user before implementing them.

### Bundled Changelog

`CHANGELOG.md` is the source for release notes and the English/Japanese Docs pages.
It includes the original notes for all 17 releases through v1.2.0.
Release PRs add subsequent entries. Both page languages retain the notes' original language.
`node scripts/update-changelog.mjs` regenerates the pages offline, and builds run this generator.
There is no separate pending-release text or publication status baked into the app.
Ordinary builds and installed Zatto do not require GitHub access.

## Debugging

Build the web application and Node.js code.

```bash
pnpm build
```

Start the server in the foreground with temporary session and runtime files.

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
ZATTO_RUNTIME_FILE=/tmp/zatto-server.json \
  node dist/server/index.js --port 6280
```

Add an HTML file from another terminal.

```bash
ZATTO_SESSION_FILE=/tmp/zatto-session.json \
ZATTO_RUNTIME_FILE=/tmp/zatto-server.json \
  node bin/zatto.js --no-open page.html
```

Operations use JSON-RPC 2.0 over HTTP. REST operation routes are not provided.
Read the connected port from the runtime file, then send named parameters.

```bash
ZATTO_PORT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/zatto-server.json')).port")
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"server.health","params":{}}'
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"session.get","params":{}}'
```

Use `session.add` with `{ "workspaceId": "...", "paths": [...] }` to register files and
`session.reorder` with every entry ID to reorder them. `session.removeMany` removes known
IDs atomically without deleting files. Operations that change or export files require
`workspaceId`, the target workspace, which need not be the selected one. Native pickers,
import and shutdown validate `instanceId` in params.
Successful calls return `result`; failures return `error.code` and `error.data`.
The built-in API documentation describes all 22 methods, parameters, results and errors.

Native folder selection uses the server.health instanceId. Replace the placeholder before running.

```bash
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"session.pickDirectory","params":{"instanceId":"<server-instance-id>","mode":"direct"}}'
curl "http://127.0.0.1:${ZATTO_PORT}/rpc" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":4,"method":"session.pickDirectory","params":{"instanceId":"<server-instance-id>","mode":"recursive"}}'
```

Stop the managed server.

```bash
ZATTO_RUNTIME_FILE=/tmp/zatto-server.json \
  node bin/zatto.js --stop
```

## License

[MIT License](LICENSE)

## Acknowledgements

`zatto` was inspired by [k1LoW/mo](https://github.com/k1LoW/mo), a Markdown viewer
that collects `.md` files for reading in the browser.

`zatto` brings that file-bundling experience to HTML.
Thank you to the authors of this excellent prior work. `mo` is available under the MIT License.
