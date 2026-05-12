import { loadEnv } from './utils/env';

loadEnv();

import { run as runLesson } from './commands/lesson';
import { run as runModule } from './commands/module';
import { run as runBlocks } from './commands/blocks';
import { run as runLearningPath } from './commands/learning-path';
import { run as runLearningPathModule } from './commands/learning-path-module';
import { run as runModuleContentItem } from './commands/module-content-item';
import { run as runPracticeTask } from './commands/practice-task';
import { run as runPracticeBlocks } from './commands/practice-blocks';
import { run as runRating } from './commands/rating';
import { run as runDiscussion } from './commands/discussion';
import { run as runSearchAidi } from './commands/search-aidi';
import { run as runImageUpload } from './commands/image-upload';

type Handler = (argv: string[]) => Promise<void>;

const handlers: Record<string, Handler> = {
  lesson: runLesson,
  module: runModule,
  blocks: runBlocks,
  'learning-path': runLearningPath,
  path: runLearningPath,
  'learning-path-module': runLearningPathModule,
  'path-modules': runLearningPathModule,
  'module-content-item': runModuleContentItem,
  'content-items': runModuleContentItem,
  'practice-task': runPracticeTask,
  practice: runPracticeTask,
  'practice-blocks': runPracticeBlocks,
  rating: runRating,
  discussion: runDiscussion,
  search: runSearchAidi,
  'aidi-search': runSearchAidi,
  'image-upload': runImageUpload,
};

const HELP_TEXT = `lernplattform - CLI für die ausbildung-in-der-it.de Lernplattform

USAGE
  lernplattform <bereich> <aktion> [args...] [--flag=wert]

BEREICHE (sortiert nach Datenmodell-Hierarchie)
  learning-path  (path)     Lernpfade (list|get|create|update|delete)
  path-modules              Module einem Lernpfad zuordnen (list|create|delete|bulk|reorder)
  module                    Module verwalten (list|get|create|update|delete)
  content-items             Content (Lessons/Videos/Practice) einem Modul zuordnen (list|get|create|update|delete|bulk|reorder)
  lesson                    Lessons verwalten (list|get|mdx|create|update|delete)
  blocks                    Lesson-Blocks (list|get|create|update|delete|reorder|bulk)
  practice-task  (practice) Practice Tasks (list|get|create|update|delete)
  practice-blocks           Practice-Task-Blocks (list|get|create|update|delete|reorder|bulk)
  rating                    Ratings (list|get|summary|user|create|update|delete)
  discussion                Discussions (list|get|comment|solve|unsolve|update-comment|delete-comment|accept)
  search                    Plattform-Inhalte durchsuchen (Discovery)
  image-upload              Bilder zu AIDI hochladen (CDN-URLs zurueck)

DATENMODELL (grob)
  learning-path
    -> path-modules (Zuordnung learning-path <-> module)
       -> module
          -> content-items (Zuordnung module <-> lesson/video/practice-task)
             -> lesson  --> blocks
             -> practice-task --> practice-blocks

HILFE
  lernplattform <bereich> --help    Hilfe und Beispiele fuer einen Bereich
  lernplattform --version           Version anzeigen

UMGEBUNG
  Liest .env in folgender Reihenfolge:
    1) \$LERNPLATTFORM_ENV_FILE
    2) ./.env (cwd)
    3) ~/.config/lernplattform/.env
  Pflicht:  AIDI_API_TOKEN
  Optional: AIDI_HOST_URL (default: https://app.ausbildung-in-der-it.de)

IO-KONVENTIONEN (wichtig fuer Skripte und Agenten)
  stdout    Reines JSON aus der API (Erfolg) bzw. MDX-Text (nur lesson mdx)
  stderr    Status-/Debug-Logs ("Listing ...", "Response received in ..s")
  Exit 0    Erfolg
  Exit 1    Fehler. stderr enthaelt JSON: {"error": "..."}
  Mit jq    lernplattform <bereich> <aktion> ... 2>/dev/null | jq '...'
            (stderr ausblenden, jq auf stdout)

DISCOVERY FUER AGENTEN
  Slug oder ID unbekannt? Erst suchen, dann lesen, dann veraendern:
    1) lernplattform search "datenbanken"          # findet lessons/module/practice
    2) lernplattform lesson list --per-page=50     # blaettern wenn search nichts hat
    3) lernplattform lesson get <slug>             # Detail inkl. Blocks
  Niemals Slugs raten. Slugs sind unique und case-sensitive.

JSON-EINGABE (Blocks, Items, lange Inhalte)
  Drei aequivalente Wege, Prioritaet stdin > base64 > inline:
    --foo='[...]'                        # inline (Quoting fragil)
    --foo-base64="\$(echo '[...]' | base64)"
    --foo-stdin <<'EOF'                  # robust, empfohlen
    [ ... ]
    EOF

BEISPIELE (einzelne Befehle)
  lernplattform search "ipv4"
  lernplattform lesson list --per-page=5
  lernplattform module get relationale-datenbanken
  lernplattform blocks list sql-grundlagen
  lernplattform lesson mdx sql-grundlagen > sql.mdx
  lernplattform rating summary --content-type=lesson --content-id=123

WORKFLOWS (verkettete Beispiele)

  1) Lesson finden, Detail holen:
     # 'search' liefert Laravel-Paginator: Treffer in .data, Gesamtzahl in .meta.total
     SLUG=\$(lernplattform search "ipv4" 2>/dev/null \\
       | jq -r '.data[] | select(.type=="lesson") | .slug' | head -1)
     lernplattform lesson get "\$SLUG" | jq '{id, title, type, blocks: (.blocks|length)}'
     # Fuer Lessons vom Typ 'mdx' oder 'text' zusaetzlich:
     #   lernplattform lesson mdx "\$SLUG" > "\$SLUG.mdx"
     # 'interactive' Lessons haben keinen MDX-Export, dort lieber blocks list/get nutzen

  2) Modul anlegen und Lessons zuordnen:
     lernplattform module create \\
       --title="Schnupperkurs Python" --slug="schnupper-python" \\
       --type=normal --status=draft
     MODULE_ID=\$(lernplattform module get schnupper-python 2>/dev/null | jq '.id')
     lernplattform lesson create \\
       --title="Hallo Python" --slug="hallo-python" \\
       --module-id="\$MODULE_ID" --type=text --xp=50

  3) Komplette Lesson mit Blocks via stdin (robust, ohne Quoting-Aerger):
     lernplattform lesson create \\
       --title="OOP Grundlagen" --slug="oop-grundlagen" \\
       --module-id=122 --type=interactive --xp=150 \\
       --blocks-stdin <<'EOF'
     [
       {"type":"textBlock","section":"hook","data":{"title":"Einstieg","content":"..."}},
       {"type":"textBlock","section":"knowledge1","data":{"title":"Klassen","content":"..."}}
     ]
     EOF

  4) Bestehende Lesson sichern, dann Blocks ersetzen (REPLACE-Semantik!):
     lernplattform lesson get sql-grundlagen --save-to-file        # backup nach backups/
     lernplattform lesson update sql-grundlagen --blocks-stdin <<'EOF'
     [ ... neue komplette Blockliste ... ]
     EOF

  5) Lernpfad bauen (path -> path-modules -> content-items):
     lernplattform path create --title="FIAE AP2" --slug="fiae-ap2" --status=draft
     lernplattform path-modules create fiae-ap2 --module-id=122 --position=0
     lernplattform content-items create relationale-datenbanken \\
       --content-type=lesson --content-id=123 --position=0

  6) Discussion bearbeiten und schliessen:
     THREAD=\$(lernplattform discussion list --status=open 2>/dev/null \\
       | jq '.data[0].id')
     lernplattform discussion comment "\$THREAD" \\
       --author-email="support@ausbildung-in-der-it.de" \\
       --content-stdin <<'EOF'
     Die Aufloesung erfolgt ueber den Resolver des Betriebssystems...
     EOF
     lernplattform discussion solve "\$THREAD" \\
       --actor-email="support@ausbildung-in-der-it.de"

DESTRUKTIVE OPERATIONEN
  delete erfordert immer --confirm. Ohne --confirm Exit 1 mit Fehler-JSON.
  Beispiel: lernplattform lesson delete old-lesson --confirm

WEITERE HINWEISE
  - Pagination: --page=N --per-page=N (Default per-page meist 15-20)
  - Mehrere Aliase pro Bereich (z. B. path == learning-path, practice == practice-task)
  - bulk und reorder erwarten JSON-Arrays. Bei reorder: ALLE IDs angeben.
  - Update-Operationen auf Blocks-Listen sind REPLACE (alle Blocks werden ersetzt)
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const category = argv[0];

  if (!category || category === '--help' || category === '-h' || category === 'help') {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (category === '--version' || category === '-v') {
    console.log('lernplattform-cli 0.1.0');
    return;
  }

  const handler = handlers[category];
  if (!handler) {
    console.error(`Unbekannter Bereich: ${category}\n`);
    process.stdout.write(HELP_TEXT);
    process.exit(1);
  }

  await handler(argv.slice(1));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
});
