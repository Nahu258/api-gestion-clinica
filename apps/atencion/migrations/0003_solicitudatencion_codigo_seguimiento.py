import secrets

from django.db import migrations, models

import apps.atencion.models


def regenerar_codigos(apps, schema_editor):
    """AddField evalúa el default una sola vez: cada fila existente recibe el suyo."""
    Solicitud = apps.get_model("atencion", "SolicitudAtencion")
    for solicitud in Solicitud.objects.all().only("pk"):
        Solicitud.objects.filter(pk=solicitud.pk).update(codigo_seguimiento=secrets.token_urlsafe(32))


class Migration(migrations.Migration):

    dependencies = [
        ("atencion", "0002_solicitudatencion_atendido_en_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="solicitudatencion",
            name="codigo_seguimiento",
            field=models.CharField(
                default=apps.atencion.models.generar_codigo_seguimiento,
                editable=False,
                max_length=64,
                verbose_name="Código secreto de seguimiento",
            ),
        ),
        migrations.RunPython(regenerar_codigos, migrations.RunPython.noop),
    ]
