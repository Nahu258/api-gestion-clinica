"""
AE2 - Comprobante del turno en PDF con codigo QR.

Lo genera el CONSUMIDOR de RabbitMQ (no la API), asi la reserva responde
rapido y el PDF se arma en segundo plano.

El QR lleva un codigo de verificacion firmado con la SECRET_KEY: en
recepcion se puede comprobar que el comprobante es autentico y no fue
inventado cambiando el numero de turno.
"""

import hashlib
import hmac
import io
import os
from datetime import datetime
from pathlib import Path

import qrcode
from django.conf import settings
from django.utils import timezone
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def carpeta_comprobantes() -> Path:
    carpeta = Path(settings.MEDIA_ROOT) / "comprobantes"
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def ruta_comprobante(turno_id: int) -> Path:
    return carpeta_comprobantes() / f"turno_{turno_id}.pdf"


def codigo_verificacion(turno_id: int, fecha_hora: str) -> str:
    firma = hmac.new(
        settings.SECRET_KEY.encode(), f"{turno_id}|{fecha_hora}".encode(), hashlib.sha256
    )
    return firma.hexdigest()[:12].upper()


def contenido_qr(datos: dict) -> str:
    codigo = codigo_verificacion(datos["turno_id"], datos["fecha_hora"])
    return f"CLINICA|TURNO:{datos['turno_id']}|DNI:{datos['paciente_dni']}|COD:{codigo}"


def generar_comprobante(datos: dict) -> Path:
    """Arma el PDF a partir de los datos del evento TurnoReservado."""
    ruta = ruta_comprobante(datos["turno_id"])
    fecha = timezone.localtime(datetime.fromisoformat(datos["fecha_hora"]))

    imagen_qr = qrcode.make(contenido_qr(datos))
    buffer_qr = io.BytesIO()
    imagen_qr.save(buffer_qr, format="PNG")
    buffer_qr.seek(0)

    # Se escribe en un archivo temporal y despues se renombra: nunca queda
    # un PDF a medio escribir si el proceso se corta.
    temporal = ruta.with_suffix(".tmp")
    ancho, alto = A5
    pdf = canvas.Canvas(str(temporal), pagesize=A5)
    pdf.setTitle(f"Comprobante turno {datos['turno_id']}")

    y = alto - 20 * mm
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(15 * mm, y, "Comprobante de turno")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(15 * mm, y - 6 * mm, f"Turno N° {datos['turno_id']}")

    filas = [
        ("Paciente", datos["paciente_nombre"]),
        ("DNI", datos["paciente_dni"]),
        ("Profesional", datos["profesional"]),
        ("Especialidad", datos.get("especialidad_legible") or datos["especialidad"]),
        ("Fecha", fecha.strftime("%d/%m/%Y")),
        ("Hora", fecha.strftime("%H:%M")),
    ]
    y -= 20 * mm
    for etiqueta, valor in filas:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(15 * mm, y, f"{etiqueta}:")
        pdf.setFont("Helvetica", 10)
        pdf.drawString(45 * mm, y, str(valor))
        y -= 7 * mm

    lado_qr = 45 * mm
    pdf.drawImage(ImageReader(buffer_qr), (ancho - lado_qr) / 2, y - lado_qr - 5 * mm, lado_qr, lado_qr)
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(
        ancho / 2,
        y - lado_qr - 10 * mm,
        f"Codigo de verificacion: {codigo_verificacion(datos['turno_id'], datos['fecha_hora'])}",
    )
    pdf.drawCentredString(
        ancho / 2, 12 * mm, "Presente este comprobante en recepcion 10 minutos antes."
    )
    pdf.save()

    os.replace(temporal, ruta)
    return ruta
