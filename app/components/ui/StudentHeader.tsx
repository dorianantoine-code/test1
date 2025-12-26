'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from '../../styles/readable.module.css'; // ← garde les mêmes styles

type PageLink = { href: string; label: string };

export default function StudentHeader({
  prenom,
  photoUrl,
  pages = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/ed/agenda', label: 'EDT' },
    { href: '/ed/cdt',    label: 'CDT' },
    { href: '/configuration', label: 'Configuration' },
    { href: '/ed/eleves', label: 'Élèves' },
  ],
}: {
  prenom?: string;
  photoUrl?: string;
  pages?: PageLink[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [debugMode, setDebugMode] = useState(false);

  // Fallback: si pas de props, on tente la sessionStorage (si déjà renseignée dans ton app)
  const [name, setName] = useState(prenom);
  const [photo, setPhoto] = useState(photoUrl);

  useEffect(() => {
    if (!prenom) {
      try {
        const s = sessionStorage.getItem('ed_selected_eleve_name');
        if (s) setName(s);
      } catch {}
    }
    if (!photoUrl) {
      try {
        const s = sessionStorage.getItem('ed_selected_eleve_photo');
        if (s) setPhoto(s);
      } catch {}
    }
  }, [prenom, photoUrl]);

  // Charge le mode debug depuis le stockage local
  useEffect(() => {
    try {
      const dbg = localStorage.getItem('prefers-debug-mode');
      if (dbg) setDebugMode(dbg === 'true');
    } catch {}
  }, []);

  // Adapte la destination du lien Dashboard en fonction du mode debug
  const resolvedPages = useMemo(() => {
    const mapped = pages.map((p) =>
      p.href === '/dashboard' ? { ...p, href: debugMode ? '/dashboard-debug' : '/dashboard' } : p,
    );
    // supprime les doublons de href pour éviter les clés identiques
    const seen = new Set<string>();
    return mapped.filter((p) => {
      if (seen.has(p.href)) return false;
      seen.add(p.href);
      return true;
    });
  }, [pages, debugMode]);

  // Fermeture clic extérieur / Escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  function absolutePhoto(src?: string | null) {
    if (!src) return undefined;
    if (src.startsWith('//')) return 'https:' + src;
    return src;
  }
  function proxiedPhoto(src?: string | null) {
    const abs = absolutePhoto(src || undefined);
    if (!abs) return undefined;
    if (abs.startsWith('http')) return `/api/ed/img?u=${encodeURIComponent(abs)}`;
    return abs;  
 }
const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .map((s) => s[0]?.toUpperCase())
      .slice(0, 2)
      .join('') || 'É';

  return (
    <div className={styles.readable}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          {/* Gauche : avatar + prénom */}
          <div className={styles.pageHeaderLeft}>
            {photo ? (
              <img src={proxiedPhoto(photo)} alt={name ?? 'Élève'} referrerPolicy="no-referrer" className={styles.avatar} />
            ) : (
              <div className={styles.avatarFallback} aria-hidden>
                {initials}
              </div>
            )}
            <div className={styles.studentName} title={name ?? 'Élève'}>
              {name ?? 'Élève'}
            </div>
          </div>

          {/* Droite : bouton burger + menu */}
          <div className={styles.menuRoot} ref={rootRef}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              {/* Icône burger (blanche via color: currentColor) */}
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>

            {open && (
              <div role="menu" className={styles.menuList}>
                {resolvedPages.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {p.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
