"""
Comando de seedeo: carga centros de emergencia reales de Posadas, Misiones.

Nombres, direcciones, coordenadas y teléfonos salen de OpenStreetMap
(consulta Overpass sobre amenity=hospital|clinic|fire_station|police y
emergency=ambulance_station en el bbox de Posadas, octubre 2026).

El comando es idempotente y además corrige seeds anteriores:
  - RENOMBRES actualiza en el lugar los centros que se cargaban con un
    nombre o una ubicación incorrecta (se conservan sus solicitudes).
  - OBSOLETOS desactiva centros que no existen en la realidad.

Uso:
    python manage.py seed_centros
    python manage.py seed_centros --limpiar   # borra los que no tengan solicitudes
"""

from django.core.management.base import BaseCommand
from django.db.models import ProtectedError

from apps.centros.models import CentroEmergencia

T = CentroEmergencia.Tipo  # alias corto para los tipos

# Formato: (nombre, tipo, direccion, latitud, longitud, telefono, atiende_24h)
CENTROS = [
    # ── Hospitales públicos ─────────────────────────────────────────────────
    (
        "Hospital Escuela de Agudos Dr. Ramón Madariaga",
        T.HOSPITAL,
        "Av. Cabred 1120, Parque de la Salud, Posadas",
        -27.3844846, -55.8895025,
        "(0376) 444-3700",
        True,
    ),
    (
        "Hospital de Pediatría Dr. Fernando Barreyro",
        T.HOSPITAL,
        "Av. Mariano Moreno 110, Parque de la Salud, Posadas",
        -27.3826578, -55.8903410,
        "(0376) 444-7100",
        True,
    ),
    (
        "Hospital Materno Neonatal",
        T.HOSPITAL,
        "Av. Marconi 3464, Parque de la Salud, Posadas",
        -27.3834756, -55.8890514,
        "(0376) 444-7842",
        True,
    ),
    (
        "Hospital Dr. René Favaloro",
        T.HOSPITAL,
        "Av. Tambor de Tacuarí 7300, Villa Cabello, Posadas",
        -27.3651329, -55.9494256,
        "(0376) 444-5500",
        True,
    ),
    (
        "Hospital Dr. Pedro Baliña",
        T.HOSPITAL,
        "Av. Quaranta 7300, Posadas",
        -27.3986643, -55.9517642,
        "(0376) 445-8248",
        True,
    ),
    (
        "Hospital Dr. Ramón Carrillo (Salud Mental)",
        T.HOSPITAL,
        "Av. Quaranta 7350, Posadas",
        -27.3981824, -55.9522089,
        "(0376) 445-8263",
        False,
    ),
    (
        "Hospital Virgen de Fátima",
        T.HOSPITAL,
        "Av. Jorge Kemerer 1576, Garupá",
        -27.4364015, -55.8695798,
        "(0376) 440-9118",
        True,
    ),
    (
        "Hospital de Itaembé Guazú",
        T.HOSPITAL,
        "Las Orquídeas 6450, Itaembé Guazú, Posadas",
        -27.4100103, -55.9839982,
        "",
        True,
    ),

    # ── Clínicas y sanatorios privados ──────────────────────────────────────
    (
        "Sanatorio Boratti",
        T.CLINICA,
        "Av. Mitre 2330, Posadas",
        -27.3735314, -55.9001254,
        "(0376) 444-0140",
        True,
    ),
    (
        "Sanatorio Nosiglia",
        T.CLINICA,
        "Córdoba 1401, Posadas",
        -27.3684830, -55.8896884,
        "(0376) 444-0100",
        True,
    ),
    (
        "Sanatorio Posadas",
        T.CLINICA,
        "Junín 1840, Posadas",
        -27.3669731, -55.8979311,
        "(0376) 442-5092",
        True,
    ),
    (
        "Sanatorio Integral IOT",
        T.CLINICA,
        "Bolívar 2376, Posadas",
        -27.3662625, -55.8995909,
        "(0376) 444-0540",
        True,
    ),

    # ── Centros de Atención Primaria (CAPS) ─────────────────────────────────
    (
        "CAPS 32 Itaembé Miní",
        T.UPA,
        "Av. Isaco Abitbol 8300, Itaembé Miní, Posadas",
        -27.4141059, -55.9561833,
        "",
        False,
    ),
    (
        "CAPS 5 Yacyretá",
        T.UPA,
        "Av. Blas Parera 4977, Posadas",
        -27.3749503, -55.9262218,
        "",
        False,
    ),
    (
        "CAPS 8 Rocamora",
        T.UPA,
        "Av. Blas Parera 3673, Posadas",
        -27.3762281, -55.9134241,
        "",
        False,
    ),
    (
        "CAPS 4 La Picada",
        T.UPA,
        "Av. Tambor de Tacuarí 3504, Posadas",
        -27.3693940, -55.9111062,
        "",
        False,
    ),
    (
        "CAPS 20 Ñu Porá",
        T.UPA,
        "Av. Alberto Roth 701, Garupá",
        -27.4474157, -55.8599393,
        "(0376) 448-8437",
        False,
    ),

    # ── SAME / Ambulancias ──────────────────────────────────────────────────
    (
        "SAME 107 - Unidad Central de Emergencias y Traslados",
        T.SAME,
        "Av. Quaranta s/n, Posadas",
        -27.3985589, -55.9529532,
        "107",
        True,
    ),

    # ── Bomberos ────────────────────────────────────────────────────────────
    (
        "División de Bomberos Zona Centro",
        T.BOMBEROS,
        "Av. Mitre 1560, Posadas",
        -27.3746668, -55.8919391,
        "(0376) 444-7666",
        True,
    ),
    (
        "División de Bomberos Zona Sur",
        T.BOMBEROS,
        "Av. Martín Fierro 2608, Posadas",
        -27.3835305, -55.9046879,
        "100",
        True,
    ),
    (
        "División de Bomberos Zona Oeste",
        T.BOMBEROS,
        "Fermín Fierro s/n, Villa Cabello, Posadas",
        -27.3657538, -55.9492800,
        "100",
        True,
    ),
    (
        "Bomberos Voluntarios Itaembé Miní",
        T.BOMBEROS,
        "Av. Ozuna 8850, Itaembé Miní, Posadas",
        -27.4183194, -55.9489932,
        "(0376) 459-5199",
        True,
    ),
    (
        "División de Bomberos de Garupá",
        T.BOMBEROS,
        "Colectora Leonardo Favio 2850, Garupá",
        -27.4587838, -55.8499153,
        "(0376) 449-1400",
        True,
    ),

    # ── Policía ─────────────────────────────────────────────────────────────
    (
        "Jefatura de Policía de Misiones",
        T.POLICIA,
        "Félix de Azara 2417, Posadas",
        -27.3732865, -55.8942885,
        "(0376) 444-7645",
        True,
    ),
    (
        "Comisaría Seccional Primera",
        T.POLICIA,
        "Alberdi 998, Posadas",
        -27.3589038, -55.8937894,
        "(0376) 444-6540",
        True,
    ),
    (
        "Comisaría Seccional Tercera",
        T.POLICIA,
        "Av. Uruguay 3534, Posadas",
        -27.3822228, -55.8998580,
        "(0376) 444-7655",
        True,
    ),
    (
        "Comisaría Seccional Séptima - Villa Cabello",
        T.POLICIA,
        "Av. Tambor de Tacuarí 7599, Villa Cabello, Posadas",
        -27.3654771, -55.9492471,
        "(0376) 446-8004",
        True,
    ),
    (
        "Comisaría Seccional Novena - Itaembé Miní",
        T.POLICIA,
        "Av. Isaco Abitbol s/n, Itaembé Miní, Posadas",
        -27.4114371, -55.9553222,
        "101",
        True,
    ),
]

# Nombres usados por seeds anteriores → nombre real del mismo servicio.
RENOMBRES = {
    "Hospital SAMIC Dr. Ramón Madariaga": "Hospital Escuela de Agudos Dr. Ramón Madariaga",
    "Hospital de Niños Dr. Fernando Barreyro": "Hospital de Pediatría Dr. Fernando Barreyro",
    "SAME Misiones - Central de Emergencias 107": "SAME 107 - Unidad Central de Emergencias y Traslados",
    "Cuerpo de Bomberos Voluntarios de Posadas": "División de Bomberos Zona Centro",
    "Destacamento de Bomberos Voluntarios - Garupá": "División de Bomberos de Garupá",
    "Comisaría 1.ª - Centro Posadas": "Comisaría Seccional Primera",
    "Comisaría 4.ª - Villa Cabello": "Comisaría Seccional Séptima - Villa Cabello",
    "Comisaría 7.ª - Itaembé Miní": "Comisaría Seccional Novena - Itaembé Miní",
}

# Centros de seeds anteriores sin equivalente real: se desactivan.
OBSOLETOS = [
    "Hospital Escuela de Agudos Dr. Ramón Madariaga - Guardia",
    "UPA N.° 1 - Barrio A4",
    "UPA N.° 2 - Itaembé Miní",
    "UPA N.° 3 - Villa Cabello",
    "UPA N.° 4 - Yohasá",
    "SAME - Base Operativa Posadas Norte",
]


class Command(BaseCommand):
    help = "Carga (o corrige) los centros de emergencia reales de Posadas, Misiones."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limpiar",
            action="store_true",
            help="Elimina los centros sin solicitudes antes de cargar.",
        )

    def handle(self, *args, **opciones):
        if opciones["limpiar"]:
            borrados = 0
            for centro in CentroEmergencia.objects.all():
                try:
                    centro.delete()
                    borrados += 1
                except ProtectedError:
                    pass
            self.stdout.write(self.style.WARNING(f"Centros eliminados: {borrados}"))

        renombrados = 0
        for viejo, nuevo in RENOMBRES.items():
            if CentroEmergencia.objects.filter(nombre=nuevo).exists():
                continue
            renombrados += CentroEmergencia.objects.filter(nombre=viejo).update(nombre=nuevo)

        desactivados = CentroEmergencia.objects.filter(
            nombre__in=OBSOLETOS, activo=True
        ).update(activo=False)

        creados = actualizados = 0
        for nombre, tipo, direccion, lat, lon, telefono, h24 in CENTROS:
            _, nuevo = CentroEmergencia.objects.update_or_create(
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
                actualizados += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nCentros listos - creados: {creados}, actualizados: {actualizados}, "
                f"renombrados: {renombrados}, desactivados: {desactivados}"
            )
        )
