'use client';

import { useEffect, useRef } from 'react';

const BTN_CLS = 'px-2.5 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700';

export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current && ref.current) {
      ref.current.innerHTML = value;
      isFirstRender.current = false;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML ?? '');
  };

  const handleLink = () => {
    const url = prompt('Adresse du lien (https://…)');
    if (url) exec('createLink', url);
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        <button type="button" onClick={() => exec('bold')} className={`${BTN_CLS} font-bold`}>G</button>
        <button type="button" onClick={() => exec('italic')} className={`${BTN_CLS} italic`}>I</button>
        <button type="button" onClick={() => exec('underline')} className={`${BTN_CLS} underline`}>S</button>
        <span className="w-px bg-gray-300 mx-1 my-1" />
        <button type="button" onClick={() => exec('insertUnorderedList')} className={BTN_CLS}>• Liste</button>
        <button type="button" onClick={() => exec('insertOrderedList')} className={BTN_CLS}>1. Liste</button>
        <span className="w-px bg-gray-300 mx-1 my-1" />
        <button type="button" onClick={handleLink} className={BTN_CLS}>Lien</button>
        <button type="button" onClick={() => exec('removeFormat')} className={BTN_CLS}>Effacer le style</button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="w-full min-h-[220px] px-3 py-2 text-sm focus:outline-none"
        suppressContentEditableWarning
      />
    </div>
  );
}
