import { Fragment } from 'react';

/** Renders **bold** spans as <strong> and leaves everything else as plain text (no HTML is ever injected). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
        part.length > 4 && part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
          : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
