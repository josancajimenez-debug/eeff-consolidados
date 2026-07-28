# Pruebas — EEFF Consolidados

Hay dos niveles de verificación, con propósitos distintos:

| Prueba | Qué comprueba | Necesita |
|---|---|---|
| `verificar.js` | Lógica, cálculos e integridad del contenido, **sin navegador** | Solo Node.js |
| `auditoria-navegador.js` | Cómo se ve y se comporta la app **en Chromium** | Node.js + Playwright |

---

## 1. Suite de regresión (`verificar.js`)

Ejecuta el JavaScript de la aplicación dentro de stubs de DOM y `localStorage`.
Es rápida (menos de un segundo) y no necesita instalar nada.

```
node pruebas/verificar.js
```

o doble clic en **`verificar-pruebas.bat`** (en la raíz del proyecto).

Corre **automáticamente en GitHub Actions con cada push a `main`**
(`.github/workflows/pruebas.yml`), justo antes de que el sitio publicado quede
disponible para los estudiantes.

### Qué valida (117 comprobaciones)

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
- Formato de importes: punto para los miles, coma para los decimales, negativos,
  valores no numéricos y —lo más delicado— que un importe **ya formateado no se
  vuelva a formatear** (`80.000` no debe convertirse en `80`).
- Lógica de avance (los pesos suman 100 %, `unitProgress` parte de 0).

**Integridad del contenido** — vigilan los datos del curso, no el código:

- Cada pregunta tiene enunciado, opciones y un índice de respuesta válido.
- No hay preguntas repetidas dentro de una unidad ni opciones repetidas dentro
  de una pregunta.
- Cada unidad tiene ejercicios en los tres niveles y todos con enunciado y
  resultado.
- Los asientos de los ejemplos y de los ejercicios cuadran (Debe = Haber),
  además de los de todos los casos.
- El glosario apunta a unidades existentes, sin términos repetidos.
- Los casos tienen identificador único, filtro válido y normas declaradas.
- **Las claves de los papeles de trabajo son ASCII**: si dejan de serlo, se
  rompen los `id` del DOM y los respaldos ya guardados.

**Robustez**

- Rondas de autoevaluación guardadas con un banco de preguntas distinto: los
  índices huérfanos se descartan sin romper la pantalla.
- Exámenes guardados que apuntan a preguntas inexistentes.
- `examRemaining` con marca de inicio inválida.
- Reiniciar un perfil deja la estructura completa de la versión vigente.

**Datos**

- Respaldo e importación: ida y vuelta conservando el progreso; rechazo de JSON
  inválido, del resumen de grupo y de archivos sin perfiles.
- Normalización de perfiles y migración del esquema.
- Exportaciones CSV/JSON, impresión de unidad, gráfico de avance y bloqueo de la
  constancia por debajo del 100 %.

---

## 2. Auditoría en navegador (`auditoria-navegador.js`)

Abre la aplicación en Chromium y la recorre como lo haría una persona. Detecta
lo que solo se ve al pintarla y que la suite anterior no puede alcanzar.

```
npm install playwright
npx playwright install chromium
node pruebas/auditoria-navegador.js
```

Tarda unos minutos. No corre en cada push: se lanza a mano desde la pestaña
**Actions** de GitHub y, además, una vez por semana
(`.github/workflows/auditoria-navegador.yml`).

### Qué recorre

- Las 7 pantallas y las 4 unidades con todas sus pestañas, en **tres tamaños**
  (escritorio 1440, tablet 820, móvil 390) y en **ambos temas**. Reporta errores
  de JavaScript, errores de consola, desbordes horizontales, pantallas vacías y
  texto sin contraste.
- **Flujos completos:** guardar perfil (con `<b>` en el nombre, para comprobar
  que no se interpreta como HTML), notas con comillas y etiquetas, marcar
  conceptos y acreditación de avance, validación del simulador, autoevaluación
  (retroalimentación, bloqueo de la pregunta y que la página no se desplace),
  papel de trabajo sin conciliar, examen con cronómetro, descarga del respaldo,
  datos del curso, rol docente, CSV de grupo, importación del respaldo,
  renombrar y reiniciar perfil.

### Sobre los avisos de contraste

El detector no puede leer los degradados de CSS, así que da por oscuro el fondo
de los elementos que los usan (los números de unidad de la barra lateral, por
ejemplo) y los reporta como contraste bajo. **Son falsos positivos conocidos**;
por eso se listan aparte y no hacen fallar la ejecución. Solo los hallazgos de
tipo JS, CONSOLA, BUG y DESBORDE devuelven código de salida 1.

---

## Resultado

- Código de salida **0** = todo bien.
- Código de salida **1** = alguna comprobación falló (revisar la lista impresa).

> Recomendado: ejecutar `verificar.js` **antes de publicar** cambios con
> `publicar.bat`, y la auditoría de navegador después de tocar estilos,
> plantillas o cualquier cosa que afecte cómo se pinta la página.
