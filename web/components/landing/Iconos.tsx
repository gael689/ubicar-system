import {
  Building2, CalendarDays, Car, Check, Clock, CreditCard, FileCheck, FileText, Handshake,
  IdCard, MapPin, MessageCircle, Mountain, Plane, Search, ShieldCheck, TrendingDown, Truck,
  Users, Wallet, Wrench, type LucideIcon,
} from "lucide-react";
import type { NombreIcono } from "@/lib/landings";

/**
 * Los datos de las páginas (`lib/landings.ts`) piden íconos por nombre, para no
 * mezclar componentes de React con contenido. Acá se resuelven.
 */
const ICONOS: Record<NombreIcono, LucideIcon> = {
  seguro: ShieldCheck,
  precio: Wallet,
  lugar: MapPin,
  avion: Plane,
  reloj: Clock,
  calendario: CalendarDays,
  contrato: FileText,
  whatsapp: MessageCircle,
  baja: TrendingDown,
  camion: Truck,
  llave: Wrench,
  documento: FileCheck,
  auto: Car,
  edificio: Building2,
  personas: Users,
  terreno: Mountain,
  carnet: IdCard,
  check: Check,
  buscar: Search,
  tarjeta: CreditCard,
  apreton: Handshake,
};

export function Icono({ nombre, className }: { nombre: NombreIcono; className?: string }) {
  const Componente = ICONOS[nombre];
  return <Componente className={className} aria-hidden="true" />;
}
