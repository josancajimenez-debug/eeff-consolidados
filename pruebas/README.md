# Pruebas de regresión — EEFF Consolidados

Valida la aplicación (un solo archivo `EEFF_Consolidados.html`) **sin navegador**,
ejecutando su JavaScript dentro de stubs de DOM/localStorage con Node.js.

## Requisito
- Node.js instalado: https://nodejs.org

## Cómo ejecutar
Desde la carpeta del proyecto:

```
node pruebas/verificar.js
```

o doble clic en **`verificar-pruebas.bat`** (en la raíz del proyecto).

También corren **automáticamente en GitHub Actions** con cada push a `main`
(ver `.github/workflows/pruebas.yml`), justo antes de que el sitio publicado
quede disponible para los estudiantes.

## Qué valida (80 comprobaciones)

**Pantallas**
- Panel, Glosario (con búsqueda), Bibliografía, Manual, Examen integrador,
  Casos (los 6 filtros) y Reporte para los 3 roles.
- Las 4 unidades con todas sus pestañas, incluido el **papel de trabajo** de las
  unidades 2 y 3.

**Cálculos**
- Simuladores: U1 = 42.000, U3 = 184.000, U4 = 104.400.
- **Consolidación (U3):** plusvalía 16.000 con interés no controlador
  proporcional y 20.000 midiéndolo a valor razonable; PNC inicial 40.000 y
  46.000 a la fecha de consolidación; total consolidado 923.000; la hoja cuadra
  con y sin ajustes intragrupo.
- **Combinación (U2):** cuentas recíprocas conciliadas, total combinado 361.000
  y comprobación de que **sin conciliar las partidas en tránsito el papel NO
  cuadra** (el cuadre no está forzado).
- Que los asientos de todos los casos cuadren (Debe = Haber).
- Formateadores de importes (`fmtAmount`, `fmtImporte`) y lógica de avance
  (pesos suman 100 %, `unitProgress` parte de 0).

**Datos**
- Respaldo e importación: ida y vuelta conservando el progreso, rechazo de JSON
  inválido, del resumen de grupo y de archivos sin perfiles.
- Normalización de perfiles y migración del esquema.
- Exportaciones CSV/JSON, impresión de unidad, gráfico de avance y bloqueo de la
  constancia por debajo del 100 %.

## Resultado
- Código de salida **0** = todo bien.
- Código de salida **1** = alguna comprobación falló (revisar la lista impresa).

> Recomendado: ejecutar estas pruebas **antes de publicar** cambios con `publicar.bat`.
