# Brave History Sync Replayer

> **Solución definitiva para forzar la sincronización del historial existente e importado desde PC hacia Brave Sync y dispositivos Android.**

[![Brave](https://img.shields.io/badge/Brave-1.50+-orange.svg)](https://brave.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-green.svg)](#)

---

## 🔍 El Problema (Por qué Brave Sync no envía tu historial antiguo)

Muchos usuarios que unen un nuevo dispositivo a su cadena Sync (o que importan miles de enlaces desde Microsoft Edge, Google Chrome o Firefox hacia Brave) se encuentran con el mismo fallo documentado en los issues oficiales **[brave-browser#34116](https://github.com/brave/brave-browser/issues/34116)** y **[brave-browser#35042](https://github.com/brave/brave-browser/issues/35042)**:

> **El historial previo existente en PC jamás aparece en Android ni en otros dispositivos; únicamente se sincronizan las páginas nuevas que se visiten a partir de ese momento.**

### ¿Por qué ocurre esto a nivel de código?

1. **Eliminación del flag histórico:**  
   En Brave 1.50 existió el flag `brave://flags/#brave-sync-send-all-history` ([brave-core#16705](https://github.com/brave/brave-core/pull/16705)). Sin embargo, ese flag pertenecía al motor antiguo *TypedURLs* (que solo sincronizaba URLs tecleadas).
2. **Migración al datatype `HISTORY` de Chromium:**  
   En versiones modernas ([brave-core#20329](https://github.com/brave/brave-core/pull/20329)), Brave migró a la implementación estándar de Chromium: `HistorySyncBridge`. Al hacerlo, **el flag fue eliminado**.
3. **Diseño deliberado de Chromium:**  
   En el código fuente de Chromium (`components/history/core/browser/sync/history_sync_bridge.cc`), el método de sincronización inicial `MergeFullSyncData()` contiene literalmente:
   ```cpp
   // Since HISTORY is in ApplyUpdatesImmediatelyTypes(), MergeFullSyncData()
   // should never be called.
   NOTREACHED();
   ```
   Chromium clasifica el historial como un tipo de actualización inmediata en tiempo real. **Por diseño, nunca realiza un volcado del historial previo al activar Sync.**
4. **¿Por qué no funciona editar la base SQLite a mano?**  
   `HistorySyncBridge` es un `HistoryBackendObserver` en memoria (C++). Modificar las tablas `visits` o `urls` con comandos `sqlite3` mientras Brave corre es ignorado por el proceso vivo del navegador, pues no monitorea cambios directos en disco.

---

## ⚠️ La Regla Crítica de Cuota del Servidor (`OVER_QUOTA`)

El servidor oficial de Brave Sync v2 (`sync-v2.brave.com`) impone un límite estricto:
- **Máximo ~30,000 objetos de historial** por cadena de sincronización (y 50,000 objetos totales).
- Si se intentan volcar a la fuerza 80,000 o 100,000 visitas en bruto, el servidor responde con el error **`OVER_QUOTA`** (*too many objects in store*), lo que **bloquea y desincroniza por completo contraseñas, marcadores y pestañas en todos tus dispositivos**.

**Esta herramienta soluciona este problema desduplicando tu historial a URLs web únicas** (por ejemplo, ~15,000 a 25,000 enlaces principales), permitiendo sincronizar todo tu conocimiento acumulado de forma 100% segura sin romper la cadena.

---

## 🚀 Cómo lo resuelve esta herramienta (El Replay Bridge)

Esta extensión local para Brave aprovecha la API nativa `chrome.history.addUrl()` ejecutada dentro del proceso legítimo del navegador:

```
[urls.json / Escaneo del Navegador]
                 ↓
      chrome.history.addUrl()
                 ↓
     HistoryBackend::AddPage()
                 ↓
    HistorySyncBridge::OnURLVisited
                 ↓
       processor_->Put() (USS)
                 ↓
   Brave Sync v2 (sync-v2.brave.com)
  [Lotes nativos de 90 / kDefaultMaxCommitBatchSize]
                 ↓
          📱 Brave Android
```

- Cada inserción activa nativamente el pipeline oficial de sincronización.
- Brave encripta cada entrada y la procesa en lotes de 90 ítems.
- Tu teléfono Android descarga las URLs y las hace inmediatamente disponibles en el historial y en el **autocompletado de la barra de direcciones (omnibox)**.

---

## ✨ Características

- 🎯 **100% Seguro y Nativo:** Sin tocar binarios ni arriesgar la corrupción de la base de datos SQLite.
- ⚡ **Control de Velocidad:** Opciones de ritmo seguro (20 URLs/s), equilibrado (40 URLs/s - recomendado) y rápido (70 URLs/s).
- 💾 **Persistencia Automática (`chrome.storage.local`):** Guarda el progreso cada 90 elementos. Si pausas, cierras la pestaña o reinicias Brave, reanuda exactamente donde quedó.
- 🔍 **Doble Fuente de Datos:**
  1. **Automática:** Escanea el historial actual del navegador con un clic (`chrome.history.search`).
  2. **Archivo JSON:** Soporta cargar un `urls.json` pre-extraído de bases de datos antiguas o navegadores externos (Edge/Chrome).
- 📊 **Métricas en Vivo:** Barra de progreso dinámica, URL actual, tiempo estimado restante (ETA) y terminal de actividad.

---

## 📦 Instalación y Uso Rápido

### Método A: Uso directo desde la interfaz (Recomendado)

1. **Descarga o clona este repositorio:**
   ```bash
   git clone https://github.com/JheanLL/brave-history-sync-replayer.git
   ```
2. **Carga la extensión en Brave:**
   - Abre `brave://extensions` en tu barra de direcciones.
   - Activa el **Modo de desarrollador** (esquina superior derecha).
   - Haz clic en **Cargar descomprimida** (Load unpacked).
   - Selecciona la carpeta clonada.
3. **Inicia el proceso:**
   - Haz clic en el icono de la extensión en la barra de herramientas de Brave.
   - Pulsa **Abrir Panel de Sincronización** (se abrirá en una pestaña completa).
   - Si no tienes un archivo `urls.json`, pulsa **🔍 Escanear Historial del Navegador** para cargar tus enlaces.
   - Pulsa **▶️ Iniciar Sincronización**.

---

### Método B: Extracción avanzada mediante script Python (Para bases importadas)

Si tienes un archivo de base de datos específico (por ejemplo, un respaldo de Edge o un perfil secundario):

1. Ejecuta el script extractor incluido:
   ```bash
   python3 export_history.py
   ```
   *(El script detecta automáticamente las rutas por defecto en Linux, macOS y Windows, y genera `urls.json` respetando el límite seguro de cuota).*
2. Abre el Panel de la extensión; detectará automáticamente el archivo `urls.json`.
3. Haz clic en **▶️ Iniciar Sincronización**.

---

## 📱 Verificación en Android

1. Asegúrate de que en tu teléfono Android, en **Ajustes > Sync > Tipos de datos sincronizados**, la opción **Historial** esté activada.
2. Tras iniciar la sincronización en la PC, puedes presionar el botón **📊 brave://sync-internals** en el panel para ver cómo sube en tiempo real el contador de *Commit* en la fila `History`.
3. Abre Brave en Android y ve a **Menú (tres puntos) > Historial**: verás cómo van ingresando todas tus páginas.

---

## 🔒 Privacidad y Seguridad

- **Tus datos nunca salen de tu equipo ni van a servidores de terceros.** Todo el procesamiento ocurre localmente y viaja exclusivamente a través del túnel cifrado de Brave Sync.
- El archivo `.gitignore` viene preconfigurado para ignorar cualquier volcado de historial (`urls.json`, `*.db`) y evitar que publiques accidentalmente tus datos privados de navegación en GitHub.

---

## 📄 Licencia

Este proyecto está bajo la Licencia [MIT](LICENSE).
