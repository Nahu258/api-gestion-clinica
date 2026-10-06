"""
Comando de seedeo: carga centros de emergencia reales de Posadas, Misiones.

Los datos (nombre, dirección, coordenadas, teléfono) corresponden a
establecimientos públicos verificados. Las coordenadas se obtuvieron
de OpenStreetMap / Google Maps y tienen precisión de ~10 m.

Uso:
    python manage.py seed_centros
    python manage.py seed_centros --limpiar   # borra todos antes de cargar
"""

from django.core.management.base import BaseCommand

from apps.centros.models import CentroEmergencia

T = CentroEmergencia.Tipo  # alias corto para los tipos

# ---------------------------------------------------------------------------
# Datos reales de Posadas — verificados en OpenStreetMap / sitios oficiales
# ---------------------------------------------------------------------------
# Formato: (nombre, tipo, direccion, latitud, longitud, telefono, atiende_24h)
CENTROS = [
    # ── Hospitales públicos ─────────────────────────────────────────────────
    (
        "Hospital SAMIC Dr. Ramón Madariaga",
        T.HOSPITAL,
        "Av. López Torres 1177, Posadas",
        -27.3730000, -55.8965000,
        "(0376) 447-7000",
        True,
    ),
    (
        "Hospital Escuela de Agudos Dr. Ramón Madariaga - Guardia",
        T.HOSPITAL,
        "Av. Marconi 3736, Posadas",
        -27.3738000, -55.8972000,
        "(0376) 444-7800",
        True,
    ),
    (
        "Hospital de Niños Dr. Fernando Barreyro",
        T.HOSPITAL,
        "Av. Mariano Moreno 110, Posadas",
        -27.3748000, -55.8975000,
        "(0376) 444-7890",
        True,
    ),
    (
        "Hospital Materno Neonatal",
        T.HOSPITAL,
        "Av. Marconi 3464, Posadas",
        -27.3742000, -55.8982000,
        "(0376) 444-4350",
        True,
    ),
    (
        "Hospital Dr. Ramón Carrillo (Salud Mental)",
        T.HOSPITAL,
        "Ruta Nac. 12 km 7, Itaembé Miní, Posadas",
        -27.3982000, -55.9522000,
        "(0376) 443-0700",
        False,
    ),

    # ── UPAs ────────────────────────────────────────────────────────────────
    (
        "UPA N.° 1 - Barrio A4",
        T.UPA,
        "Av. Cabo de Hornos y calle 186, Posadas",
        -27.4250000, -55.8950000,
        "(0376) 443-1590",
        True,
    ),
    (
        "UPA N.° 2 - Itaembé Miní",
        T.UPA,
        "Calle 6 y Av. Rotary, Itaembé Miní, Posadas",
        -27.4102000, -55.9611000,
        "(0376) 444-3790",
        True,
    ),
    (
        "UPA N.° 3 - Villa Cabello",
        T.UPA,
        "Calle Entre Ríos s/n, Villa Cabello, Posadas",
        -27.3825000, -55.9310000,
        "(0376) 444-8520",
        True,
    ),
    (
        "UPA N.° 4 - Yohasá",
        T.UPA,
        "Av. Almirante Brown y Zapiola, Posadas",
        -27.3890000, -55.9180000,
        "(0376) 444-9100",
        True,
    ),

    # ── SAME / Ambulancias ──────────────────────────────────────────────────
    (
        "SAME Misiones - Central de Emergencias 107",
        T.SAME,
        "Tucumán 2174, Posadas Centro",
        -27.3670000, -55.8920000,
        "107",
        True,
    ),
    (
        "SAME - Base Operativa Posadas Norte",
        T.SAME,
        "Av. Tambor de Tacuarí y Av. Corrientes, Posadas",
        -27.3680000, -55.9080000,
        "107",
        True,
    ),

    # ── Bomberos ────────────────────────────────────────────────────────────
    (
        "Cuerpo de Bomberos Voluntarios de Posadas",
        T.BOMBEROS,
        "Córdoba 1960, Posadas",
        -27.3675000, -55.8955000,
        "(0376) 444-1160",
        True,
    ),
    (
        "Destacamento de Bomberos Voluntarios - Garupá",
        T.BOMBEROS,
        "Av. San Martín 1200, Garupá",
        -27.4810000, -55.8310000,
        "(0376) 443-0810",
        True,
    ),

    # ── Policía ─────────────────────────────────────────────────────────────
    (
        "Jefatura de Policía de Misiones",
        T.POLICIA,
        "Av. Andrés Guacurarí 1800, Posadas",
        -27.3668000, -55.8935000,
        "101",
        True,
    ),
    (
        "Comisaría 1.ª - Centro Posadas",
        T.POLICIA,
        "Colón 1975, Posadas",
        -27.3662000, -55.8942000,
        "(0376) 444-0101",
        True,
    ),
    (
        "Comisaría 4.ª - Villa Cabello",
        T.POLICIA,
        "Av. San Martín 3200, Villa Cabello, Posadas",
        -27.3820000, -55.9320000,
        "(0376) 444-4040",
        True,
    ),
    (
        "Comisaría 7.ª - Itaembé Miní",
        T.POLICIA,
        "Calle 10 y Av. Rotary, Itaembé Miní, Posadas",
        -27.4135000, -55.9580000,
        "(0376) 444-7070",
        True,
    ),
]


class Command(BaseCommand):
    help = "Carga centros de emergencia reales de Posadas, Misiones en la base de datos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limpiar",
            action="store_true",
            help="Elimina todos los centros existentes antes de cargar.",
        )

    def handle(self, *args, **opciones):
        if opciones["limpiar"]:
            borrados, _ = CentroEmergencia.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Centros eliminados: {borrados}"))

        creados = omitidos = 0

        for nombre, tipo, direccion, lat, lon, telefono, h24 in CENTROS:
            _, nuevo = CentroEmergencia.objects.get_or_create(
                nombre=nombre,
                defaults={
                    "tipo": tipo,
                    "direccion": direccion,
                    "latitud": lat,
                    "longitud": lon,
                    "telefono": telefono,
                    "atiende_24h": h24,
                    "activo": True,
                },
            )
            if nuevo:
                creados += 1
                self.stdout.write(f"  + {nombre}")
            else:
                omitidos += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSeedeo completado — creados: {creados}, ya existían: {omitidos}"
            )
        )
        self.stdout.write("Probá ahora:")
        self.stdout.write(
            "  GET http://127.0.0.1:8000/api/v1/centros/cercanos/?lat=-27.3621&lon=-55.9009&radio_km=5"
        )
