// Owned by Frontend Dev 2. Gated on the 'manager' role — ProtectedRoute
// already keeps non-managers out at the router level (see App.jsx,
// requireRole="manager"), but this component does its own secondary check
// too, same defense-in-depth pattern FinanceDashboard.jsx and
// HRDashboard.jsx already use for their permission gates.
//
// Structure (useAsync hook, StatusPill, table loading/empty/error rows,
// SectionCard) mirrors FinanceDashboard.jsx / HRDashboard.jsx so all three
// look consistent rather than a one-off design.
//
// Backend: manager.routes.js (GET /api/manager/team, GET
// /api/manager/access-requests, PUT /api/manager/access-requests/:id) is
// still being built by Backend Dev 2. Everything here is written against
// the shape described in the task and will work unchanged once those
// routes exist — see api/client.js for the exact request/response shapes
// assumed, and how USE_MOCK falls back to mock data until then.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import {
  getMyTeam,
  getManagerAccessRequests,
  reviewManagerRequest,
  getManagerOverview,
  getManagerLeaveRequests,
  decideLeaveRequest,
} from '../api/client.js';

const REQUIRED_ROLE = 'manager';

// --- Small shared helpers (same look as Finance/HR/Admin dashboards) ------

function formatDateOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function LoadingRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-400">
        Loading…
      </td>
    </tr>
  );
}

function ErrorRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-rose-500">
        {message}
      </td>
    </tr>
  );
}

function EmptyRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-400">
        {message}
      </td>
    </tr>
  );
}

function useAsync(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const refetch = () => setReloadToken((t) => t + 1);
  return [data, status, refetch];
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// GET /manager/overview reports a stat as null (rather than 0) when its
// backing table isn't merged yet (see manager.routes.js) — show that as
// "—" the same way the loading/error states already do, instead of a
// misleading 0.
function formatStat(value) {
  return value === null || value === undefined ? '—' : value;
}

function StatBlock({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

// --- My Team ----------------------------------------------------------

function MyTeam({ team, status }) {
  const colSpan = 4;
  return (
    <SectionCard title="My Team" subtitle="Employees who report to you.">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Email</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Department</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {status === 'loading' && <LoadingRow colSpan={colSpan} />}
          {status === 'error' && <ErrorRow colSpan={colSpan} message="Couldn't load your team." />}
          {status === 'ready' && (team ?? []).length === 0 && (
            <EmptyRow colSpan={colSpan} message="No one reports to you yet." />
          )}
          {status === 'ready' &&
            (team ?? []).map((member) => (
              <tr key={member.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{member.name}</td>
                <td className="px-4 py-3 text-slate-500">{member.email}</td>
                <td className="px-4 py-3 text-slate-500">{member.department ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusPill tone={member.status === 'inactive' ? 'red' : 'green'}>
                    {member.status ?? 'active'}
                  </StatusPill>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

// --- Access Requests (pending manager decision) ----------------------

function AccessRequestsReview({ requests, status, onDecided }) {
  const [pendingId, setPendingId] = useState(null);
  const [comment, setComment] = useState({}); // id -> comment text
  const [rowError, setRowError] = useState({});
  const colSpan = 5;

  const pending = (requests ?? []).filter((r) => r.status === 'PENDING_MANAGER');

  async function decide(req, decision) {
    setPendingId(req.id);
    setRowError((prev) => ({ ...prev, [req.id]: null }));
    try {
      await reviewManagerRequest(req.id, decision, comment[req.id] ?? '');
      onDecided();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [req.id]: `Couldn't ${decision === 'approved' ? 'approve' : 'reject'} this request.`,
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SectionCard
      title="Access Requests"
      subtitle="Requests from your team waiting on your decision. Approving sends it on to Admin for final sign-off."
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requester</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requested role</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requested at</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Comment</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Decision</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {status === 'loading' && <LoadingRow colSpan={colSpan} />}
          {status === 'error' && (
            <ErrorRow colSpan={colSpan} message="Couldn't load access requests." />
          )}
          {status === 'ready' && pending.length === 0 && (
            <EmptyRow colSpan={colSpan} message="Nothing waiting on you right now." />
          )}
          {status === 'ready' &&
            pending.map((req) => {
              const isBusy = pendingId === req.id;
              return (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{req.user?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{req.requestedRole?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(req.requestedAt)}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="Optional comment"
                      value={comment[req.id] ?? ''}
                      onChange={(e) =>
                        setComment((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => decide(req, 'approved')}
                          disabled={isBusy}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => decide(req, 'rejected')}
                          disabled={isBusy}
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? 'Working…' : 'Reject'}
                        </button>
                      </div>
                      {rowError[req.id] && (
                        <span className="text-xs text-rose-500">{rowError[req.id]}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </SectionCard>
  );
}

// --- Approval History (already decided by this manager) --------------

function ApprovalHistory({ requests, status }) {
  const colSpan = 4;
  const decided = (requests ?? []).filter((r) => r.status !== 'PENDING_MANAGER');

  return (
    <SectionCard title="Approval History" subtitle="Requests you've already decided on.">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requester</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requested role</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Your decision</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Comment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {status === 'loading' && <LoadingRow colSpan={colSpan} />}
          {status === 'error' && (
            <ErrorRow colSpan={colSpan} message="Couldn't load approval history." />
          )}
          {status === 'ready' && decided.length === 0 && (
            <EmptyRow colSpan={colSpan} message="No decisions yet." />
          )}
          {status === 'ready' &&
            decided.map((req) => {
              const rejected = req.status === 'REJECTED';
              return (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{req.user?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{req.requestedRole?.name}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={rejected ? 'red' : 'green'}>
                      {rejected ? 'Rejected' : 'Approved — sent to Admin'}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{req.managerComment || '—'}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </SectionCard>
  );
}

// --- Leave Requests (pending manager decision) ------------------------

function LeaveRequestsReview({ requests, status, onDecided }) {
  const [pendingId, setPendingId] = useState(null);
  const [comment, setComment] = useState({}); // id -> comment text
  const [rowError, setRowError] = useState({});
  const colSpan = 5;

  const pending = (requests ?? []).filter((r) => r.status === 'PENDING');

  async function decide(req, decision) {
    setPendingId(req.id);
    setRowError((prev) => ({ ...prev, [req.id]: null }));
    try {
      await decideLeaveRequest(req.id, decision, comment[req.id] ?? '');
      onDecided();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [req.id]: `Couldn't ${decision === 'approved' ? 'approve' : 'reject'} this request.`,
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SectionCard
      title="Leave Requests"
      subtitle="Leave requests from your team waiting on your decision."
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requester</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Dates</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Reason</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Comment</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Decision</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {status === 'loading' && <LoadingRow colSpan={colSpan} />}
          {status === 'error' && (
            <ErrorRow colSpan={colSpan} message="Couldn't load leave requests." />
          )}
          {status === 'ready' && pending.length === 0 && (
            <EmptyRow colSpan={colSpan} message="Nothing waiting on you right now." />
          )}
          {status === 'ready' &&
            pending.map((req) => {
              const isBusy = pendingId === req.id;
              return (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{req.user?.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateOnly(req.startDate)} – {formatDateOnly(req.endDate)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{req.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="Optional comment"
                      value={comment[req.id] ?? ''}
                      onChange={(e) =>
                        setComment((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => decide(req, 'approved')}
                          disabled={isBusy}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => decide(req, 'rejected')}
                          disabled={isBusy}
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? 'Working…' : 'Reject'}
                        </button>
                      </div>
                      {rowError[req.id] && (
                        <span className="text-xs text-rose-500">{rowError[req.id]}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </SectionCard>
  );
}

// --- Leave History (already decided by this manager) -------------------

function LeaveHistory({ requests, status }) {
  const colSpan = 4;
  const decided = (requests ?? []).filter((r) => r.status !== 'PENDING');

  return (
    <SectionCard title="Leave History" subtitle="Leave requests you've already decided on.">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Requester</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Dates</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Your decision</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Comment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {status === 'loading' && <LoadingRow colSpan={colSpan} />}
          {status === 'error' && (
            <ErrorRow colSpan={colSpan} message="Couldn't load leave history." />
          )}
          {status === 'ready' && decided.length === 0 && (
            <EmptyRow colSpan={colSpan} message="No decisions yet." />
          )}
          {status === 'ready' &&
            decided.map((req) => {
              const rejected = req.status === 'REJECTED';
              return (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{req.user?.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateOnly(req.startDate)} – {formatDateOnly(req.endDate)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={rejected ? 'red' : 'green'}>
                      {rejected ? 'Rejected' : 'Approved'}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{req.managerComment || '—'}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </SectionCard>
  );
}

// --- Body ---------------------------------------------------------------

function ManagerDashboardBody() {
  const [team, teamStatus] = useAsync(getMyTeam);
  const [requests, requestsStatus, refetchRequests] = useAsync(getManagerAccessRequests);
  const [overview, overviewStatus] = useAsync(getManagerOverview);
  const [leaveRequests, leaveRequestsStatus, refetchLeaveRequests] = useAsync(
    getManagerLeaveRequests
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          label="Total Employees"
          value={overviewStatus === 'ready' ? formatStat(overview?.totalEmployees) : '—'}
        />
        <StatBlock
          label="Present Today"
          value={overviewStatus === 'ready' ? formatStat(overview?.presentToday) : '—'}
        />
        <StatBlock
          label="On Leave"
          value={overviewStatus === 'ready' ? formatStat(overview?.onLeaveToday) : '—'}
        />
        <StatBlock
          label="Pending Tasks"
          value={overviewStatus === 'ready' ? formatStat(overview?.pendingTasks) : '—'}
        />
      </div>

      <MyTeam team={team} status={teamStatus} />
      <AccessRequestsReview
        requests={requests}
        status={requestsStatus}
        onDecided={refetchRequests}
      />
      <ApprovalHistory requests={requests} status={requestsStatus} />
      <LeaveRequestsReview
        requests={leaveRequests}
        status={leaveRequestsStatus}
        onDecided={refetchLeaveRequests}
      />
      <LeaveHistory requests={leaveRequests} status={leaveRequestsStatus} />
    </div>
  );
}

export default function ManagerDashboard() {
  const raw = sessionStorage.getItem('user');
  const user = raw ? JSON.parse(raw) : null;

  if (!user) {
    window.location.href = '/';
    return null;
  }

  const allowed = !!user.roles?.includes(REQUIRED_ROLE);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-400">🔒 Restricted</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-800">
            You don't have access to the Manager Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            This area is for team managers only.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-block text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-6xl p-6 md:p-10">
        <Link to="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-700">
          ← Back to Dashboard
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-8 w-1.5 rounded-full bg-indigo-500" />
          <h1 className="text-2xl font-semibold text-slate-800">Manager Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Review your team's access requests before they go to Admin.
        </p>

        <div className="mt-8">
          <ManagerDashboardBody />
        </div>
      </div>
    </div>
  );
}
