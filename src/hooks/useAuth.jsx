import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(null);
  const [username, setUsername] = useState(null);

  useEffect(() => {
    fetch('/api/auth/check')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        setAuthenticated(true);
        setUsername(data.username || null);
      })
      .catch(() => {
        setAuthenticated(false);
        setUsername(null);
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
  }

  return (
    <AuthContext.Provider value={{ authenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
