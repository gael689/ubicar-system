import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { FlotaList } from '@/pages/flota/FlotaList';
import { FlotaDetail } from '@/pages/flota/FlotaDetail';
import { ClientesList } from '@/pages/clientes/ClientesList';
import { ClienteDetail } from '@/pages/clientes/ClienteDetail';
import { ReservasList } from '@/pages/reservas/ReservasList';
import { CotizadorPage } from '@/pages/cotizador/CotizadorPage';
import { MultasPage } from '@/pages/multas/MultasPage';
import { FinanzasPage } from '@/pages/finanzas/FinanzasPage';
import { ReportesPage } from '@/pages/reportes/ReportesPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/ocupacion" replace />} />
        <Route
          path="/ocupacion"
          element={<AppLayout title="Ocupación"><Dashboard /></AppLayout>}
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
        <Route path="/contratos" element={<AppLayout title="Contratos"><PlaceholderPage title="Contratos Digitales" /></AppLayout>} />
        <Route path="/cotizador" element={<AppLayout title="Cotizador" fullBleed><CotizadorPage /></AppLayout>} />
        <Route path="/finanzas" element={<AppLayout title="Finanzas"><FinanzasPage /></AppLayout>} />
        <Route path="/caja" element={<Navigate to="/finanzas" replace />} />
        <Route path="/cuentas-corrientes" element={<Navigate to="/finanzas" replace />} />
        <Route path="/echeqs" element={<Navigate to="/finanzas" replace />} />
        <Route path="/reportes" element={<AppLayout title="Reportes"><ReportesPage /></AppLayout>} />
        <Route path="*" element={<Navigate to="/ocupacion" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
