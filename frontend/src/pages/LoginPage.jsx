import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, BASE } from '../api';
import { useSession } from '../session';

const ERRORS = {
  not_allowed: 'This Google account is not allowed to sign up here. Ask the owner to invite you.',
  email_not_verified: 'Your Google email address is not verified.',
  account_conflict: 'This email already belongs to a different Google account.',
};

export default function LoginPage() {
  const { me, refresh } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const googleError = params.get('error');
  const [options, setOptions] = useState({ google: false, passwordSignup: true });
  const [mode, setMode] = useState('signin'); // signin | create
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/options').then(setOptions).catch(() => {}); // offline: keep the defaults
  }, []);

  if (me) return <Navigate to="/all" replace />;

  const creating = mode === 'create' && options.passwordSignup;
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (creating && password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.post(creating ? '/api/auth/register' : '/api/auth/login', { username, password });
      await refresh();
      nav('/all');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">{creating ? 'Create an account' : 'Sign in'}</Typography>
            <Typography color="text.secondary">
              Signing in syncs your lists across devices and lets you share them. Your lists on this device are kept and
              merged with your account.
            </Typography>
            {googleError && <Alert severity="error">{ERRORS[googleError] ?? 'Sign-in failed. Please try again.'}</Alert>}

            {options.passwordSignup && (
              <Tabs value={mode} onChange={(_, v) => { setMode(v); setError(null); }} variant="fullWidth">
                <Tab value="signin" label="Sign in" />
                <Tab value="create" label="Create account" />
              </Tabs>
            )}

            <form onSubmit={submit}>
              <Stack spacing={2}>
                <TextField
                  name="username" label="Username" value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username" autoCapitalize="none" required
                  helperText={creating ? '3 to 30 characters: letters, digits, dot, dash, underscore' : undefined}
                />
                <TextField
                  name="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={creating ? 'new-password' : 'current-password'} required
                  helperText={creating ? 'At least 8 characters' : undefined}
                />
                {creating && (
                  <TextField
                    name="confirm" label="Repeat password" type="password" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required
                  />
                )}
                {creating && (
                  <Alert severity="info">
                    Only a username and password are stored, no email or other personal details. That also means a
                    forgotten password cannot be reset, so keep it somewhere safe.
                  </Alert>
                )}
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" size="large" disabled={busy || !username || !password}>
                  {creating ? 'Create account' : 'Sign in'}
                </Button>
              </Stack>
            </form>

            {options.google && (
              <>
                <Divider>or</Divider>
                {/* A full page navigation: the server redirects on to Google. */}
                <Button variant="outlined" size="large" startIcon={<GoogleIcon />} href={`${BASE}/oauth2/authorization/google`}>
                  Continue with Google
                </Button>
              </>
            )}
            <Button onClick={() => nav('/all')}>Continue without signing in</Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
