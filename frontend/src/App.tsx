import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PuertaDeEntrada } from '@/components/auth/PuertaDeEntrada';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { FlotaList } from '@/pages/flota/FlotaList';
import { FlotaDetail } from '@/pages/flota/FlotaDetail';
import { CategoriasPage } from '@/pages/flota/CategoriasPage';
import { ClientesList } from '@/pages/clientes/ClientesList';
import { ClienteDetail } from '@/pages/clientes/ClienteDetail';
import { ReservasList } from '@/pages/reservas/ReservasList';
import { CotizadorPage } from '@/pages/cotizador/CotizadorPage';
import { MultasPage } from '@/pages/multas/MultasPage';
import { FinanzasPage } from '@/pages/finanzas/FinanzasPage';
import { ContratosPage } from '@/pages/contratos/ContratosPage';
import { ReportesPage } from '@/pages/reportes/ReportesPage';
import { ConfiguracionPage } from '@/pages/configuracion/ConfiguracionPage';
import { FechasEspecialesPage } from '@/pages/fechas-especiales/FechasEspecialesPage';
import { NotificacionesPage } from '@/pages/notificaciones/NotificacionesPage';
import { SimuladorPage } from './pages/precios/SimuladorPage';
import { PreciosPage } from '@/pages/precios/PreciosPage';
import { AdicionalesPage } from '@/pages/adicionales/AdicionalesPage';
import { ReservasWebPage } from '@/pages/reservas/ReservasWebPage';
import { AuditoriaPage } from '@/pages/auditoria/AuditoriaPage';

export default function App() {
  return (
    <PuertaDeEntrada>
    {/* La red debajo de todo: sin esto, un campo nulo inesperado deja la
        pantalla en blanco, sin menú y sin mensaje. Va adentro de la puerta de
        entrada para que un error de render no parezca un problema de sesión. */}
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/ocupacion" replace />} />
        <Route
          path="/ocupacion"
          element={<AppLayout title="Ocupación" fullBleed><Dashboard /></AppLayout>}
        />
        <Route
          path="/flota"
          element={<AppLayout title="Flota"><FlotaList /></AppLayout>}
        />
        <Route
          path="/flota/:id"
          element={<AppLayout title="Flota"><FlotaDetail /></AppLayout>}
        />
        <Route
          path="/flota/categorias"
          element={<AppLayout title="Flota"><CategoriasPage /></AppLayout>}
        />
        <Route
          path="/reservas"
          element={<AppLayout title="Reservas y Alquileres"><ReservasList /></AppLayout>}
        />
        <Route
          path="/clientes"
          element={<AppLayout title="Clientes"><ClientesList /></AppLayout>}
        />
        <Route
          path="/clientes/:id"
          element={<AppLayout title="Clientes"><ClienteDetail /></AppLayout>}
        />
        <Route path="/multas" element={<AppLayout title="Flota"><MultasPage /></AppLayout>} />
        <Route path="/contratos" element={<AppLayout title="Contratos"><ContratosPage /></AppLayout>} />
        <Route path="/cotizador" element={<AppLayout title="Cotizador" fullBleed><CotizadorPage /></AppLayout>} />
        <Route path="/finanzas" element={<AppLayout title="Finanzas"><FinanzasPage /></AppLayout>} />
        <Route path="/caja" element={<Navigate to="/finanzas?tab=caja" replace />} />
        <Route path="/cuentas-corrientes" element={<Navigate to="/finanzas?tab=cc" replace />} />
        <Route path="/echeqs" element={<Navigate to="/finanzas?tab=echeqs" replace />} />
        <Route path="/reportes" element={<AppLayout title="Reportes"><ReportesPage /></AppLayout>} />
        <Route path="/notificaciones" element={<AppLayout title="Notificaciones"><NotificacionesPage /></AppLayout>} />
        <Route path="/configuracion" element={<AppLayout title="Configuración"><ConfiguracionPage /></AppLayout>} />
        {/* Misma pantalla, otro corte: sólo los parámetros del sitio. Separarlos
            no es cosmético — la ventana de venta, el cupo y los datos bancarios
            se tocan pensando en el canal online, y estaban perdidos entre el
            CUIT de la empresa y los plazos del excedente. */}
        <Route path="/canal-web" element={<AppLayout title="Canal web"><ConfiguracionPage soloCanalWeb /></AppLayout>} />
        <Route path="/fechas-especiales" element={<AppLayout title="Fechas especiales"><FechasEspecialesPage /></AppLayout>} />
        {/* **Un solo precio, una sola pantalla** (04/10/2026). Las dos rutas
            viejas redirigen acá: hay links a ellas repartidos por el sistema. */}
        <Route path="/precios" element={<AppLayout title="Precios"><PreciosPage /></AppLayout>} />
        <Route path="/precios/mostrador" element={<Navigate to="/precios" replace />} />
        <Route path="/precios/web" element={<Navigate to="/precios" replace />} />
        <Route path="/precios/simulador" element={<AppLayout title="Simulador de precios"><SimuladorPage /></AppLayout>} />
        <Route path="/adicionales" element={<AppLayout title="Adicionales"><AdicionalesPage /></AppLayout>} />
        <Route path="/reservas-web" element={<AppLayout title="Reservas web"><ReservasWebPage /></AppLayout>} />
        <Route path="/auditoria" element={<AppLayout title="Auditoría"><AuditoriaPage /></AppLayout>} />
        <Route path="*" element={<Navigate to="/ocupacion" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
    </PuertaDeEntrada>
  );
}
