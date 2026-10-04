import { Fragment } from 'react';

const EMOJI = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;

/** Renders **bold** spans as <strong> and leaves everything else as plain text (no HTML is ever injected). Emojis are dropped, including from older saved messages. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim().split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
        part.length > 4 && part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
          : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
