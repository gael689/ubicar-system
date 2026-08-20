import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PuertaDeEntrada } from '@/components/auth/PuertaDeEntrada';
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
        <Route path="/multas" element={<AppLayout title="Multas"><MultasPage /></AppLayout>} />
        <Route path="/contratos" element={<AppLayout title="Contratos"><ContratosPage /></AppLayout>} />
        <Route path="/cotizador" element={<AppLayout title="Cotizador" fullBleed><CotizadorPage /></AppLayout>} />
        <Route path="/finanzas" element={<AppLayout title="Finanzas"><FinanzasPage /></AppLayout>} />
        <Route path="/caja" element={<Navigate to="/finanzas" replace />} />
        <Route path="/cuentas-corrientes" element={<Navigate to="/finanzas" replace />} />
        <Route path="/echeqs" element={<Navigate to="/finanzas" replace />} />
        <Route path="/reportes" element={<AppLayout title="Reportes"><ReportesPage /></AppLayout>} />
        <Route path="/notificaciones" element={<AppLayout title="Notificaciones"><NotificacionesPage /></AppLayout>} />
        <Route path="/configuracion" element={<AppLayout title="Configuración"><ConfiguracionPage /></AppLayout>} />
        <Route path="/fechas-especiales" element={<AppLayout title="Fechas especiales"><FechasEspecialesPage /></AppLayout>} />
        {/* Una pantalla por canal. El canal no es un filtro de la vista: define
            qué precios se están tocando, y confundirlos cambia lo que factura
            el otro lado sin que nadie lo haya pedido. */}
        <Route path="/precios" element={<Navigate to="/precios/mostrador" replace />} />
        <Route path="/precios/mostrador" element={<AppLayout title="Precios de mostrador"><PreciosPage canal="mostrador" /></AppLayout>} />
        <Route path="/precios/web" element={<AppLayout title="Precios de la web"><PreciosPage canal="web" /></AppLayout>} />
        <Route path="/precios/simulador" element={<AppLayout title="Simulador de precios"><SimuladorPage /></AppLayout>} />
        <Route path="/adicionales" element={<AppLayout title="Adicionales"><AdicionalesPage /></AppLayout>} />
        <Route path="/reservas-web" element={<AppLayout title="Reservas web"><ReservasWebPage /></AppLayout>} />
        <Route path="/auditoria" element={<AppLayout title="Auditoría"><AuditoriaPage /></AppLayout>} />
        <Route path="*" element={<Navigate to="/ocupacion" replace />} />
      </Routes>
    </BrowserRouter>
    </PuertaDeEntrada>
  );
}
