import { Menu, Search } from 'lucide-react';
import { UserButton, useUser } from '@clerk/react';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  onSearchClick: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export function Header({ title, onMenuClick, onSearchClick }: HeaderProps) {
  // Reemplaza al usuario de desarrollo hardcodeado: ahora es quien
  // efectivamente inició sesión, que es el mismo nombre que el backend
  // registra en "cobrado por" y "autorizado por".
  const { user } = useUser();
  const identidad =
    user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? '';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      </div>

      <button
        onClick={onSearchClick}
        className="hidden sm:flex items-center gap-2 flex-1 max-w-xs rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="text-[10px] border border-border rounded px-1 py-0.5 bg-card">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onSearchClick}
          className="sm:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" />
        </button>
        <span className="hidden sm:block text-sm text-muted-foreground">{identidad}</span>
        {/* El destino tras cerrar sesión lo define `afterSignOutUrl` del
            ClerkProvider (main.tsx): acá ya no es una prop válida. */}
        <UserButton appearance={{ elements: { avatarBox: 'h-8 w-8' } }} />
      </div>
    </header>
  );
}
