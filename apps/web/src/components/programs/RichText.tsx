import { Fragment, type ReactNode } from "react";

/**
 * A tiny, safe subset of Markdown for admin-written text: "## heading", "- item" lists, paragraphs and
 * https:// links. Everything is rendered as React text nodes, so no HTML from the database ever reaches the page.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) return <h3 key={i} className="mb-2 mt-6 text-base font-semibold first:mt-0">{inline(block.slice(3))}</h3>;
        const lines = block.split("\n");
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="mb-4 list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i} className="mb-4 leading-relaxed last:mb-0">
            {lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}

const URL_RE = /(https:\/\/[^\s<>"')]+)/g;

function inline(s: string): ReactNode[] {
  return s.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-4 hover:underline">{part}</a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
