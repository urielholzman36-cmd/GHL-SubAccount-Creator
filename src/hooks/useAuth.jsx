import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(null);
  const [username, setUsername] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/check')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        setAuthenticated(true);
        setUsername(data.username || null);
        setIsAdmin(!!data.is_admin);
      })
      .catch(() => {
        setAuthenticated(false);
        setUsername(null);
        setIsAdmin(false);
      });
  }, []);

  async function login(usernameInput, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuthenticated(true);
        setUsername(data.username);
        setIsAdmin(!!data.is_admin);
        return { ok: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error || 'Invalid username or password' };
      }
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthenticated(false);
    setUsername(null);
    setIsAdmin(false);
  }

  return (
    <AuthContext.Provider value={{ authenticated, username, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
