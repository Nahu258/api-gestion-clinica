"""
AE2: los datos del paciente y del profesional salen de `turnos` hacia el
modulo Clinica. `Turno` pasa a guardar solo `paciente_id` y `medico_id`.

Orden:
  1. Se agregan paciente_id / medico_id (nulos por ahora) y version.
  2. Se copian los datos existentes: por cada turno se crea (o reutiliza) el
     Paciente por DNI y el Medico por nombre + especialidad.
  3. Se borran las columnas viejas y los IDs pasan a ser obligatorios.

Es la unica vez que Turnos escribe en tablas de Clinica, y solo para migrar
los datos heredados de AE1.
"""

from django.db import migrations, models


def copiar_personas_a_clinica(apps, schema_editor):
    Turno = apps.get_model("turnos", "Turno")
    Paciente = apps.get_model("clinica", "Paciente")
    Medico = apps.get_model("clinica", "Medico")

    for turno in Turno.objects.all():
        paciente, _ = Paciente.objects.get_or_create(
            dni=turno.paciente_dni,
            defaults={
                "nombre": turno.paciente_nombre,
                "telefono": turno.paciente_telefono,
                "obra_social": turno.obra_social,
            },
        )
        medico, _ = Medico.objects.get_or_create(
            nombre=turno.profesional.strip(),
            especialidad=turno.especialidad,
        )
        turno.paciente_id = paciente.id
        turno.medico_id = medico.id
        turno.save(update_fields=["paciente_id", "medico_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("clinica", "0001_initial"),
        ("turnos", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="turno",
            name="paciente_id",
            field=models.IntegerField(null=True),
        ),
        migrations.AddField(
            model_name="turno",
            name="medico_id",
            field=models.IntegerField(null=True),
        ),
        migrations.AddField(
            model_name="turno",
            name="version",
            field=models.IntegerField(default=0),
        ),
        # Sin reverse: volver a AE1 perderia la separacion de datos.
        migrations.RunPython(copiar_personas_a_clinica, migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name="turno",
            name="turnos_pacient_f24d98_idx",
        ),
        migrations.RemoveField(model_name="turno", name="paciente_nombre"),
        migrations.RemoveField(model_name="turno", name="paciente_dni"),
        migrations.RemoveField(model_name="turno", name="paciente_telefono"),
        migrations.RemoveField(model_name="turno", name="obra_social"),
        migrations.RemoveField(model_name="turno", name="profesional"),
        migrations.RemoveField(model_name="turno", name="especialidad"),
        migrations.AlterField(
            model_name="turno",
            name="paciente_id",
            field=models.IntegerField(
                help_text="Referencia desacoplada al módulo Clínica",
                verbose_name="ID del Paciente",
            ),
        ),
        migrations.AlterField(
            model_name="turno",
            name="medico_id",
            field=models.IntegerField(
                help_text="Referencia desacoplada al módulo Clínica",
                verbose_name="ID del Médico",
            ),
        ),
        migrations.AddIndex(
            model_name="turno",
            index=models.Index(fields=["paciente_id"], name="turnos_pacient_94168c_idx"),
        ),
    ]
