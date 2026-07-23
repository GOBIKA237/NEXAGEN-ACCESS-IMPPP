import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/client.js';

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="h-9 w-9 rounded-full bg-slate-200" />
      <div className="space-y-1.5">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="h-2.5 w-20 rounded bg-slate-200" />
      </div>
    </div>
  );
}

// Shared top bar for any authenticated page: wordmark + logged-in user +
// logout. Reads the session straight from sessionStorage instead of taking
// a `user` prop, so Dashboard.jsx and AdminDashboard.jsx can each drop in
// <Header /> as-is without threading state down or duplicating the logout
// handler that used to only exist (per-page) in Dashboard.
//
// Session state here is read independently of whatever each page's own
// auth check is doing (e.g. Dashboard's redirect-if-logged-out effect) —
// if sessionStorage is empty this just renders nothing, so it never fights
// with a page's own "kick back to /" logic.
export default function Header() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('user');

    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch (err) {
        console.error('Failed to parse user from sessionStorage:', err);
      }
    }

    setChecked(true);
  }, []);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="border-b border-slate-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-slate-800">
          AccessOS
        </span>

        {!checked ? (
          <HeaderSkeleton />
        ) : user ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              {initials(user.name)}
            </div>
            <div className="min-w-0 text-right sm:text-left">
              <p className="truncate text-sm font-medium text-slate-800">
                {user.name}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="ml-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}