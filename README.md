# lernplattform-cli

Command-Line-Interface fuer die [ausbildung-in-der-it.de](https://app.ausbildung-in-der-it.de) Lernplattform. Verwaltet Lessons, Module, Blocks, Lernpfade, Practice Tasks, Ratings und Discussions ueber die offizielle Content-CLI-API.

## Installation

### Global ueber GitHub

```bash
npm install -g github:ausbildung-in-der-it/lernplattform-cli
```

Nach der Installation steht der Befehl `lernplattform` global zur Verfuegung.

### Lokal fuer Entwicklung

```bash
git clone git@github.com:ausbildung-in-der-it/lernplattform-cli.git
cd lernplattform-cli
npm install
npm run build
npm link
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
npm run smoke    # ruft dist/cli.mjs --help auf
```
