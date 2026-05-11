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
  lernplattform <bereich> <aktion> [args...]

BEREICHE
  lesson                    Lessons verwalten (list|get|mdx|create|update|delete)
  module                    Module verwalten (list|get|create|update|delete)
  blocks                    Lesson-Blocks (list|get|create|update|delete|reorder|bulk)
  learning-path  (path)     Lernpfade (list|get|create|update|delete)
  path-modules              Module einem Lernpfad zuordnen (list|create|delete|bulk|reorder)
  content-items             Content einem Modul zuordnen (list|get|create|update|delete|bulk|reorder)
  practice-task  (practice) Practice Tasks (list|get|create|update|delete)
  practice-blocks           Practice-Task-Blocks (list|get|create|update|delete|reorder|bulk)
  rating                    Ratings (list|get|summary|user|create|update|delete)
  discussion                Discussions (list|get|comment|solve|unsolve|...|accept)
  search                    Plattform-Inhalte durchsuchen
  image-upload              Bilder zu AIDI hochladen

HILFE
  lernplattform <bereich> --help    Hilfe für einen Bereich
  lernplattform --version           Version anzeigen

UMGEBUNG
  Liest .env in folgender Reihenfolge:
    1) $LERNPLATTFORM_ENV_FILE
    2) ./.env (cwd)
    3) ~/.config/lernplattform/.env
  Pflicht: AIDI_API_TOKEN
  Optional: AIDI_HOST_URL (default: https://app.ausbildung-in-der-it.de)

BEISPIELE
  lernplattform lesson list --per-page=5
  lernplattform module get hauptmodul-x
  lernplattform blocks list my-lesson
  lernplattform search "datenbanken"
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
