import { Menu } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

// Auth real (Clerk) se integra en una fase posterior. Mientras tanto, mostramos
// los datos del admin de dev hardcodeados — coinciden con el seed del backend.
const DEV_USER = {
  email: 'dev@ubicarrent.com',
  nombre: 'Dev Admin',
};

export function Header({ title, onMenuClick }: HeaderProps) {
  const initials = DEV_USER.nombre
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-sm text-muted-foreground">{DEV_USER.email}</span>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
