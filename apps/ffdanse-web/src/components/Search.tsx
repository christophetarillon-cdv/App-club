'use client';

import { useState, useEffect } from 'react';

interface Structure {
  n: string;
  a: string;
  cp: string;
  v: string;
  e: string;
  t: string;
  w: string;
  lat: number | null;
  lon: number | null;
  d: string[];
  u: string;
}

interface DateOption {
  filename: string;
  date: string;
  timestamp: string;
}

export default function Search({ onLogout }: { onLogout: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [department, setDepartment] = useState('');
  const [selectedDances, setSelectedDances] = useState<string[]>([]);
  const [allDances, setAllDances] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvUrl, setCsvUrl] = useState('');
  const [availableDates, setAvailableDates] = useState<DateOption[]>([]);
  const [selectedDate, setSelectedDate] = useState('structures.csv');

  useEffect(() => {
    // Charger les danses disponibles
    fetch('/api/dances')
      .then((res) => res.json())
      .then((data) => setAllDances(data.dances))
      .catch(console.error);

    // Charger l'URL du CSV
    fetch('/api/csv-info')
      .then((res) => res.json())
      .then((data) => setCsvUrl(data.url))
      .catch(console.error);

    // Charger les dates disponibles
    fetch('/api/available-dates')
      .then((res) => res.json())
      .then((data) => setAvailableDates(data.dates))
      .catch(console.error);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (value.trim()) {
      const filtered = allDances
        .filter((d) => d.toLowerCase().includes(value.toLowerCase()))
        .filter((d) => !selectedDances.includes(d))
        .slice(0, 8);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const addDance = (dance: string) => {
    setSelectedDances([...selectedDances, dance]);
    setSearchTerm('');
    setSuggestions([]);
    performSearch([...selectedDances, dance], department);
  };

  const removeDance = (dance: string) => {
    const updated = selectedDances.filter((d) => d !== dance);
    setSelectedDances(updated);
    performSearch(updated, department);
  };

  const performSearch = async (dances: string[], dept: string) => {
    if (dances.length === 0) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('ffdanse_token');
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dances, department: dept, filename: selectedDate }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const token = localStorage.getItem('ffdanse_token');
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        dances: selectedDances,
        department,
        results,
      }),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ffdanse_${selectedDances.join('_')}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-blue-600">🎉 FFDanse</h1>
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg transition"
            >
              Déconnexion
            </button>
          </div>

          <div className="flex gap-3 items-center">
            <a
              href="https://github.com/christophetarillon/cdv-app/actions/workflows/ffdanse-update.yml"
              target="_blank"
              rel="noopener"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition inline-flex items-center gap-2"
            >
              🔄 Récupérer les données FFDanse
            </a>

            {availableDates.length > 0 && (
              <select
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  performSearch(selectedDances, department);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {availableDates.map((d) => (
                  <option key={d.filename} value={d.filename}>
                    📅 {d.date}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Danses sélectionnées
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedDances.map((dance) => (
                <div
                  key={dance}
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                >
                  {dance}
                  <button
                    onClick={() => removeDance(dance)}
                    className="text-blue-600 hover:text-blue-800 font-bold"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                Chercher une danse
              </label>
              <div className="relative">
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Tapez le nom d'une danse..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg mt-1 z-10 shadow-lg">
                    {suggestions.map((dance) => (
                      <button
                        key={dance}
                        onClick={() => addDance(dance)}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 transition"
                      >
                        {dance}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="dept" className="block text-sm font-medium text-gray-700 mb-2">
                Département (optionnel)
              </label>
              <input
                id="dept"
                type="text"
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  performSearch(selectedDances, e.target.value);
                }}
                placeholder="Ex: 33"
                maxLength={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {selectedDances.length > 0 && (
              <button
                onClick={handleExport}
                disabled={results.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50"
              >
                📥 Exporter ({results.length} résultats)
              </button>
            )}
          </div>
        </div>

        {loading && <p className="text-center text-gray-600">Recherche en cours...</p>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {results.map((s, i) => (
              <div key={i} className="bg-white rounded-lg shadow-md p-4">
                <h3 className="text-lg font-bold text-gray-900">{s.n}</h3>
                <p className="text-sm text-gray-600">
                  {s.a}, {s.cp} {s.v}
                </p>
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  {s.t && (
                    <a href={`tel:${s.t}`} className="text-blue-600 hover:underline">
                      📞 {s.t}
                    </a>
                  )}
                  {s.e && (
                    <a href={`mailto:${s.e}`} className="text-blue-600 hover:underline">
                      ✉️ {s.e}
                    </a>
                  )}
                  {s.w && (
                    <a href={s.w} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                      🌐 Site
                    </a>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-600">Danses :</p>
                  <p className="text-xs text-gray-700">
                    {s.d.length > 3 ? `${s.d.slice(0, 3).join(', ')}...` : s.d.join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {results.length > 0 && results.some((s) => s.lat && s.lon) && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-4 h-96 overflow-hidden">
                <p className="text-sm font-semibold text-gray-600 mb-2">Localisation</p>
                <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">
                  📍 Carte (intégration en cours)
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
