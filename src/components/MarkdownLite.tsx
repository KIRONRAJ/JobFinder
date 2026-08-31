/**
 * A small, purpose-built renderer for the Skill Guides' prose — not a general
 * markdown engine. The guide pack only ever uses `##`/`###` headings, bold
 * (`**text**`), bullet lists, numbered lists, and plain paragraphs (checked
 * against all 7 real guide files), so that's all this supports. Bringing in
 * a full markdown library for four constructs wasn't worth the dependency.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return part ? <span key={`${keyPrefix}-${i}`}>{part}</span> : null;
  });
}

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({ kind: 'heading', level: 3, text: line.slice(4) });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', level: 2, text: line.slice(3) });
      i++;
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.+)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch || numberedMatch) {
      const ordered = Boolean(numberedMatch);
      const items: string[] = [(bulletMatch ?? numberedMatch)![1]];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        const nextBullet = next.match(/^-\s+(.+)$/);
        const nextNumbered = next.match(/^\d+\.\s+(.+)$/);
        if (ordered && nextNumbered) {
          items.push(nextNumbered[1]);
          i++;
        } else if (!ordered && nextBullet) {
          items.push(nextBullet[1]);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // Paragraph: consume until a blank line or the start of a new block type.
    const paraLines = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || next.startsWith('#') || /^-\s+/.test(next) || /^\d+\.\s+/.test(next)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join(' ') });
  }

  return blocks;
}

export function MarkdownLite({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);
  return (
    <div className="space-y-3 text-meta leading-relaxed text-ink-soft">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          const Tag = b.level === 2 ? 'h3' : 'h4';
          return (
            <Tag key={i} className={b.level === 2 ? 'pt-2 text-subhead font-medium text-ink' : 'text-meta font-semibold text-ink'}>
              {renderInline(b.text, `h${i}`)}
            </Tag>
          );
        }
        if (b.kind === 'list') {
          const ListTag = b.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={i} className={b.ordered ? 'list-decimal space-y-1.5 pl-5' : 'list-disc space-y-1.5 pl-5'}>
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item, `li${i}-${j}`)}</li>
              ))}
            </ListTag>
          );
        }
        return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
      })}
    </div>
  );
}
