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
    onChange(ref.current?.innerHTML ?? '');
  };

  const handleLink = () => {
    const url = prompt('Adresse du lien (https://…)');
    if (url) exec('createLink', url);
  };

  // onMouseDown + preventDefault : évite que le clic sur un bouton de la
  // barre d'outils ne fasse perdre le focus/la sélection de la zone
  // d'édition avant l'exécution de la commande (sinon les listes, par
  // exemple, s'appliquent à une sélection vide et ne font rien).
  const toolbarProps = (command: string, arg?: string) => ({
    type: 'button' as const,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => exec(command, arg),
  });

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        <button {...toolbarProps('bold')} className={`${BTN_CLS} font-bold`}>G</button>
        <button {...toolbarProps('italic')} className={`${BTN_CLS} italic`}>I</button>
        <button {...toolbarProps('underline')} className={`${BTN_CLS} underline`}>S</button>
        <span className="w-px bg-gray-300 mx-1 my-1" />
        <button {...toolbarProps('insertUnorderedList')} className={BTN_CLS}>• Liste</button>
        <button {...toolbarProps('insertOrderedList')} className={BTN_CLS}>1. Liste</button>
        <span className="w-px bg-gray-300 mx-1 my-1" />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={handleLink} className={BTN_CLS}>Lien</button>
        <button {...toolbarProps('removeFormat')} className={BTN_CLS}>Effacer le style</button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="w-full min-h-[220px] px-3 py-2 text-sm focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline"
        suppressContentEditableWarning
      />
    </div>
  );
}
