import { createContext, useCallback, useContext, useState } from 'react';
import { Button, Snackbar } from '@mui/material';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

/** `toast(message, { label: 'Undo', run })` shows one snackbar at a time. */
export function ToastProvider({ children }) {
  const [item, setItem] = useState(null);
  const toast = useCallback((message, action) => setItem({ message, action, key: Date.now() }), []);
  const close = (_, reason) => reason !== 'clickaway' && setItem(null);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <Snackbar
        key={item?.key}
        open={!!item}
        autoHideDuration={5000}
        onClose={close}
        message={item?.message}
        sx={{ bottom: { xs: 92, md: 24 } }}
        action={item?.action && (
          <Button color="secondary" size="small" onClick={() => { item.action.run(); setItem(null); }}>
            {item.action.label}
          </Button>
        )}
      />
    </Ctx.Provider>
  );
}
