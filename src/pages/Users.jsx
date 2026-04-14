import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';
import Spinner from '../components/Spinner';

export default function Users() {
  const { username: currentUsername, isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  async function fetchUsers() {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      toast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, display_name: newDisplayName || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        toast('User created successfully', 'success');
        fetchUsers();
      } else {
        toast(data.error || 'Failed to create user', 'error');
      }
    } catch {
      toast('Network error', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/auth/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast(`User "${user.username}" deleted`, 'success');
        fetchUsers();
      } else {
        toast(data.error || 'Failed to delete user', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">User Management</h1>
        <p className="text-white/40 mt-1 text-sm">Add, view, and remove users who can access this app.</p>
      </div>

      {/* Users list */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Current Users</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 flex justify-center"><Spinner /></div>
        ) : users.length === 0 ? (
          <div className="px-5 py-8 text-center text-white/30 text-sm">No users found</div>
        ) : (
          <div className="divide-y divide-white/5">
            {users.map((user) => {
              const isSelf = user.username === currentUsername;
              return (
                <div key={user.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar circle */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {(user.display_name || user.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">
                        {user.display_name || user.username}
                        {!!user.is_admin && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">Admin</span>}
                        {isSelf && <span className="ml-2 text-xs text-white/30">(you)</span>}
                      </p>
                      <p className="text-xs text-white/30">@{user.username} &middot; joined {new Date(user.created_at + 'Z').toLocaleDateString()}</p>
                    </div>
                  </div>
                  {isAdmin && !isSelf && (
                    <button
                      onClick={() => handleDelete(user)}
                      className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add user form (admin only) */}
      {isAdmin ? (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Add New User</h2>
          </div>
          <form onSubmit={handleCreate} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition"
                  placeholder="e.g. john_doe"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 rounded-lg text-white font-semibold text-sm transition-all disabled:opacity-40 bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] hover:opacity-90 shadow-lg shadow-[#3b82f6]/20 cursor-pointer"
              >
                {creating ? 'Creating...' : 'Add User'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="glass rounded-xl px-5 py-4 text-center">
          <p className="text-sm text-white/30">Only admins can manage users</p>
        </div>
      )}
    </div>
  );
}
