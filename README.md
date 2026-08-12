# zatto

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-white.png">
    <img src="https://raw.githubusercontent.com/yuske-nakajima/zatto/main/src/web/assets/zatto-logo-black.png" alt="zatto" width="240">
  </picture>
</p>

[日本語](./README.ja.md)

Browse local HTML files together without installing anything.

```bash
npx @yuske-nakajima/zatto file.html
```

`zatto` is a local viewer that collects multiple HTML files into one session.
Use the file panel in the browser to switch between them.
On desktop, drag the divider beside the file panel to adjust its width.
Double-click the divider to restore the default width.

## Usage

Open the viewer without adding a file from the command line.

```bash
npx @yuske-nakajima/zatto
```

On macOS, use **+ Add**, **Select HTML files**, or <kbd>Command</kbd>+<kbd>O</kbd>
in the viewer to select one or more `.html` or `.htm` files. The native file
dialog passes their absolute paths to the local `zatto` server, so relative
assets and live reload continue to work.

Pass multiple paths to add several HTML files at once.

```bash
npx @yuske-nakajima/zatto page.html report.html
```

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

## Release

Publish the package from the `main` branch on an npm-authenticated machine for the first release.

```bash
pnpm verify:package
npm publish --access public
```

After the first release, register GitHub Actions as the npm Trusted Publisher.

```bash
npm trust github @yuske-nakajima/zatto \
  --file release.yml \
  --repo yuske-nakajima/zatto \
  --allow-publish
```

For later releases, select the version using the
[versioning policy](https://github.com/yuske-nakajima/zatto/blob/main/docs/versioning.md),
update `package.json`, and merge the change into `main`. The manifest is the
version source of truth, and fixed version expectations in tests and scripts
must stay synchronized with it.
Then run the Release workflow manually.

```bash
gh workflow run release.yml --ref main
```

The workflow runs the quality checks and package verification.
After they pass, it publishes to npm, creates the version tag, and creates a GitHub Release.

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

Check server health and inspect the session.

```bash
ZATTO_PORT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/zatto-server.json')).port")
curl "http://127.0.0.1:${ZATTO_PORT}/api/health"
curl "http://127.0.0.1:${ZATTO_PORT}/api/session"
curl "http://127.0.0.1:${ZATTO_PORT}/api/session/export"
```

Add an HTML file through the API.

```bash
curl -X POST "http://127.0.0.1:${ZATTO_PORT}/api/session/add" \
  -H 'content-type: application/json' \
  --data "{\"paths\":[\"$PWD/page.html\"]}"
```

Reorder entries by sending every ID from `GET /api/session` in display order.

```bash
curl -X PATCH "http://127.0.0.1:${ZATTO_PORT}/api/session/order" \
  -H 'content-type: application/json' \
  --data '{"ids":["<entry-id-2>","<entry-id-1>"]}'
```

Import a validated session document. The server identity prevents a browser or
CLI connected to a stale server from replacing another server's session.
Add `?mode=merge` to preserve existing entries and append unregistered paths.
Omitting `mode` replaces the session for CLI compatibility.

```bash
ZATTO_INSTANCE_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/zatto-server.json')).instanceId")
curl -X PUT "http://127.0.0.1:${ZATTO_PORT}/api/session" \
  -H 'content-type: application/json' \
  -H "x-zatto-instance-id: ${ZATTO_INSTANCE_ID}" \
  --data "$(cat saved-session.json)"
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
