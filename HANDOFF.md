# Handoff: `npm install -g github:...` legt broken symlink an

**Ziel:** `npm install -g github:ausbildung-in-der-it/lernplattform-cli` soll auf macOS sauber durchlaufen und ein funktionierendes Binary `lernplattform` hinterlassen. Aktuell wird stattdessen ein Symlink auf ein gelöschtes tmp-Verzeichnis im npm-Cache angelegt.

## TL;DR

- Das Repo ist als Package korrekt (Tarball-Installs funktionieren).
- Der Fehler tritt nur beim Install-Spec `github:org/repo` auf.
- `bun install -g github:...` funktioniert tadellos, `npm install -g github:...` nicht.
- Vermutlich npm-Bug in der `git dep preparation` (siehe Stack-Trace unten).

Wir wollen aber bei **npm** bleiben. Bitte einen der unten gelisteten Workarounds umsetzen.

## Umgebung

| Tool | Version |
|---|---|
| macOS | Darwin 24.6.0 |
| Node | v22.18.0 (via nvm) |
| npm | 11.7.0 |
| Repo-Commit beim Reproduzieren | `ad114ad` (main) |

## Reproduktion

```bash
# Sauberer Ausgangszustand
rm -f /Users/noellang/.nvm/versions/node/v22.18.0/bin/lernplattform
rm -rf /Users/noellang/.nvm/versions/node/v22.18.0/lib/node_modules/lernplattform-cli
npm cache clean --force

# Install
npm install -g github:ausbildung-in-der-it/lernplattform-cli
# Output: "added 9 packages in 3s"  -> sieht erfolgreich aus

# Check
ls -la /Users/noellang/.nvm/versions/node/v22.18.0/lib/node_modules/lernplattform-cli
# lrwxr-xr-x@ ... lernplattform-cli -> ../../../../../../.npm/_cacache/tmp/git-cloneXXXX

# Das tmp-Verzeichnis wurde nach dem Install gelöscht -> kaputter Symlink.
lernplattform --version
# zsh: no such file or directory: /usr/local/bin/lernplattform
```

Bei einem zweiten Aufruf schlägt npm explizit fehl, weil es den kaputten Symlink atomar umbenennen will:

```
npm error ENOTDIR: not a directory, rename
'.../lib/node_modules/lernplattform-cli' ->
'.../lib/node_modules/.lernplattform-cli-XXXX'
```

Stack-Trace (gekürzt):

```
Error: ENOTDIR: not a directory, rename ...
  at async Object.rename (node:internal/fs/promises:784:10)
  at async moveFile (@npmcli/fs/lib/move-file.js:30:5)
  at async #reifyPackages (@npmcli/arborist/lib/arborist/reify.js:309:11)
```

## Was bereits getestet wurde (funktioniert, aber nicht die Ziel-UX)

| Test | Ergebnis |
|---|---|
| `npm pack` + `npm install -g ./lernplattform-cli-0.1.0.tgz` | sauber, Binary funktioniert |
| Tarball über `http://localhost:8765/lernplattform-cli.tgz` installieren | sauber, Binary funktioniert |
| `bun install -g github:ausbildung-in-der-it/lernplattform-cli` | sauber, Binary funktioniert |

Das beweist: Package-Definition + Build-Output sind in Ordnung. Der Fehler steckt im npm-Code-Pfad für Git-Specs.

## Was bereits versucht wurde (hat nicht geholfen)

| Versuch | Ergebnis |
|---|---|
| `prepare`-Hook entfernt (war ursprünglich `tsup`) | Fehler bleibt (genauer: Symlink-Verhalten bleibt, nur die Fehlermeldung ändert sich) |
| Scope `@ausbildung-in-der-it/` aus dem package.json-Namen entfernt | kein Unterschied |
| `dist/` ins Repo committet, damit kein Build im Install-Pfad nötig ist | kein Unterschied |
| `npm cache clean --force` vor jedem Versuch | kein Unterschied |

## Mögliche Ursachen (Hypothesen)

1. **npm-Bug bei `git dep preparation` + globalem Install.** npm legt das Package als Symlink auf das tmp-Clone-Verzeichnis statt es zu extracten. Wenn die Cleanup-Phase das tmp dann löscht, bleibt ein Broken-Symlink. Ähnliche Issues: <https://github.com/npm/cli/issues/2632>, <https://github.com/npm/cli/issues/4828>. Beide noch offen oder mit unklarer Resolution.
2. **`type: module` + `bin` + ESM-Dist triggert einen Edge-Case** im pacote/Arborist-Code, der nur bei Git-Quellen sichtbar ist.
3. **devDependencies (`tsup`, `typescript`) lassen npm trotz fehlendem `prepare`-Hook in den "git dep preparation"-Pfad gehen.**

## Empfohlene Lösungsoptionen (priorisiert)

### Option A — GitHub Release mit Tarball-Asset (empfohlen, ohne Registry-Account)

Tarball pre-packen und als Release-Asset uploaden. User installieren dann per direkter URL:

```bash
# Im Repo
npm version 0.1.0  # oder höher
npm pack
gh release create v0.1.0 lernplattform-cli-0.1.0.tgz \
  --title "v0.1.0" \
  --notes "Erste Release"

# User installiert
npm install -g https://github.com/ausbildung-in-der-it/lernplattform-cli/releases/download/v0.1.0/lernplattform-cli-0.1.0.tgz
```

**Pro:** kein npm-Account nötig, Standard-npm-Tarball-Pfad (funktioniert nachweislich), Versionen explizit.
**Con:** bei jedem Release manueller `npm pack` + `gh release create` Schritt, oder GitHub Action dafür.

**Folge-Aufgabe:** GitHub Action anlegen, die bei Tag-Push automatisch `npm pack` macht und das Asset ans Release hängt. Template:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - run: npm pack
      - uses: softprops/action-gh-release@v2
        with:
          files: lernplattform-cli-*.tgz
```

### Option B — npm Registry Publish

Package zu npm publishen (entweder public, oder private unter `@ausbildung-in-der-it/...` mit npm Organisation).

```bash
# Einmalig
npm login

# Pro Release
npm version 0.1.1
npm publish --access public  # bei scoped + public

# User
npm install -g lernplattform-cli
```

**Pro:** "echter" npm-Install-Flow, automatische Versions-Verwaltung, sauber für externe Nutzer.
**Con:** braucht npm-Account; bei scoped public sind alle Versionen öffentlich einsehbar; bei privater Registry zusätzlicher Auth-Schritt für Nutzer.

### Option C — npm Bug reporten + lokal pinnen

Issue bei npm/cli auf GitHub eröffnen mit obiger Reproduktion. In der Zwischenzeit eine fixierte `npm`-Version installieren, bei der das Verhalten anders war (Stichprobe: `npm@10.x` testen).

**Pro:** könnte das Ursprungsproblem fixen.
**Con:** Bug-Resolution dauert oft Monate. Zwischenlösung trotzdem nötig.

### Option D — Pin `npm install -g <ssh-url>#main` mit explizitem prepare-Skript

Statt `github:org/repo` einen vollqualifizierten Git-Spec mit Branch:

```bash
npm install -g "git+https://github.com/ausbildung-in-der-it/lernplattform-cli.git#main"
```

Manche Reports legen nahe, dass dieser Pfad einen anderen pacote-Branch geht. **Bitte als Erstes testen**, falls überraschend doch funktioniert: günstigster Workaround. (Wir haben das im aktuellen Debugging-Sweep noch nicht probiert.)

## Empfohlenes Vorgehen für den Mitarbeiter

1. **Option D zuerst testen** (ein Befehl, 30 Sekunden). Falls funktioniert: README anpassen, fertig.
2. Falls nicht: **Option A** umsetzen (GitHub Action + Release v0.1.0). README umstellen auf den Release-Tarball-Link.
3. Parallel: Option C, ein Issue gegen npm/cli mit der Reproduktion eröffnen.

## Validierungs-Checkliste nach dem Fix

```bash
# Clean
rm -f $(which lernplattform)
rm -rf $(npm root -g)/lernplattform-cli
npm cache clean --force

# Install (gewählter Weg)
<install-command>

# Check 1: bin ist ausführbar
which lernplattform
lernplattform --version
# erwartet: lernplattform-cli 0.1.0

# Check 2: lib/node_modules-Eintrag ist Verzeichnis, kein Symlink
ls -la $(npm root -g)/lernplattform-cli
# erwartet: drwx... (directory), nicht lrwx...

# Check 3: read-only API-Call gegen Production funktioniert
cd /tmp
lernplattform module list --per-page=1 | head -3

# Check 4: zweites Install-Call überschreibt sauber (kein ENOTDIR)
<install-command>
```

## Kontakt / Kontext

- Repo: <https://github.com/ausbildung-in-der-it/lernplattform-cli>
- Hauptkonsument: Skills und Agents in <https://github.com/ausbildung-in-der-it/agents> über die Thin-Wrappers in `package.json`
- Migration-Hintergrund: vor wenigen Tagen aus `aidi-agents` extrahiert (siehe Commit-History und README)
