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
| `kuendigungen` | – | list, show, confirm, reject, refund (Admin-API, eigener Token, siehe unten) |

Detaillierte Hilfe pro Bereich:

```bash
lernplattform lesson help
lernplattform blocks help
```

## Kündigungen (Admin)

Kündigungsanfragen der Plattform prüfen und bearbeiten, über die Admin-API `/api/admin/v1/cancellation-requests`. Jede Person im Team nutzt dafür einen **eigenen** Token: Die Plattform trägt den Token-Besitzer als bearbeitende Person (`reviewed_by`) ein.

### Ablauf: prüfen → confirm → refund

1. **Prüfen** (lesend, frei): `list` und `show <id>`. Warnungen, Wirksamkeitsdatum und berechnete Erstattung lesen.
2. **Bestätigen**: `confirm <id>` zeigt die Vorschau, `confirm <id> --force` bestätigt. Legt das Wirksamkeitsdatum fest, beendet den Zugang, kündigt das Stripe-Abo und schickt die Bestätigungsmail. **Löst keine Erstattung aus.**
3. **Erstatten**: `refund <id>` zeigt Betrag, bereits erstattet, offen und die Zahlungsbasis. `refund <id> --force` zahlt über Stripe aus. **Das ist echtes Geld und nicht umkehrbar.**

```bash
# Lesend, frei
lernplattform kuendigungen list                          # offene Anfragen (pending), älteste zuerst
lernplattform kuendigungen list --status=all --page=2    # pending|confirmed|rejected|withdrawn|all
lernplattform kuendigungen show 12                       # Teilnehmer, Pass, Abo, Wirksamkeit, Erstattung, Warnungen
lernplattform kuendigungen show 12 --json

# VERÄNDERND, nur nach Ansage. Ohne --force nur Vorschau
lernplattform kuendigungen confirm 12 --env=production                               # Vorschau
lernplattform kuendigungen confirm 12 --env=production --wichtiger-grund-anerkannt   # Vorschau: außerordentlich mit sofortiger Wirkung
lernplattform kuendigungen confirm 12 --env=production --als-widerruf                # Vorschau: als Widerruf behandeln (nur Verbraucher)
lernplattform kuendigungen confirm 12 --env=production --notiz="Telefonisch geklärt" --force
# Ablehnen nur bei unzulässiger Erklärung, eine wirksame Kündigung wird bestätigt:
lernplattform kuendigungen reject 12 --env=production --unzulaessig=duplikat --grund="Bereits am 18.09. gekündigt"          # Vorschau
lernplattform kuendigungen reject 12 --env=production --unzulaessig=duplikat --grund="Bereits am 18.09. gekündigt" --force

# VERÄNDERND, ECHTES GELD, nur nach ausdrücklicher Ansage
lernplattform kuendigungen refund 12 --env=production            # Vorschau: Betrag, erstattet, offen
lernplattform kuendigungen refund 12 --env=production --force    # zahlt über Stripe aus
```

> **`confirm`, `reject` und `refund` sind verändernd und nur nach ausdrücklicher Ansage mit `--force` auszuführen.** `confirm --force` und `reject --force` schicken eine Mail an den echten Teilnehmer. `confirm --force` kündigt außerdem das Stripe-Abo. `refund --force` zahlt echtes Geld über Stripe aus. Ohne `--force` zeigen alle drei nur, was passieren würde (ein GET, Exit 0). Wer die CLI von einem Agenten bedienen lässt: Vorschau zeigen lassen, dann selbst freigeben.

### Rechtlicher Rahmen: § 5 FernUSG, Umdeutung, Widerruf

Die Plattform rechnet, die CLI zeigt das Ergebnis und die Begründung (`show`, Abschnitt „Wirksamkeitsdatum“ und „Erstattung (Berechnung)“).

- **Ordentliche Kündigung (§ 5 FernUSG):** im ersten Halbjahr frühestens zu dessen Ende mit 6 Wochen Frist, danach mit 3 Monaten Frist ab Zugang der Erklärung. Die Erstattung wird tagesgenau berechnet: bezahlt laut Zahlungsbuch minus geschuldeter Anteil laut Vertragspreis.
- **Außerordentliche Kündigung:** Sie wirkt nur sofort, wenn beim Bestätigen der wichtige Grund anerkannt wird (`--wichtiger-grund-anerkannt`, § 314 BGB). Ohne das Flag wird sie in eine ordentliche Kündigung zum nächstmöglichen Termin **umgedeutet** (§ 140 BGB). Die Vorschau zeigt beides: „wird als ordentliche Kündigung zum TT.MM.JJJJ behandelt (Umdeutung)“ bzw. „sofortige Wirkung“. Das Flag bei einer anderen Kündigungsart ergibt 422.
- **Widerruf:** innerhalb von 14 Tagen nach dem Kauf. Vertrag, Zugang und Abo enden sofort, der volle Betrag ist binnen 14 Tagen nach Eingang zu erstatten (§ 357 BGB). Die Liste zeigt bei Widerrufen „Erstattung bis TT.MM.JJJJ“. Eine ordentliche oder außerordentliche Kündigung, die innerhalb der Widerrufsfrist einging (Warnung `widerruf-moeglich`), lässt sich mit `--als-widerruf` als Widerruf behandeln. Das Flag ist nicht mit `--wichtiger-grund-anerkannt` kombinierbar, sonst 422.

### Gesperrt: Zahlungsbuch fehlt

Hat ein Pass keine Einträge im Zahlungsbuch, ist der gezahlte Betrag unbekannt. Dann gilt **„Bestätigen gesperrt, Zahlungsbuch fehlt (Backfill)“** (Warnung `ZAHLUNGSBUCH-FEHLT`, Code `paid_amount_unknown`). `confirm --force` und `refund --force` antworten mit 409. Zuerst müssen auf dem Server die Zahlungen nachgeladen werden (`php artisan pass:backfill-payments`, eigene Ansage), danach neu prüfen.

### Gesperrt: Firmen-Abo mit mehreren Lizenzen

Kündigt eine Firma eine Lizenz aus einem Stripe-Abo mit weiteren aktiven Firmenlizenzen, gilt **„Bestätigen gesperrt“** (Warnung `FIRMA-MEHRLIZENZ`, Code `company_multi_seat_subscription`, `confirm --force` antwortet mit 409). Firmen kündigen Lizenzen einzeln, das ist noch nicht automatisiert (AIDI-776). Bis dahin in Stripe die Menge zum Wirksamkeitsdatum reduzieren und den Zugang nur dieser Lizenz beenden.

### Ergebnis- und Fehlercodes

| Befehl | Erfolg (Exit 0) | Fehler (Exit 2, `code` im stderr-JSON) |
|---|---|---|
| `confirm` | `confirmed`, `already_confirmed` | 409 `conflict`, `paid_amount_unknown`, `bundle_subscription_ambiguous`, `company_multi_seat_subscription`, `user_pass_missing`; 422 `unprocessable` |
| `reject` | `rejected`, `already_rejected` | 409 `conflict` |
| `refund` | `refunded`, `already_refunded`, `nothing_to_refund` | 409 `not_confirmed`, `paid_amount_unknown`, `refund_in_progress`, `user_pass_missing`; 422 `unprocessable`; 502 `refund_failed` |

Wiederholte Aufrufe sind idempotent (keine zweite Mail, keine zweite Auszahlung). Bei 502 `refund_failed` zeigt stderr zusätzlich `refund_execution` (bis dahin erstattet, offen, Stripe-Refund-IDs). Ein erneuter `refund --force` zahlt bereits erstattete Anteile nicht doppelt. Auf ACHTUNG-Zeilen nach `confirm --force` achten: `STRIPE-KUENDIGUNG-FEHLT`, `ABO-KUENDIGUNG-FEHLGESCHLAGEN` oder `ABO-NICHT-IN-STRIPE` heißen jeweils, dass das Abo in Stripe geprüft und gegebenenfalls manuell gekündigt werden muss.

### Token anlegen

1. Im Backoffice (`/backoffice`) unter **System > API Tokens** einen neuen Token anlegen.
2. **Owner:** dich selbst auswählen. Nur Plattform-Admins (verifizierte E-Mail mit Admin-Domain) sind wählbar; ohne passenden Besitzer antwortet die API mit 403 `Token owner is not a platform admin`.
3. **Permissions:** `cancellation-requests:read` (list, show, Vorschau) und `cancellation-requests:write` (confirm, reject, refund mit `--force`).
4. Ablaufdatum setzen (Vorschlag: 6 Monate). Den Klartext-Token zeigt Filament nur einmal an.
5. Für staging denselben Ablauf auf `https://staging.ausbildung-in-der-it.de/backoffice` wiederholen; Tokens gelten nur in der Umgebung, in der sie angelegt wurden.

### Konfiguration

Der Admin-Token ist bewusst getrennt vom Content-Token (`AIDI_API_TOKEN`, `AIDI_HOST_URL` gelten für die Admin-Befehle nicht). Eintragen in `~/.config/lernplattform/.env` (gleiche Lookup-Reihenfolge wie oben), nie ins Repo:

| Variable | Wirkung |
|---|---|
| `LERNPLATTFORM_ADMIN_TOKEN` | Token für production (Pflicht für `--env=production`) |
| `LERNPLATTFORM_STAGING_ADMIN_TOKEN` | Token für staging (Pflicht für `--env=staging`) |
| `LERNPLATTFORM_ENV` | Default für `--env` (`production` oder `staging`). `confirm`, `reject` und `refund` brechen ohne `--env` und ohne diese Variable ab; `list` und `show` fallen auf production zurück und sagen das auf stderr |
| `LERNPLATTFORM_BASE_URL` | Übersteuert die URL, etwa für eine lokale Instanz. Der Token kommt weiter aus der Variable der gewählten Umgebung |
| `LERNPLATTFORM_STAGING_BASIC_AUTH` | `user:passwort` für die nginx-Basic-Auth vor staging (Pflicht für `--env=staging`, siehe unten) |

Defaults: production `https://app.ausbildung-in-der-it.de`, staging `https://staging.ausbildung-in-der-it.de`. Jeder Aufruf schreibt das Ziel auf stderr (`Ziel: <url> (<umgebung>)`), die Vorschau zusätzlich auf stdout.

```bash
lernplattform kuendigungen list --env=staging
LERNPLATTFORM_BASE_URL=http://127.0.0.1:8000 lernplattform kuendigungen list   # lokale Plattform, Token aus LERNPLATTFORM_ADMIN_TOKEN
```

### Staging (Basic-Auth)

`https://staging.ausbildung-in-der-it.de` ist komplett per nginx-Basic-Auth geschützt. Die Zugangsdaten stehen im Repo `aidi-handbook` unter `docs/tools/plattform-staging.md` (Abschnitt oben, dort auch der Verweis auf den 1Password-Eintrag „Plattform Staging Basic Auth“). Eintragen in `~/.config/lernplattform/.env`, nie ins Repo:

```bash
LERNPLATTFORM_STAGING_ADMIN_TOKEN=...
LERNPLATTFORM_STAGING_BASIC_AUTH=user:passwort
```

Ist die Variable gesetzt, schickt die CLI `Authorization: Basic …` für nginx und den Admin-Token als `X-API-Authorization: Bearer …`. Die Plattform-Middleware `SystemApiAuth` liest `X-API-Authorization` vor `Authorization`, deshalb kommen sich beide Header nicht in die Quere. Ohne die Variable bleibt alles wie bisher (`Authorization: Bearer …`), production braucht keine Basic-Auth.

Die Ziel-Zeile zeigt `(staging, mit Basic-Auth)`. Fehlt die Basic-Auth oder ist sie falsch, antwortet nginx mit einer HTML-Seite „401 Authorization Required“; die CLI meldet dann `Basic-Auth erforderlich (nginx)` bzw. `Basic-Auth abgelehnt (nginx)` samt Variablennamen. Ein 401 der API selbst (JSON) behält die Token-Hinweise. Die Zugangsdaten erscheinen in keiner Ausgabe.

### Ausgabe und Exit-Codes

- stdout: Tabelle bzw. Text, mit `--json` das JSON der API. Die Vorschau mit `--json` liefert `{"mode":"preview","changes_state":…,"lines":[…],"data":{…}}`.
- stderr: Ziel-Zeile und Fehler als JSON, z. B. `{"error":"…","status":409,"code":"paid_amount_unknown","hint":"…","current_status":"pending"}`, bei Validierungsfehlern zusätzlich `errors`.
- Exit 0: Erfolg, auch Vorschau, `already_*` und `nothing_to_refund`. Exit 1: Aufruf- oder Konfigurationsfehler, kein Request verschickt. Exit 2: API-Fehler (401/403/404/409/422/502/5xx) oder Server nicht erreichbar.

Details und Warnungs-Kurzcodes: `lernplattform kuendigungen --help`.

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
npm test         # baut test/**/*.test.ts nach .test-build/ und startet node --test (fetch gestubbt)
npm run typecheck
```

`dist/` ist committet, damit GitHub-Installs ohne Build funktionieren: nach Änderungen an `src/` immer `npm run build` ausführen und `dist/cli.js` mitcommitten.
