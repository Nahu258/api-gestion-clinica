#!/usr/bin/env python
"""Utilidad de linea de comandos de Django.

Se ejecuta siempre como:  python manage.py <comando>
Comandos utiles:
    runserver         levanta el servidor de desarrollo
    makemigrations    genera los archivos de migracion a partir de los modelos
    migrate           aplica las migraciones a la base de datos
    createsuperuser   crea un usuario para el panel /admin
    seed_turnos       carga datos de ejemplo (comando propio del proyecto)
    test              corre los tests automaticos
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    # Si se ejecuta `python manage.py runserver` sin indicar puerto,
    # se usa el PORT definido en el archivo .env.
    argumentos = sys.argv[:]
    if len(argumentos) == 2 and argumentos[1] == "runserver":
        argumentos.append(os.environ.get("PORT", "8000"))

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "No se pudo importar Django. Verifique que el entorno virtual "
            "este activado y que las dependencias esten instaladas "
            "(pip install -r requirements.txt)."
        ) from exc

    execute_from_command_line(argumentos)


if __name__ == "__main__":
    main()
