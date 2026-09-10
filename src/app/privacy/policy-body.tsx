import type { ReactNode } from "react";

/**
 * Renders the plain-text policy from policy-content.ts as headings,
 * paragraphs, and bullet lists — formatting only, no wording changes.
 *
 * The source text is hand-wrapped plain text (see policy-content.ts):
 * blocks are separated by a blank line, a block optionally opens with a
 * "N. Heading" line (English digits or Arabic-Indic ١٢٣...), and "• "
 * marks a bullet whose continuation lines are wrapped/indented. This
 * mirrors that structure exactly — it does not reinterpret the text.
 */

const HEADING_RE = /^([0-9]+|[٠-٩]+)\.\s+(.*)$/;
const BULLET_RE = /^•\s*/;
const URL_RE = /(https?:\/\/\S+)/g;

interface ParsedBlock {
  heading: string;
  paragraphs: string[];
  items: string[];
}

function parseBlock(block: string): ParsedBlock {
  const lines = block.split("\n");
  const first = lines[0]?.trim() ?? "";
  const headingMatch = HEADING_RE.exec(first);
  const heading = headingMatch ? first : "";
  const bodyLines = headingMatch ? lines.slice(1) : lines;

  const paragraphs: string[] = [];
  const items: string[] = [];
  let currentParagraph: string[] = [];
  let currentItem: string[] | null = null;

  const flushParagraph = () => {
    if (currentParagraph.length) {
      paragraphs.push(currentParagraph.join(" ").trim());
      currentParagraph = [];
    }
  };
  const flushItem = () => {
    if (currentItem) {
      items.push(currentItem.join(" ").trim());
      currentItem = null;
    }
  };

  for (const rawLine of bodyLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (BULLET_RE.test(line)) {
      flushParagraph();
      flushItem();
      currentItem = [line.replace(BULLET_RE, "")];
    } else if (currentItem) {
      currentItem.push(line);
    } else {
      currentParagraph.push(line);
    }
  }
  flushParagraph();
  flushItem();

  return { heading, paragraphs, items };
}

/** Turns a plain-text paragraph into text + real <a> links for any bare URLs it contains. */
function renderInline(text: string): ReactNode {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        dir="ltr"
        className="break-all text-accent underline underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noopener noreferrer"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function PolicyBody({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  const [titleBlock, metaBlock, ...rest] = blocks;

  return (
    <article>
      <h1 className="text-2xl font-extrabold text-foreground sm:text-[28px]">{titleBlock}</h1>
      <p className="mt-2 text-sm font-semibold text-muted-foreground">{metaBlock}</p>

      <div className="mt-8 space-y-8">
        {rest.map((block, i) => {
          const parsed = parseBlock(block);
          const isNote = i === rest.length - 1 && !parsed.heading;

          if (!parsed.heading) {
            return (
              <p
                key={i}
                className={
                  isNote
                    ? "border-t border-border pt-6 text-sm italic leading-7 text-muted-foreground"
                    : "text-[15.5px] leading-8 text-foreground"
                }
              >
                {parsed.paragraphs.map((p, pi) => (
                  <span key={pi}>{renderInline(p)}</span>
                ))}
              </p>
            );
          }

          return (
            <section key={i} aria-labelledby={`policy-heading-${i}`}>
              <h2 id={`policy-heading-${i}`} className="text-[17px] font-bold text-foreground sm:text-lg">
                {parsed.heading}
              </h2>
              {parsed.paragraphs.map((p, pi) => (
                <p key={pi} className="mt-2 text-[15.5px] leading-8 text-foreground">
                  {renderInline(p)}
                </p>
              ))}
              {parsed.items.length > 0 && (
                <ul className="mt-2 list-disc space-y-2 ps-5 text-[15.5px] leading-7 text-foreground marker:text-accent">
                  {parsed.items.map((it, ii) => (
                    <li key={ii}>{renderInline(it)}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}
