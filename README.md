# lernplattform-cli

Command-Line-Interface für die [ausbildung-in-der-it.de](https://app.ausbildung-in-der-it.de) Lernplattform. Verwaltet Lessons, Module, Blocks, Lernpfade, Practice Tasks, Ratings und Discussions über die offizielle Content-CLI-API.

## Installation

### Empfohlen: global für Mitarbeitende

```bash
bun install -g github:ausbildung-in-der-it/lernplattform-cli
lernplattform --version
```

Nach der Installation steht der Befehl `lernplattform` global zur Verfügung.

> **Warum bun statt npm?** `npm install -g github:...` kann je nach npm-Konfiguration einen kaputten Symlink erzeugen: das Package wird auf ein npm-Cache-tmp-Verzeichnis verlinkt, das nach dem Install gelöscht wird. `bun install -g github:...` installiert diesen GitHub-Stand sauber. Wer bun nicht hat: `curl -fsSL https://bun.sh/install | bash`.

### Bun installieren

macOS und Linux:

```bash
curl -fsSL https://bun.com/install | bash
```

Windows:

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

Mit npm:

```bash
npm install -g bun
```

Weitere Informationen: <https://bun.com/docs/installation>

### Alternative: npm mit Workaround

Falls npm zwingend verwendet werden soll, muss der GitHub-Install mit `install-links=true` laufen:

```bash
npm install -g --install-links=true github:ausbildung-in-der-it/lernplattform-cli
lernplattform --version
```

Langfristig ist ein versionierter Release-Tarball oder ein Registry-Package besser als ein GitHub-Install von `main`, weil Updates dann explizit an Versionen gebunden sind.

### Lokale Entwicklung

```bash
git clone git@github.com:ausbildung-in-der-it/lernplattform-cli.git
cd lernplattform-cli
npm install
npm run build
bun link        # registriert das Package
bun link lernplattform-cli   # legt den globalen Symlink an
```

Danach zeigt der globale Befehl `lernplattform` auf den lokalen Checkout. Das ist der richtige Workflow, wenn aktiv an der CLI entwickelt wird: nach `npm run build` ist die neue Version sofort global aktiv, ohne erneutes Installieren. Für laufende Entwicklung in einem zweiten Terminal `npm run dev` starten.

`npm link` funktioniert ebenfalls. Beide Wege erzeugen einen Symlink in der jeweiligen globalen `bin/`.

> **Nicht `bun install -g .` aus dem Projektordner.** Das triggert in bun 1.3.x einen Bug: `error: Package "@" has a dependency loop`. Stattdessen `bun link` benutzen (siehe oben). Hintergrund: bun interpretiert den `.`-Pfad als Self-Referenz und gerät in eine Auflösungs-Schleife.

Zum Entfernen des lokalen Links:

```bash
bun unlink lernplattform-cli   # im Projektordner
bun remove -g lernplattform-cli   # global, falls noch ein Eintrag uebrig ist
# oder mit npm:
npm unlink -g lernplattform-cli
```

### Update

```bash
bun install -g github:ausbildung-in-der-it/lernplattform-cli
```

Oder mit npm:

```bash
npm install -g --install-links=true github:ausbildung-in-der-it/lernplattform-cli
```

## Konfiguration

Lege eine `.env` an. Lookup-Reihenfolge:

1. `$LERNPLATTFORM_ENV_FILE` (expliziter Override)
2. `./.env` (aktuelles Verzeichnis)
3. `~/.config/lernplattform/.env` (globaler Fallback)

```bash
mkdir -p ~/.config/lernplattform
cp .env.example ~/.config/lernplattform/.env
# AIDI_API_TOKEN eintragen
```

| Variable | Pflicht | Default |
|---|---|---|
| `AIDI_API_TOKEN` | ja | – |
| `AIDI_HOST_URL` | nein | `https://app.ausbildung-in-der-it.de` |

## Usage

```bash
lernplattform --help
lernplattform lesson --help
lernplattform lesson list --per-page=5
lernplattform module get mein-modul
lernplattform blocks list meine-lesson
lernplattform search "datenbanken"
```

### Bereiche

| Bereich | Aliase | Aktionen |
|---|---|---|
| `lesson` | – | list, get, mdx, create, update, delete |
| `module` | – | list, get, create, update, delete |
| `blocks` | – | list, get, create, update, delete, reorder, bulk |
| `learning-path` | `path` | list, get, create, update, delete |
| `learning-path-module` | `path-modules` | list, create, delete, bulk, reorder |
| `module-content-item` | `content-items` | list, get, create, update, delete, bulk, reorder |
| `practice-task` | `practice` | list, get, create, update, delete |
| `practice-blocks` | – | list, get, create, update, delete, reorder, bulk |
| `rating` | – | list, get, summary, user, create, update, delete |
| `discussion` | – | list, get, comment, solve, unsolve, update-comment, delete-comment, accept |
| `search` | `aidi-search` | (Argument: Query-String) |
| `image-upload` | – | (Argument: Pfad zur Bilddatei) |

Detaillierte Hilfe pro Bereich:

```bash
lernplattform lesson help
lernplattform blocks help
```

## Migration von npm-Scripts

Wer das aidi-agents-Repo nutzt: die alten `npm run lesson:get …` Befehle bleiben als Thin-Wrappers bestehen und delegieren intern an `lernplattform`. Neue Befehle direkt aus dem Shell verwenden.

| Alt | Neu |
|---|---|
| `npm run lesson:get foo` | `lernplattform lesson get foo` |
| `npm run blocks:create lesson --type=textBlock …` | `lernplattform blocks create lesson --type=textBlock …` |
| `npm run search "x"` (aidi-search) | `lernplattform search "x"` |
| `npm run image:upload ./img.png` | `lernplattform image-upload ./img.png` |

## Entwicklung

```bash
npm run dev      # tsup --watch
npm run build    # einmaliger Build
npm run smoke    # ruft lernplattform --help über bin/lernplattform.mjs auf
```
