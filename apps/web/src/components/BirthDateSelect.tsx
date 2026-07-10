'use client';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const SELECT_CLS = 'border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white';

export function BirthDateSelect({ value, onChange, required }: {
  value: string; // 'YYYY-MM-DD' ou ''
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [year, month, day] = value ? value.split('-') : ['', '', ''];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const emit = (d: string, m: string, y: string) => {
    if (d && m && y) onChange(`${y}-${m}-${d}`);
    else onChange('');
  };

  return (
    <div className="flex gap-2">
      <select value={day} onChange={e => emit(e.target.value, month, year)} required={required} className={`${SELECT_CLS} flex-1`}>
        <option value="">Jour</option>
        {days.map(d => <option key={d} value={String(d).padStart(2, '0')}>{d}</option>)}
      </select>
      <select value={month} onChange={e => emit(day, e.target.value, year)} required={required} className={`${SELECT_CLS} flex-[1.5]`}>
        <option value="">Mois</option>
        {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <select value={year} onChange={e => emit(day, month, e.target.value)} required={required} className={`${SELECT_CLS} flex-1`}>
        <option value="">Année</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
