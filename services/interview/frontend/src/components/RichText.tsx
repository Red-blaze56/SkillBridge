import { Fragment } from 'react'

// The AI marks code with `backticks`. This turns those spans into <code> elements.
// It only builds React elements from plain strings, so nothing is ever injected as HTML,
// which matters because the text comes from a model (untrusted input).
export function RichText({ text }: { text: string }) {
  // Splitting on a capturing group keeps the matches: odd indexes are the code spans.
  const parts = text.split(/`([^`\n]+)`/)

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] break-words">
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
