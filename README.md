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

## Usage

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

## Options

| Option | Description |
| --- | --- |
| `--port <n>` | Set the port used for the first server start. The default is `6280` |
| `--no-open` | Start without opening a browser |
| `--stop` | Stop the background server for the current OS user |
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

For later releases, update the version in `package.json` and merge the change into `main`.
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
