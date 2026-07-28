"""
Tests del limitador de peticiones.

Lo que se protege: que `POST /public/holds` no pueda dejar la flota sin cupo.
Sin límite, un script puede pedir holds en loop y agotar la disponibilidad en
segundos sin pagar nada.
"""
from app.core.rate_limit import LimitadorPorIP


class TestLimitadorPorIP:
    def test_deja_pasar_hasta_el_maximo(self):
        lim = LimitadorPorIP(maximo=3, ventana_segundos=60)
        assert all(lim.permitir("1.1.1.1")[0] for _ in range(3))

    def test_frena_al_superar_el_maximo(self):
        lim = LimitadorPorIP(maximo=3, ventana_segundos=60)
        for _ in range(3):
            lim.permitir("1.1.1.1")
        permitido, espera = lim.permitir("1.1.1.1")
        assert permitido is False
        assert espera > 0

    def test_cada_ip_tiene_su_propio_contador(self):
        """Una familia detrás del mismo router comparte IP, pero dos visitantes
        distintos no se tienen que bloquear entre sí."""
        lim = LimitadorPorIP(maximo=2, ventana_segundos=60)
        lim.permitir("1.1.1.1")
        lim.permitir("1.1.1.1")
        assert lim.permitir("1.1.1.1")[0] is False
        assert lim.permitir("2.2.2.2")[0] is True

    def test_la_ventana_se_desliza(self):
        """Al vencer la ventana se vuelve a permitir. Se simula moviendo el
        reloj interno en vez de esperar de verdad."""
        lim = LimitadorPorIP(maximo=2, ventana_segundos=60)
        lim.permitir("1.1.1.1")
        lim.permitir("1.1.1.1")
        assert lim.permitir("1.1.1.1")[0] is False

        # Envejecer las peticiones registradas más allá de la ventana.
        cola = lim._peticiones["1.1.1.1"]
        for i in range(len(cola)):
            cola[i] -= 61

        assert lim.permitir("1.1.1.1")[0] is True

    def test_purga_las_ips_que_dejaron_de_venir(self):
        """
        El diccionario no puede crecer con cada IP que pasó alguna vez.

        La purga saca **sólo las entradas vencidas**, no las activas: evictar
        un contador vivo dejaría pasar justo al que está abusando. Por eso lo
        que se verifica es que una IP que dejó de venir se limpia, no que el
        diccionario tenga un tope duro.
        """
        lim = LimitadorPorIP(maximo=10, ventana_segundos=60)

        # 5.001 IPs que ya no vuelven (sus peticiones quedan viejas)...
        for i in range(5_001):
            ip = f"10.0.{i // 256}.{i % 256}"
            lim.permitir(ip)
            for j in range(len(lim._peticiones[ip])):
                lim._peticiones[ip][j] -= 61

        # ...y una que sigue activa. Este `permitir` dispara la purga.
        lim.permitir("192.168.1.1")

        assert len(lim._peticiones) < 100, "las IPs vencidas tienen que limpiarse"
        assert "192.168.1.1" in lim._peticiones, "la IP activa no se toca"
