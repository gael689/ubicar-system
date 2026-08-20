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
        {/* Misma pantalla, otro corte: sólo los parámetros del sitio. Separarlos
            no es cosmético — la ventana de venta, el cupo y los datos bancarios
            se tocan pensando en el canal online, y estaban perdidos entre el
            CUIT de la empresa y los plazos del excedente. */}
        <Route path="/canal-web" element={<AppLayout title="Canal web"><ConfiguracionPage soloCanalWeb /></AppLayout>} />
        <Route path="/fechas-especiales" element={<AppLayout title="Fechas especiales"><FechasEspecialesPage /></AppLayout>} />
        {/* **Una sola pantalla de precios.** Antes había una por canal, porque
            un intento previo de unificarlas dejó un interruptor que sólo
            cambiaba la vista mientras el alta seguía creando en "los dos
            canales": se cargaba un precio pensando en la web y se le tocaba el
            precio al mostrador.

            Eso se arregla donde estaba el problema, no separando pantallas: el
            canal es ahora un campo explícito del formulario, con las tres
            opciones a la vista, y la tabla de reglas muestra los dos canales
            juntos con su columna — que además es lo que permite darse cuenta de
            que una promo se cargó en un canal y no en el otro.

            Las dos rutas viejas siguen entrando, cada una preseleccionando su
            canal: hay links a ellas repartidos por el sistema. */}
        <Route path="/precios" element={<AppLayout title="Precios"><PreciosPage /></AppLayout>} />
        <Route path="/precios/mostrador" element={<AppLayout title="Precios"><PreciosPage canalInicial="mostrador" /></AppLayout>} />
        <Route path="/precios/web" element={<AppLayout title="Precios"><PreciosPage canalInicial="web" /></AppLayout>} />
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
