// app/configuration/agenda/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StudentHeader from '../../components/ui/StudentHeader';
import styles from '../../styles/readable.module.css';

type EventType = 'Sport' | 'Musique' | 'Cours particulier' | 'Autres';
type APEvent = {
  id: number;
  ed_eleve_id: number;
  ed_account_id: number;
  event_type: EventType;
  days: number[]; // 1..7
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

const EVENT_TYPES: EventType[] = ['Sport', 'Musique', 'Cours particulier', 'Autres'];

// 1=lundi, ..., 7=dimanche
const DAYS = [
  { value: 1, label: 'lundi' },
  { value: 2, label: 'mardi' },
  { value: 3, label: 'mercredi' },
  { value: 4, label: 'jeudi' },
  { value: 5, label: 'vendredi' },
  { value: 6, label: 'samedi' },
  { value: 7, label: 'dimanche' },
];

function formatDays(days: number[]) {
  const sorted = [...(days || [])].sort((a, b) => a - b);
  const map = new Map(DAYS.map((d) => [d.value, d.label]));
  return sorted
    .map((d) => map.get(d))
    .filter(Boolean)
    .join(', ');
}

export default function AgendaPersoPage() {
  const [token, setToken] = useState<string | null>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);

  // Formulaire ajout
  const [eventType, setEventType] = useState<EventType>('Sport');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [note, setNote] = useState<string>('');

  // Listing
  const [items, setItems] = useState<APEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // Édition inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState<EventType>('Sport');
  const [editDays, setEditDays] = useState<number[]>([]);
  const [editNote, setEditNote] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Init session storage
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const sid = sessionStorage.getItem('ed_selected_eleve_id');
      setToken(t);
      setEleveId(sid ? Number(sid) : null);
    } catch {}
  }, []);

  // Charger liste
  async function reload() {
    if (!eleveId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/agenda_perso/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eleveId: Number(eleveId) }),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setItems(json.items || []);
    } catch (e: any) {
      setErr(e?.message || 'Erreur chargement agenda perso');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (eleveId) reload();
  }, [eleveId]);

  function toggleDay(day: number, current: number[], setter: (d: number[]) => void) {
    const set = new Set(current);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    setter(Array.from(set).sort((a, b) => a - b));
  }

  // Ajouter
  async function addEvent() {
    if (!eleveId) return;
    if (!selectedDays.length) {
      alert('Sélectionne au moins un jour.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/agenda_perso/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eleveId: Number(eleveId),
          eventType,
          days: selectedDays,
          note: note?.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      // reset form + reload
      setSelectedDays([]);
      setNote('');
      setEventType('Sport');
      await reload();
    } catch (e: any) {
      alert(e?.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  }

  // Éditer
  function startEdit(row: APEvent) {
    setEditingId(row.id);
    setEditType(row.event_type);
    setEditDays(row.days || []);
    setEditNote(row.note || '');
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit() {
    if (!eleveId || !editingId) return;
    if (!editDays.length) {
      alert('Sélectionne au moins un jour.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/agenda_perso/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          eleveId: Number(eleveId),
          eventType: editType,
          days: editDays,
          note: editNote?.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setEditingId(null);
      await reload();
    } catch (e: any) {
      alert(e?.message || 'Erreur mise à jour');
    } finally {
      setSaving(false);
    }
  }

  // Supprimer
  async function delRow(id: number) {
    if (!eleveId) return;
    if (!confirm('Supprimer cet élément ?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/agenda_perso/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, eleveId: Number(eleveId) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await reload();
    } catch (e: any) {
      alert(e?.message || 'Erreur suppression');
    } finally {
      setDeletingId(null);
    }
  }

  const hasItems = useMemo(() => (items || []).length > 0, [items]);

  return (
    <div className={styles.readable}>
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <StudentHeader
            pages={[
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/ed/agenda', label: 'EDT' },
              { href: '/ed/cdt', label: 'CDT' },
              { href: '/configuration', label: 'Configuration' },
              { href: '/ed/eleves', label: 'Élèves' },
              { href: '/', label: 'Déconnexion' },
            ]}
          />

          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Configuration · Agenda perso</h1>
            <Link href="/configuration" className="text-sm underline opacity-75 hover:opacity-100">
              ← Retour configuration
            </Link>
          </div>

          {/* Zone d'ajout */}
          <section className="rounded-2xl border p-6 space-y-4">
            <h2 className="text-lg font-medium">Ajouter un évènement récurrent</h2>

            {!token || !eleveId ? (
              <div className="rounded-lg border p-4 text-sm">
                Impossible de charger : token ou élève non défini.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm">
                  <span>J&apos;ai&nbsp;</span>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as EventType)}
                    className="border rounded-md px-2 py-1"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span>&nbsp;tous les :</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const checked = selectedDays.includes(d.value);
                    return (
                      <label
                        key={d.value}
                        className={[
                          'px-3 py-1.5 rounded-full border text-sm cursor-pointer select-none',
                          checked ? 'bg-black text-white' : 'hover:bg-black/5',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDay(d.value, selectedDays, setSelectedDays)}
                          className="hidden"
                        />
                        {d.label}
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label className="text-sm block mb-1">Note (facultatif)</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="détails…"
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={addEvent}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg border bg-black text-white disabled:opacity-60"
                  >
                    {saving ? 'Enregistrement…' : 'Ajouter'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Zone list / édition / suppression */}
          <section className="rounded-2xl border p-6 space-y-4">
            <h2 className="text-lg font-medium">Mes évènements</h2>

            {loading ? (
              <div className="rounded-lg border p-4 text-sm">Chargement…</div>
            ) : err ? (
              <div className="rounded-lg border p-4 text-sm text-red-600">Erreur : {err}</div>
            ) : !hasItems ? (
              <div className="rounded-lg border p-4 text-sm">Aucun élément pour l’instant.</div>
            ) : (
              <div className="space-y-3">
                {items.map((row) => {
                  const isEditing = editingId === row.id;
                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                      {!isEditing ? (
                        <>
                          <div className="flex-1">
                            <div className="text-sm opacity-60">Type</div>
                            <div className="font-medium">{row.event_type}</div>
                            <div className="mt-2 text-sm">
                              J&apos;ai <b>{row.event_type}</b> tous les&nbsp;
                              <b>{formatDays(row.days)}</b>
                              {row.note ? (
                                <>
                                  {' '}
                                  — <i>{row.note}</i>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="px-3 py-2 rounded-lg border"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => delRow(row.id)}
                              disabled={deletingId === row.id}
                              className="px-3 py-2 rounded-lg border text-red-600"
                            >
                              {deletingId === row.id ? 'Suppression…' : 'Supprimer'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1">
                            <div className="text-sm">J&apos;ai</div>
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as EventType)}
                              className="border rounded-md px-2 py-1 mt-1"
                            >
                              {EVENT_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <div className="mt-3 text-sm">tous les :</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {DAYS.map((d) => {
                                const checked = editDays.includes(d.value);
                                return (
                                  <label
                                    key={d.value}
                                    className={[
                                      'px-3 py-1.5 rounded-full border text-sm cursor-pointer select-none',
                                      checked ? 'bg-black text-white' : 'hover:bg-black/5',
                                    ].join(' ')}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDay(d.value, editDays, setEditDays)}
                                      className="hidden"
                                    />
                                    {d.label}
                                  </label>
                                );
                              })}
                            </div>

                            <div className="mt-3">
                              <label className="text-sm block mb-1">Note (facultatif)</label>
                              <input
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                className="w-full border rounded-md px-3 py-2"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 md:flex-col">
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={saving}
                              className="px-3 py-2 rounded-lg border bg-black text-white disabled:opacity-60"
                            >
                              {saving ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-3 py-2 rounded-lg border"
                            >
                              Annuler
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
