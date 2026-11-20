(() => {
  "use strict";

  const parametros = new URLSearchParams(window.location.search);
  const CFG = Object.assign(
    {
      S3_EVOLUCION_URL: "",
      NEO4J_URL: "http://localhost:7474/db/neo4j/tx/commit",
      NEO4J_USER: "webreader",
      NEO4J_PASSWORD: "clave123",
      NEO4J_LIMIT: 100,
      CONSULTAS: {}
    },
    window.WEB_CONFIG || {}
  );

  if (parametros.has("s3")) CFG.S3_EVOLUCION_URL = parametros.get("s3");
  if (parametros.has("neo4j")) CFG.NEO4J_URL = parametros.get("neo4j");

  const fmt = new Intl.NumberFormat("es-AR");
  const $ = (id) => document.getElementById(id);
  let chartEvolucion = null;
  let chartGrafo = null;
  let redGrafo = null;

  let datosEvolucion = [];
  let filtroAnios = { desde: null, hasta: null };
  let origenEvolucion = { texto: "S3/Athena", tipo: "ok" };

  function setEstado(id, texto, tipo) {
    const el = $(id);
    if (!el) return;
    el.textContent = texto;
    el.className = "estado estado--" + (tipo || "info");
  }

  function setKpi(id, valor) {
    const el = $(id);
    if (el) el.textContent = valor;
  }

  function nota(id, texto) {
    const el = $(id);
    if (el) el.textContent = texto;
  }

  function agregarNota(id, texto) {
    const el = $(id);
    if (!el) return;
    el.textContent = (el.textContent ? el.textContent + " " : "") + texto;
  }

  function esc(valor) {
    return String(valor == null ? "" : valor).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function numero(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    const n = Number(String(valor == null ? "" : valor).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function parseCsv(texto) {
    const limpio = String(texto || "").replace(/^\uFEFF/, "");
    const filas = [];
    let fila = [];
    let campo = "";
    let enComillas = false;

    for (let i = 0; i < limpio.length; i++) {
      const ch = limpio[i];
      if (ch === '"') {
        if (enComillas && limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = !enComillas;
        }
      } else if (ch === "," && !enComillas) {
        fila.push(campo);
        campo = "";
      } else if ((ch === "\n" || ch === "\r") && !enComillas) {
        if (ch === "\r" && limpio[i + 1] === "\n") i++;
        fila.push(campo);
        if (fila.some((v) => v.trim() !== "")) filas.push(fila.map((v) => v.trim()));
        fila = [];
        campo = "";
      } else {
        campo += ch;
      }
    }
    fila.push(campo);
    if (fila.some((v) => v.trim() !== "")) filas.push(fila.map((v) => v.trim()));
    return filas;
  }

  function normalizar(texto) {
    return String(texto || "").replace(/^\uFEFF/, "").trim().toLowerCase();
  }

  function indice(cabeceras, nombres) {
    return cabeceras.findIndex((h) => nombres.includes(h));
  }

  function csvAEvolucion(texto) {
    const filas = parseCsv(texto);
    if (filas.length < 2) throw new Error("El CSV está vacío");

    const cabeceras = filas[0].map(normalizar);
    const idx = {
      mes: indice(cabeceras, ["mes", "month", "fecha", "periodo"]),
      tuits: indice(cabeceras, ["tuits", "tweets", "total_tuits", "num_tuits"]),
      usuarios: indice(cabeceras, ["usuarios", "users", "num_usuarios"]),
      retuits: indice(cabeceras, ["retuits", "retweets", "total_retuits"]),
      pct: indice(cabeceras, ["pct", "pct_retuits", "porcentaje", "porcentaje_retuits", "pct_retweets"])
    };

    if (idx.mes < 0 || idx.tuits < 0) {
      throw new Error("No encontré columnas 'mes' y 'tuits' en el CSV");
    }

    const datos = filas.slice(1).map((f) => ({
      mes: String(f[idx.mes] || "").slice(0, 7),
      tuits: numero(f[idx.tuits]),
      usuarios: idx.usuarios >= 0 ? numero(f[idx.usuarios]) : 0,
      retuits: idx.retuits >= 0 ? numero(f[idx.retuits]) : 0,
      pct: idx.pct >= 0 ? numero(f[idx.pct]) : 0
    })).filter((d) => /^\d{4}-\d{2}$/.test(d.mes));

    if (!datos.length) throw new Error("El CSV no tenía filas mensuales válidas");
    return datos;
  }

  async function cargarEvolucion() {
    const url = String(CFG.S3_EVOLUCION_URL || "").trim();
    const local = Array.isArray(window.EVOLUCION_LOCAL) ? window.EVOLUCION_LOCAL : [];

    if (!url) {
      if (local.length) {
        origenEvolucion = { texto: "copia local", tipo: "warn" };
        aplicarDatosEvolucion(local);
        nota("nota-evolucion", "Configurá S3_EVOLUCION_URL en config.js o pasá ?s3=URL para usar Athena/S3.");
      } else {
        setEstado("estado-evolucion", "Sin datos: falta S3 y copia local", "error");
      }
      return;
    }

    const t0 = performance.now();
    setEstado("estado-evolucion", "Consultando S3…", "info");
    try {
      const respuesta = await fetch(url, { cache: "no-store" });
      if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
      const texto = await respuesta.text();
      const t1 = performance.now();
      const durMs = Math.round(t1 - t0);
      setKpi("kpi-s3-tiempo", durMs + " ms");
      origenEvolucion = { texto: "S3/Athena", tipo: "ok" };
      const datos = csvAEvolucion(texto);
      aplicarDatosEvolucion(datos);
      nota("nota-evolucion", "Fuente: " + url + " · " + durMs + " ms");
    } catch (error) {
      console.error("Error al cargar evolución desde S3:", error);
      if (local.length) {
        origenEvolucion = { texto: "copia local", tipo: "warn" };
        aplicarDatosEvolucion(local);
        nota("nota-evolucion", "No se pudo leer S3 (" + error.message + "). Se usa web/evolucion.js como respaldo.");
      } else {
        setEstado("estado-evolucion", "Error de S3: " + error.message, "error");
        nota("nota-evolucion", "No hay copia local disponible.");
      }
      setKpi("kpi-s3-tiempo", "—");
    }
  }

  function aplicarDatosEvolucion(datos) {
    datosEvolucion = Array.isArray(datos) ? datos : [];
    configurarFiltroAnios(datosEvolucion);
    renderEvolucion(filtrarDatosEvolucion());
  }

  function anioDe(fila) {
    const n = Number(String(fila && fila.mes ? fila.mes : "").slice(0, 4));
    return Number.isFinite(n) ? n : null;
  }

  function configurarFiltroAnios(datos) {
    const desdeInput = $("anio-desde");
    const hastaInput = $("anio-hasta");
    const anios = datos.map(anioDe).filter((n) => n != null);
    const min = anios.length ? Math.min.apply(null, anios) : null;
    const max = anios.length ? Math.max.apply(null, anios) : null;

    if (!desdeInput || !hastaInput || min == null) {
      if (desdeInput) desdeInput.disabled = true;
      if (hastaInput) hastaInput.disabled = true;
      filtroAnios = { desde: null, hasta: null };
      return;
    }

    [desdeInput, hastaInput].forEach((input) => {
      input.min = min;
      input.max = max;
      input.step = 1;
      input.disabled = false;
    });

    const desde = filtroAnios.desde == null ? min : Math.max(min, Math.min(max, filtroAnios.desde));
    const hasta = filtroAnios.hasta == null ? max : Math.max(min, Math.min(max, filtroAnios.hasta));
    filtroAnios = desde <= hasta ? { desde, hasta } : { desde: min, hasta: max };
    desdeInput.value = filtroAnios.desde;
    hastaInput.value = filtroAnios.hasta;

    const etiquetaMin = $("anio-min");
    const etiquetaMax = $("anio-max");
    if (etiquetaMin) etiquetaMin.textContent = min;
    if (etiquetaMax) etiquetaMax.textContent = max;
    actualizarUIAnios();
  }

  function filtrarDatosEvolucion() {
    if (!datosEvolucion.length || filtroAnios.desde == null) return datosEvolucion;
    return datosEvolucion.filter((d) => {
      const anio = anioDe(d);
      return anio != null && anio >= filtroAnios.desde && anio <= filtroAnios.hasta;
    });
  }

  function actualizarUIAnios() {
    const desdeInput = $("anio-desde");
    const hastaInput = $("anio-hasta");
    if (!desdeInput || !hastaInput || desdeInput.disabled) return;

    let desde = Number(desdeInput.value);
    let hasta = Number(hastaInput.value);
    if (desde > hasta) {
      if (document.activeElement === desdeInput) {
        hasta = desde;
        hastaInput.value = hasta;
      } else {
        desde = hasta;
        desdeInput.value = desde;
      }
    }
    filtroAnios = { desde, hasta };

    const minAnio = Number(desdeInput.min);
    const maxAnio = Number(desdeInput.max);
    desdeInput.style.zIndex = desde === maxAnio ? "3" : "1";
    hastaInput.style.zIndex = hasta === minAnio ? "1" : "2";

    const salida = $("rango-anios");
    if (salida) salida.textContent = desde === hasta ? String(desde) : desde + " — " + hasta;

    const relleno = $("rango-doble-fill");
    if (relleno) {
      const min = Number(desdeInput.min);
      const max = Number(desdeInput.max);
      const span = max - min;
      const izquierda = span > 0 ? (100 * (desde - min)) / span : 0;
      const ancho = span > 0 ? (100 * (hasta - desde)) / span : 100;
      relleno.style.left = izquierda + "%";
      relleno.style.width = ancho + "%";
    }

    renderEvolucion(filtrarDatosEvolucion());
  }

  function renderEvolucion(datos) {
    const totalMeses = datosEvolucion.length;
    const hayFiltro = totalMeses > 0 && datos.length !== totalMeses;
    const rango = filtroAnios.desde == null ? "" : (filtroAnios.desde === filtroAnios.hasta ? " · " + filtroAnios.desde : " · " + filtroAnios.desde + "–" + filtroAnios.hasta);
    const cantidad = hayFiltro ? datos.length + " de " + totalMeses + " meses" : totalMeses + " meses";
    const textoEstado = cantidad + rango + " · " + origenEvolucion.texto;
    setEstado("estado-evolucion", textoEstado, origenEvolucion.tipo);

    if (!datos.length) {
      setKpi("kpi-tuits", "—");
      setKpi("kpi-pico", "—");
      setKpi("kpi-retuits", "—");
      setKpi("kpi-pct", "—");
      const tbodyVacio = $("tabla-evolucion");
      if (tbodyVacio) tbodyVacio.innerHTML = "<tr><td colspan='5'>Sin datos para el rango seleccionado.</td></tr>";
      if (chartEvolucion) { chartEvolucion.destroy(); chartEvolucion = null; }
      return;
    }

    renderEvolucionDatos(datos);
  }

  function renderEvolucionDatos(datos) {
    const total = datos.reduce((acc, d) => acc + numero(d.tuits), 0);
    const retuits = datos.reduce((acc, d) => acc + numero(d.retuits), 0);
    const pico = datos.reduce((mejor, d) => (numero(d.tuits) > numero(mejor.tuits) ? d : mejor), datos[0]);
    const pct = total ? (100 * retuits) / total : 0;

    setKpi("kpi-tuits", fmt.format(total));
    setKpi("kpi-pico", fmt.format(numero(pico.tuits)) + " · " + pico.mes);
    setKpi("kpi-retuits", fmt.format(retuits));
    setKpi("kpi-pct", pct.toFixed(1) + "%");

    const tbody = $("tabla-evolucion");
    if (tbody) {
      tbody.innerHTML = datos.map((d) => (
        "<tr><td>" + esc(d.mes) + "</td>" +
        "<td class='num'>" + fmt.format(numero(d.tuits)) + "</td>" +
        "<td class='num'>" + fmt.format(numero(d.usuarios)) + "</td>" +
        "<td class='num'>" + fmt.format(numero(d.retuits)) + "</td>" +
        "<td class='num'>" + numero(d.pct).toFixed(1) + "%</td></tr>"
      )).join("");
    }

    if (!window.Chart) {
      const notaActual = $("nota-evolucion");
      if (notaActual && !notaActual.textContent.includes("Chart.js no disponible")) {
        agregarNota("nota-evolucion", "Chart.js no disponible: se muestra la tabla.");
      }
      return;
    }

    const canvas = $("chart-evolucion");
    if (!canvas) return;
    if (chartEvolucion) chartEvolucion.destroy();

    chartEvolucion = new window.Chart(canvas, {
      type: "line",
      data: {
        labels: datos.map((d) => d.mes),
        datasets: [
          {
            label: "Tuits",
            data: datos.map((d) => numero(d.tuits)),
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56,189,248,.12)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            label: "Retuits",
            data: datos.map((d) => numero(d.retuits)),
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167,139,250,.10)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            label: "% retuits",
            data: datos.map((d) => numero(d.pct)),
            borderColor: "#fbbf24",
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0.2,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
        scales: {
          x: { ticks: { color: "#94a3b8", maxTicksLimit: 12 }, grid: { color: "rgba(148,163,184,.12)" } },
          y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,.12)" }, title: { display: true, text: "Cantidad", color: "#94a3b8" } },
          y1: { beginAtZero: true, max: 100, position: "right", ticks: { color: "#fbbf24" }, grid: { drawOnChartArea: false }, title: { display: true, text: "% retuits", color: "#fbbf24" } }
        }
      }
    });
  }

  function consultaActiva() {
    const selector = $("consulta-grafo");
    const clave = selector ? selector.value : "relaciones";
    const cfg = (CFG.CONSULTAS && CFG.CONSULTAS[clave]) ||
      (CFG.CONSULTAS && CFG.CONSULTAS.relaciones) ||
      { etiqueta: "Consulta", columnas: ["valor"], cypher: "RETURN 1 AS valor" };
    return { clave, cfg };
  }

  async function ejecutarCypher(statements) {
    const respuesta = await fetch(CFG.NEO4J_URL, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(CFG.NEO4J_USER + ":" + CFG.NEO4J_PASSWORD),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ statements })
    });

    const texto = await respuesta.text();
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (error) {
      throw new Error(texto.slice(0, 180) || "Respuesta no JSON");
    }
    if (!respuesta.ok) {
      const detalle = datos && datos.errors ? datos.errors.map((e) => e.message).join(" | ") : "HTTP " + respuesta.status;
      throw new Error(detalle);
    }
    if (datos.errors && datos.errors.length) {
      throw new Error(datos.errors.map((e) => e.message).join(" | "));
    }
    return datos.results || [];
  }

  async function asegurarGrafoComunidades() {
    const resultados = await ejecutarCypher([
      { statement: "CALL gds.graph.exists('grafo-completo') YIELD exists RETURN exists" }
    ]);
    const fila = resultados[0] && resultados[0].data && resultados[0].data[0];
    if (fila && fila.row[0]) return;

    await ejecutarCypher([
      { statement: "CALL gds.graph.project('grafo-completo', ['Usuario', 'Tema'], ['HABLA_DE']) YIELD graphName RETURN graphName" }
    ]);
  }

  async function cargarGrafo() {
    const { clave, cfg } = consultaActiva();
    const entrada = $("limite-grafo");
    const limiteBase = numero(entrada && entrada.value ? entrada.value : CFG.NEO4J_LIMIT) || CFG.NEO4J_LIMIT || 100;
    const limite = Math.max(1, Math.min(1000, limiteBase));

    const t0 = performance.now();
    setEstado("estado-grafo", "Consultando Neo4j…", "info");

    try {
      if (clave === "comunidades") {
        setEstado("estado-grafo", "Preparando grafo GDS…", "info");
        await asegurarGrafoComunidades();
        setEstado("estado-grafo", "Consultando Neo4j…", "info");
      }

      const resultados = await ejecutarCypher([
        { statement: cfg.cypher, parameters: { limit: limite } }
      ]);
      const t1 = performance.now();
      const durMs = Math.round(t1 - t0);
      setKpi("kpi-neo4j-tiempo", durMs + " ms");

      const resultado = resultados[0];
      if (!resultado) throw new Error("Neo4j no devolvió resultados");

      const filas = resultado.data.map((f) => f.row);
      renderGrafo(clave, cfg, filas, limite);
      setEstado("estado-grafo", filas.length + " filas · Neo4j", "ok");
      setKpi("kpi-actualizado", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      console.error("Error al consultar Neo4j:", error);
      setEstado("estado-grafo", "Error Neo4j: " + error.message, "error");
      nota("nota-grafo", "Revisá que el contenedor esté corriendo, el CORS habilitado y el usuario webreader creado.");
      const tbody = $("tabla-grafo");
      if (tbody) tbody.innerHTML = "<tr><td colspan='6'>No se pudo consultar Neo4j.</td></tr>";
      setKpi("kpi-neo4j-tiempo", "—");
      setKpi("kpi-actualizado", "—");
    }
  }

  function rellenarKpisGrafo(clave, columnas, filas, cfg) {
    setKpi("kpi-consulta", cfg.etiqueta || clave);

    if (clave === "resumen" && filas.length) {
      const fila = filas[0];
      setKpi("kpi-usuarios", fmt.format(numero(fila[columnas.indexOf("usuarios")])));
      setKpi("kpi-temas", fmt.format(numero(fila[columnas.indexOf("temas")])));
      setKpi("kpi-relaciones", fmt.format(numero(fila[columnas.indexOf("relaciones")])));
      return;
    }

    if (clave === "comunidades" && filas.length) {
      const iCantidad = columnas.indexOf("cantidad_temas");
      setKpi("kpi-usuarios", "—");
      setKpi("kpi-temas", fmt.format(filas.reduce((acc, f) => acc + numero(f[iCantidad]), 0)));
      setKpi("kpi-relaciones", fmt.format(filas.length) + " comunidades");
      return;
    }

    const iUsuario = columnas.indexOf("usuario");
    const iTema = columnas.indexOf("tema");
    const iPeso = columnas.findIndex((c) => ["peso", "temas", "usos"].includes(c));
    const unicos = (i) => (i < 0 ? 0 : new Set(filas.map((f) => String(f[i])).filter(Boolean)).size);

    setKpi("kpi-usuarios", iUsuario >= 0 ? fmt.format(unicos(iUsuario)) : "—");
    setKpi("kpi-temas", iTema >= 0 ? fmt.format(unicos(iTema)) : "—");
    setKpi("kpi-relaciones", iPeso >= 0 ? fmt.format(filas.reduce((a, f) => a + numero(f[iPeso]), 0)) : fmt.format(filas.length));
  }

  function renderGrafo(clave, cfg, filas, limite) {
    const columnas = Array.isArray(cfg.columnas) ? cfg.columnas : [];
    const grafoBox = $("grafo-red");
    const chartBox = $("chart-grafo-box");
    if (grafoBox) grafoBox.hidden = true;
    if (chartBox) chartBox.hidden = true;

    rellenarKpisGrafo(clave, columnas, filas, cfg);

    const etiquetas = {
      usuario: "Usuario", seguidores: "Seguidores", tema: "Tema", peso: "Peso",
      temas: "Temas distintos", usos: "Usos", usuarios: "Usuarios", relaciones: "Relaciones",
      comunidad: "Comunidad", cantidad_temas: "Temas en comunidad", ejemplos: "Ejemplos de temas"
    };
    const numericas = new Set(["seguidores", "peso", "temas", "usos", "usuarios", "relaciones", "cantidad_temas"]);

    const cabecera = $("cabecera-grafo");
    if (cabecera) {
      cabecera.innerHTML = "<tr>" + columnas.map((c) => "<th>" + esc(etiquetas[c] || c) + "</th>").join("") + "</tr>";
    }

    const tbody = $("tabla-grafo");
    if (tbody) {
      tbody.innerHTML = filas.length
        ? filas.map((fila) => "<tr>" + fila.map((valor, i) => {
            const col = columnas[i] || "";
            const esNumero = numericas.has(col);
            const contenido = esNumero ? fmt.format(numero(valor)) : esc(valor);
            return "<td" + (esNumero ? " class='num'" : "") + ">" + contenido + "</td>";
          }).join("") + "</tr>").join("")
        : "<tr><td colspan='" + Math.max(1, columnas.length) + "'>Sin resultados para esta consulta.</td></tr>";
    }

    nota("nota-grafo", "Consulta: " + cfg.etiqueta + " · límite " + limite + (filas.length === limite ? " (podría haber más)" : ""));

    if (clave === "relaciones") {
      dibujarRed(columnas, filas);
    } else if (clave !== "resumen") {
      dibujarBarras(columnas, filas);
    }
  }

  function dibujarRed(columnas, filas) {
    const contenedor = $("grafo-red");
    if (!contenedor) return;

    if (!window.vis || !window.vis.DataSet || !window.vis.Network) {
      agregarNota("nota-grafo", "vis-network no disponible: se muestra la tabla de relaciones.");
      return;
    }

    const iu = columnas.indexOf("usuario");
    const it = columnas.indexOf("tema");
    const is = columnas.indexOf("seguidores");
    const ip = columnas.indexOf("peso");
    if (iu < 0 || it < 0) return;

    const nodos = new window.vis.DataSet();
    const aristas = new window.vis.DataSet();

    filas.forEach((f) => {
      const usuario = String(f[iu]);
      const tema = String(f[it]);
      const seguidores = is >= 0 ? numero(f[is]) : 0;
      const peso = ip >= 0 ? numero(f[ip]) : 1;
      const idU = "u:" + usuario;
      const idT = "t:" + tema;

      if (!nodos.get(idU)) {
        nodos.add({
          id: idU,
          label: usuario,
          group: "usuario",
          value: seguidores + 1,
          title: "Seguidores: " + fmt.format(seguidores)
        });
      }
      if (!nodos.get(idT)) {
        nodos.add({ id: idT, label: tema, group: "tema", value: peso + 1, title: "Tema: " + tema });
      }
      aristas.add({
        from: idU,
        to: idT,
        width: Math.max(1, Math.min(6, Math.log10(peso + 1) * 2)),
        title: "Peso: " + fmt.format(peso)
      });
    });

    contenedor.hidden = false;
    if (redGrafo) redGrafo.destroy();

    redGrafo = new window.vis.Network(contenedor, { nodes: nodos, edges: aristas }, {
      nodes: { shape: "dot", font: { size: 11, color: "#e5e7eb" }, borderWidth: 1 },
      edges: { arrows: "to", smooth: true, color: { color: "rgba(148,163,184,.45)", highlight: "#38bdf8" } },
      groups: {
        usuario: { color: { background: "#38bdf8", border: "#0284c7" } },
        tema: { shape: "box", color: { background: "#a78bfa", border: "#7c3aed" } }
      },
      physics: { stabilization: true, barnesHut: { gravitationalConstant: -2500, springLength: 120 } },
      interaction: { hover: true, tooltipDelay: 120 }
    });
  }

  function dibujarBarras(columnas, filas) {
    if (!window.Chart) {
      agregarNota("nota-grafo", "Chart.js no disponible: se muestra la tabla.");
      return;
    }

    const canvas = $("chart-grafo");
    if (!canvas) return;

    const esComunidad = columnas.includes("comunidad");
    const iLabel = columnas.indexOf("tema") >= 0 ? columnas.indexOf("tema")
               : columnas.indexOf("usuario") >= 0 ? columnas.indexOf("usuario")
               : esComunidad ? columnas.indexOf("comunidad") : -1;
    const iValor = columnas.findIndex((c) =>
      ["usos", "temas", "peso", "cantidad_temas"].includes(c));
    if (iLabel < 0 || iValor < 0) return;

    const caja = $("chart-grafo-box");
    if (caja) caja.hidden = false;
    if (chartGrafo) chartGrafo.destroy();

    chartGrafo = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: filas.map((f) => esComunidad ? "Comunidad " + f[iLabel] : String(f[iLabel])),
        datasets: [{
          label: esComunidad ? "Cantidad de temas" : "Valor",
          data: filas.map((f) => numero(f[iValor])),
          backgroundColor: "rgba(56,189,248,.55)",
          borderColor: "#38bdf8",
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,.12)" } },
          y: { ticks: { color: "#cbd5e1" }, grid: { display: false } }
        }
      }
    });
  }

  function iniciar() {
    const limite = $("limite-grafo");
    if (limite) limite.value = CFG.NEO4J_LIMIT || 100;
    cargarEvolucion();
    cargarGrafo();
  }

  const botonEvolucion = $("btn-recargar-evolucion");
  if (botonEvolucion) botonEvolucion.addEventListener("click", cargarEvolucion);

  const anioDesde = $("anio-desde");
  if (anioDesde) anioDesde.addEventListener("input", actualizarUIAnios);

  const anioHasta = $("anio-hasta");
  if (anioHasta) anioHasta.addEventListener("input", actualizarUIAnios);

  const botonAnios = $("btn-anios-todos");
  if (botonAnios) botonAnios.addEventListener("click", () => {
    const desdeInput = $("anio-desde");
    const hastaInput = $("anio-hasta");
    if (!desdeInput || !hastaInput || desdeInput.disabled) return;
    desdeInput.value = desdeInput.min;
    hastaInput.value = hastaInput.max;
    actualizarUIAnios();
  });

  const botonGrafo = $("btn-consultar-grafo");
  if (botonGrafo) botonGrafo.addEventListener("click", cargarGrafo);

  const selector = $("consulta-grafo");
  if (selector) selector.addEventListener("change", cargarGrafo);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
