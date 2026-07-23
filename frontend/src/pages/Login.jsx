import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/client.js';

// Shown while we check sessionStorage for an existing session, instead of
// flashing the real login form for someone who's actually already signed
// in (they get redirected straight past this — see the effect below).
function LoginSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md animate-pulse rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="h-6 w-32 rounded bg-slate-200" />
          <div className="h-3 w-40 rounded bg-slate-200" />
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="h-3 w-16 rounded bg-slate-200" />
            <div className="h-9 w-full rounded-lg bg-slate-200" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-9 w-full rounded-lg bg-slate-200" />
          </div>
          <div className="h-9 w-full rounded-lg bg-slate-300" />
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState('login');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });

  // Field-level validation errors, shown inline under each input
  const [fieldErrors, setFieldErrors] = useState({
    name: '',
    email: '',
    password: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Whether we've finished checking for an existing session on mount. Kept
  // separate from `loading` (that's for the submit button) so the skeleton
  // below only ever covers this first check, never a form submission.
  const [checkingSession, setCheckingSession] = useState(true);

  const isLogin = mode === 'login';

  // If there's already a valid-looking session, don't flash the login form
  // — send them straight to where they'd land after signing in. Mirrors
  // the sessionStorage read Dashboard.jsx already does on its own mount.
  useEffect(() => {
    const rawUser = sessionStorage.getItem('user');
    const token = sessionStorage.getItem('token');

    if (rawUser && token) {
      try {
        const existingUser = JSON.parse(rawUser);
        navigate(existingUser?.roles?.includes('admin') ? '/admin' : '/dashboard');
        return;
      } catch (err) {
        // Malformed JSON in sessionStorage — treat same as "not logged in"
        console.error('Failed to parse user from sessionStorage:', err);
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
      }
    }

    setCheckingSession(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear that field's inline error as soon as the person edits it
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  }

  function switchMode() {
    setMode(isLogin ? 'register' : 'login');

    setError('');
    setSuccess('');
    setFieldErrors({ name: '', email: '', password: '' });

    setForm({
      name: '',
      email: '',
      password: '',
    });
  }

  // Client-side validation before we ever hit the API.
  // Returns true if the form is valid.
  function validate() {
    const nextErrors = { name: '', email: '', password: '' };

    if (!isLogin && !form.name.trim()) {
      nextErrors.name = 'Name is required.';
    }

    if (!form.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!form.password) {
      nextErrors.password = 'Password is required.';
    } else if (form.password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.';
    }

    setFieldErrors(nextErrors);

    return !nextErrors.name && !nextErrors.email && !nextErrors.password;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (loading) return;

    setError('');
    setSuccess('');

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      // =========================
      // LOGIN
      // =========================

      if (isLogin) {
        const { token, user } = await login(
          form.email,
          form.password
        );

        // Store JWT
        sessionStorage.setItem('token', token);

        // Store logged-in user details
        sessionStorage.setItem(
          'user',
          JSON.stringify(user)
        );

        // Redirect based on role. Login response returns `roles` (an
        // array) per docs/api-contract.md, not a single `role` string.
        if (user?.roles?.includes('admin')) {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }

      // =========================
      // REGISTER
      // =========================

      else {
        await register(
          form.name,
          form.email,
          form.password
        );

        // Switch back to login page
        setMode('login');
        setFieldErrors({ name: '', email: '', password: '' });

        setSuccess(
          'Account created successfully. You can now sign in.'
        );

        // Keep the email so the user does not
        // need to type it again
        setForm({
          name: '',
          email: form.email,
          password: '',
        });
      }
    } catch (err) {
      console.error('Authentication error:', err);

      const status = err.response?.status;
      const serverMessage =
        err.response?.data?.error || err.response?.data?.message;

      let message = serverMessage;

      if (!message) {
        if (!err.response) {
          message = 'Could not reach the server. Please try again.';
        } else if (isLogin && status === 401) {
          message = 'Invalid email or password.';
        } else if (!isLogin && status === 409) {
          message = 'That email is already registered.';
        } else if (status === 400) {
          message = 'Please fill in all required fields.';
        } else {
          message = isLogin
            ? 'Invalid credentials. Please try again.'
            : 'Registration failed. Please try again.';
        }
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return <LoginSkeleton />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">

        {/* HEADER */}

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">
            AccessOS
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            {isLogin
              ? 'Sign in to your account'
              : 'Create a new account'}
          </p>
        </div>

        {/* ERROR MESSAGE */}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* SUCCESS MESSAGE */}

        {success && (
          <div
            role="status"
            className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        {/* FORM */}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4"
        >

          {/* NAME - REGISTER ONLY */}

          {!isLogin && (
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Name
              </label>

              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                aria-invalid={Boolean(fieldErrors.name)}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent ${
                  fieldErrors.name
                    ? 'border-red-300 focus:ring-red-400'
                    : 'border-slate-300 focus:ring-slate-500'
                }`}
                placeholder="Test Employee"
              />

              {fieldErrors.name && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
              )}
            </div>
          )}

          {/* EMAIL */}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.email)}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent ${
                fieldErrors.email
                  ? 'border-red-300 focus:ring-red-400'
                  : 'border-slate-300 focus:ring-slate-500'
              }`}
              placeholder="you@nexagen.com"
            />

            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          {/* PASSWORD */}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.password)}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent ${
                fieldErrors.password
                  ? 'border-red-300 focus:ring-red-400'
                  : 'border-slate-300 focus:ring-slate-500'
              }`}
              placeholder="••••••••"
            />

            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          {/* SUBMIT BUTTON */}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 text-white text-sm font-medium py-2.5 hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading && <Spinner />}
            {loading
              ? 'Please wait...'
              : isLogin
              ? 'Sign in'
              : 'Create account'}
          </button>
        </form>

        {/* SWITCH LOGIN / REGISTER */}

        <p className="mt-6 text-center text-sm text-slate-500">
          {isLogin
            ? "Don't have an account? "
            : 'Already have an account? '}

          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-slate-800 hover:underline"
          >
            {isLogin ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}