# ==============================================================================
# AE4 - Prueba de caída de un servicio crítico (RabbitMQ)
#
# 1. Apaga RabbitMQ.
# 2. Envía avisos de pacientes: la API sigue respondiendo 201. Los primeros
#    tardan más (timeout + reintento); cuando el circuit breaker se ABRE dejan
#    de esperar y vuelven a ser rápidos.
# 3. Muestra /salud (503, circuito abierto) y la métrica en Prometheus.
# 4. Levanta RabbitMQ y verifica que el circuito se vuelva a cerrar.
#
# Uso (con el stack levantado):   .\scripts\prueba-caida-rabbitmq.ps1
# ==============================================================================
$ErrorActionPreference = 'Stop'
$API = 'http://localhost:8000/api/v1'

function Titulo($texto) { Write-Host "`n>> $texto" -ForegroundColor Cyan }

# docker compose escribe su progreso en stderr; en PowerShell 5.1 eso no es un error.
function Compose { $ErrorActionPreference = 'Continue'; & docker compose @args 2>&1 | Out-Null }

function Salud {
    try { $r = Invoke-WebRequest "$API/salud" -UseBasicParsing; $codigo = $r.StatusCode; $cuerpo = $r.Content }
    catch { $codigo = [int]$_.Exception.Response.StatusCode; $cuerpo = $_.ErrorDetails.Message }
    Write-Host "   /salud -> $codigo  $cuerpo"
}

function Avisar($n, $centroId) {
    $cuerpo = @{ centro_id = $centroId; modo = 'aviso'; motivo = '[prueba de caida]'; nombre_invitado = "Caida $n" } | ConvertTo-Json
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-WebRequest "$API/atencion/solicitudes/" -Method Post -Body $cuerpo -ContentType 'application/json' -UseBasicParsing
    $reloj.Stop()
    $color = if ($reloj.ElapsedMilliseconds -gt 1000) { 'Yellow' } else { 'Green' }
    Write-Host ("   aviso {0}: HTTP {1} en {2,5} ms   trace_id={3}" -f $n, $r.StatusCode, $reloj.ElapsedMilliseconds, $r.Headers['X-Request-ID']) -ForegroundColor $color
}

$centros = (Invoke-RestMethod "$API/centros/cercanos/?lat=-27.3671&lon=-55.8961&radio_km=50").resultados
$centro = ($centros | Where-Object { $_.nombre -eq 'Sanatorio Posadas' } | Select-Object -First 1)
if (-not $centro) { $centro = $centros[0] }

Titulo 'Estado inicial'
Salud

Titulo 'Apagando RabbitMQ...'
Compose stop rabbitmq

Titulo 'Avisos con RabbitMQ caido (la API no se cae)'
1..6 | ForEach-Object { Avisar $_ $centro.id }
Salud
Start-Sleep 6   # un ciclo de recolección de Prometheus (cada 5 s)
$metrica = (Invoke-RestMethod 'http://localhost:9090/api/v1/query?query=emergenciaya_circuit_breaker_estado{job="api"}' -ErrorAction SilentlyContinue).data.result
if ($metrica) { Write-Host "   Prometheus: emergenciaya_circuit_breaker_estado = $($metrica[0].value[1])  (2 = abierto)" }

Titulo 'Levantando RabbitMQ...'
Compose start rabbitmq
do { Start-Sleep 3; $estado = docker inspect -f '{{.State.Health.Status}}' (docker compose ps -q rabbitmq) } while ($estado -ne 'healthy')
Write-Host '   RabbitMQ healthy. Se espera que venza el tiempo del circuito abierto (30 s)...'
Start-Sleep 30

Titulo 'Recuperacion: el primer aviso prueba la conexion (semiabierto) y cierra el circuito'
Avisar 7 $centro.id
Salud
