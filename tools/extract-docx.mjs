/** Extrai texto de .docx (ZIP + word/document.xml) sem dependencia externa. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const source = process.argv[2];
const target = process.argv[3];
mkdirSync(target, { recursive: true });

for (const file of readdirSync(source).filter((n) => n.endsWith('.docx'))) {
  const xml = execFileSync('unzip', ['-p', join(source, file), 'word/document.xml'], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'latin1',
  });
  const utf8 = Buffer.from(xml, 'latin1').toString('utf8');
  const text = utf8
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\t+/g, '\t')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  writeFileSync(join(target, `${basename(file, '.docx')}.md`), `${text}\n`, 'utf8');
}
console.log('ok');
