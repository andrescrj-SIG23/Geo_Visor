const DEPTOS_URL = 'Departamentos.geojson';
const MUNICIPIOS_URL = 'Municipios.geojson';
const COLEGIOSPAIS_URL = 'ColegiosPais.geojson';
const RED_NACIONAL_SST = 'datos_ips.csv';

// Nombre del campo de Departamentos.geojson
const DEPT_NAME_FIELDS = ['DeNombre'];

// Nombre del campo en Municipios.geojson que es llave con Departamentos.geojson
const MUNI_DEPT_NAME_FIELDS = ['Depto'];

// Si en vez de nombre usas CÓDIGO de dpto (recomendado si lo tienes),
// añade aquí los campos (en ambos GeoJSON) y activa el "link" por código.
const USE_CODE_LINK = false;
const DEPT_CODE_FIELDS = ['COD_DEP', 'DPTO_CCDGO', 'DPTO'];
const MUNI_DEPT_CODE_FIELDS = ['COD_DEP', 'DPTO_CCDGO', 'DPTO'];

// Ajustes de zoom
const MAX_ZOOM_ON_FOCUS = 10;

// ========= Campo ETC configurable =========
const ETC_FIELD = 'ETC'; // Ajusta al nombre real del campo en tu Municipios.geojson

// Capas para las IPS
let emoLayer = null;
let ecisLayer = null;
let pclLayer = null;

// Mapa para almacenar datos de IPS por MpCodigo
const ipsData = new Map();

// Conjuntos para nombres únicos de IPS
const emoIPSNames = new Set();
const ecisIPSNames = new Set();
const pclIPSNames = new Set();

// ========= Utiles =========
const normalize = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const pickFirstProp = (obj, candidates) => {
  if (!obj) return undefined;
  for (const k of candidates) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
};

const getDeptName = (feature) => {
  return pickFirstProp(feature.properties, DEPT_NAME_FIELDS) ?? 'Departamento';
};
const getDeptCode = (feature) => {
  return pickFirstProp(feature.properties, DEPT_CODE_FIELDS);
};

const getMunDeptName = (feature) => {
  return pickFirstProp(feature.properties, MUNI_DEPT_NAME_FIELDS);
};
const getMunDeptCode = (feature) => {
  return pickFirstProp(feature.properties, MUNI_DEPT_CODE_FIELDS);
};

// ========= Estilos =========
const deptDefaultStyle = () => ({
  color: '#007d6e',
  weight: 1,
  fillColor: '#4dd0b3',
  fillOpacity: 0.25
});

const deptDimmedStyle = () => ({
  color: '#007d6e',
  weight: 1,
  fillColor: '#4dd0b3',
  fillOpacity: 0.06
});

const deptHighlightStyle = () => ({
  color: '#003d38',
  weight: 2,
  fillColor: '#a8ead9',
  fillOpacity: 0.35
});

const muniStyle = () => ({
  color: '#4b9d2aff',
  weight: 1,
  fillColor: '#86f0a6ff',
  fillOpacity: 0.25
});

// ========= ETC Colors =========
const ETC_PALETTE = [
  '#ff7f0e','#1f77b4','#2ca02c','#d62728','#9467bd','#8c564b',
  '#e377c2','#7f7f7f','#bcbd22','#17becf','#393b79','#637939',
  '#8c6d31','#843c39','#7b4173'
];
const etcColorMap = new Map();
const getETCColor = (etc) => {
  if (!etcColorMap.has(etc)) {
    const color = ETC_PALETTE[etcColorMap.size % ETC_PALETTE.length];
    etcColorMap.set(etc, color);
  }
  return etcColorMap.get(etc);
};

// Paleta de colores para IPS
const IPS_PALETTE = [
  '#ff7f0e','#1f77b4','#2ca02c','#d62728','#9467bd','#8c564b',
  '#e377c2','#7f7f7f','#bcbd22','#17becf','#393b79','#637939',
  '#8c6d31','#843c39','#7b4173'
];

// Mapas de colores para cada tipo de IPS
const emoColorMap = new Map();
const ecisColorMap = new Map();
const pclColorMap = new Map();

// Función para obtener el color de una IPS según su nombre y tipo
const getIPSColor = (ipsName, ipsType) => {
  const colorMap = {
    EMO: emoColorMap,
    ECIS: ecisColorMap,
    PCL: pclColorMap
  }[ipsType];
  if (!colorMap.has(ipsName)) {
    const color = IPS_PALETTE[colorMap.size % IPS_PALETTE.length];
    colorMap.set(ipsName, color);
  }
  return colorMap.get(ipsName);
};

// ========= Mapa =========
const map = L.map('map', { zoomControl: true }).setView([4.6, -74.1], 5);

L.tileLayer(
  'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}{r}.png',
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18
  }
).addTo(map);

// ========= Capas y estructuras =========
let deptLayer;                     
let muniLayer;                     
const allDeptBounds = L.latLngBounds();

const deptIndexByKey = new Map();  
const muniIndex = new Map();       

const selectDpto = document.getElementById('select-dpto');
const selectEtc = document.getElementById('select-etc');
let currentDeptKey = null;

// Leyenda
const legendEl = document.getElementById('legend');
const renderLegend = (etcList) => {
  if (!legendEl) return;
  let itemsHTML = '';
  if (etcList && etcList.length > 0) {
    itemsHTML = etcList
      .map(etc => `
        <div class="item">
          <span class="swatch" style="background:${getETCColor(etc)};"></span>
          <span>${etc}</span>
        </div>
      `).join('');
  }
  let ipsItemsHTML = '';
  const addIPSItems = (ipsType, ipsNames, colorMap) => {
    if (ipsNames.size > 0) {
      return Array.from(ipsNames)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map(name => `
          <div class="item">
            <span class="swatch" style="background:${colorMap.get(name)};"></span>
            <span>${ipsType}: ${name}</span>
          </div>
        `).join('');
    }
    return '';
  };
  if (toggleEMO?.checked) ipsItemsHTML += addIPSItems('EMO', emoIPSNames, emoColorMap);
  if (toggleECIS?.checked) ipsItemsHTML += addIPSItems('ECIS', ecisIPSNames, ecisColorMap);
  if (togglePCL?.checked) ipsItemsHTML += addIPSItems('PCL', pclIPSNames, pclColorMap);
  legendEl.innerHTML = (itemsHTML || ipsItemsHTML)
    ? `<h4>ETC</h4>${itemsHTML}<h4>IPS</h4>${ipsItemsHTML}`
    : '';
};

const resetEtcSelect = (list = []) => {
  if (!selectEtc) return;
  selectEtc.innerHTML = `<option value="__ETC_ALL__">— Todos —</option>`;
  list
    .filter(Boolean)
    .sort((a,b)=>a.localeCompare(b,'es'))
    .forEach(etc => {
      const opt = document.createElement('option');
      opt.value = etc;
      opt.textContent = etc;
      selectEtc.appendChild(opt);
    });
};

// ========= Carga de datos =========
Promise.all([
  fetch(DEPTOS_URL).then(r => r.json()),
  fetch(MUNICIPIOS_URL).then(r => r.json()),
  fetch(RED_NACIONAL_SST).then(r => r.text()) // Cargar CSV como texto
]).then(([deptGeo, muniGeo, csvText]) => {
  // Procesar CSV con PapaParse
  Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    complete: (result) => {
      result.data.forEach(row => {
        const mpCodigo = normalize(String(row.MpCodigo ?? ''));
        if (mpCodigo) {
          ipsData.set(mpCodigo, {
            EMO: row.EMO ? String(row.EMO).trim() : null,
            ECIS: row.ECIS ? String(row.ECIS).trim() : null,
            PCL: row.PCL ? String(row.PCL).trim() : null
          });
        }
      });
    }
  });

  // 1) Construir Departamentos
  deptLayer = L.geoJSON(deptGeo, {
    style: deptDefaultStyle,
    onEachFeature: (feature, layer) => {
      const name = getDeptName(feature);
      const code = getDeptCode(feature);
      const key = USE_CODE_LINK
        ? normalize(String(code ?? ''))
        : normalize(String(name ?? ''));

      if (key) deptIndexByKey.set(key, layer);

      const b = layer.getBounds();
      if (b.isValid()) allDeptBounds.extend(b);

      layer.bindTooltip(String(name ?? 'Departamento'), { sticky: true });

      layer.on({
        mouseover: (e) => {
          e.target.setStyle(deptHighlightStyle());
          if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            e.target.bringToFront();
          }
        },
        mouseout: (e) => {
          if (muniLayer && map.hasLayer(muniLayer)) {
            e.target.setStyle(deptDimmedStyle());
          } else if (deptLayer) {
            deptLayer.resetStyle(e.target);
          }
        },
        click: () => {
          const keyClicked = key;
          if (keyClicked && selectDpto) {
            selectDpto.value = keyClicked;
            handleSelectChange(keyClicked);
          } else if (keyClicked) {
            handleSelectChange(keyClicked);
          }
        }
      });
    }
  }).addTo(map);

  // Llenar select de departamentos
  if (selectDpto) {
    if (!Array.from(selectDpto.options).some(o => o.value === '__ALL__')) {
      const optAll = document.createElement('option');
      optAll.value = '__ALL__';
      optAll.textContent = '— Todos los departamentos —';
      selectDpto.prepend(optAll);
      selectDpto.value = '__ALL__';
    }

    const items = [];
    deptLayer.eachLayer(l => {
      const f = l.feature;
      const name = getDeptName(f);
      const code = getDeptCode(f);
      const key = USE_CODE_LINK
        ? normalize(String(code ?? ''))
        : normalize(String(name ?? ''));
      if (key) items.push({ key, label: String(name ?? 'Departamento') });
    });
    const seen = new Set();
    items
      .filter(i => { if (seen.has(i.key)) return false; seen.add(i.key); return true; })
      .sort((a, b) => normalize(a.label).localeCompare(normalize(b.label), 'es'))
      .forEach(({ key, label }) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        selectDpto.appendChild(opt);
      });
  }

  if (allDeptBounds.isValid()) {
    map.fitBounds(allDeptBounds, { padding: [20, 20] });
  }

  // 2) Indexar Municipios por departamento
  (muniGeo.features ?? []).forEach(feat => {
    const key = USE_CODE_LINK
      ? normalize(String(getMunDeptCode(feat) ?? ''))
      : normalize(String(getMunDeptName(feat) ?? ''));
    if (!key) return;
    if (!muniIndex.has(key)) muniIndex.set(key, []);
    muniIndex.get(key).push(feat);
  });

  // Mostrar solo departamentos AL FINAL, cuando deptLayer ya existe
  showOnlyDepartamentos();
}).catch(err => {
  console.error('Error cargando datos:', err);
  // Mostrar error en la UI
  if (document.getElementById('error-message')) {
    document.getElementById('error-message').textContent = 'Error al cargar los datos. Por favor, intenta de nuevo.';
  }
});

// ========= Lógica de UI =========
if (selectDpto) {
  selectDpto.addEventListener('change', (e) => {
    const value = e.target.value;
    if (value === '__ALL__') {
      showOnlyDepartamentos();
    } else {
      handleSelectChange(value);
    }
  });
}

if (selectEtc) {
  selectEtc.addEventListener('change', () => {
    if (currentDeptKey) handleSelectChange(currentDeptKey);
  });
}

// Oyentes para casillas de IPS
const toggleEMO = document.getElementById('toggle-emo');
const toggleECIS = document.getElementById('toggle-ecis');
const togglePCL = document.getElementById('toggle-pcl');

[toggleEMO, toggleECIS, togglePCL].forEach(toggle => {
  if (toggle) {
    toggle.addEventListener('change', () => {
      if (currentDeptKey) {
        handleSelectChange(currentDeptKey);
      } else {
        showOnlyDepartamentos();
      }
    });
  }
});

function handleSelectChange(key) {
  currentDeptKey = key;

  const dptoLayer = deptIndexByKey.get(key);
  const muniFeatures = muniIndex.get(key) ?? [];

  if (deptLayer) {
    deptLayer.eachLayer(l => l.setStyle(deptDimmedStyle()));
  }
  if (dptoLayer) dptoLayer.setStyle(deptHighlightStyle());

  if (muniLayer && map.hasLayer(muniLayer)) {
    map.removeLayer(muniLayer);
  }

  // Limpiar capas de IPS existentes
  if (emoLayer && map.hasLayer(emoLayer)) map.removeLayer(emoLayer);
  if (ecisLayer && map.hasLayer(ecisLayer)) map.removeLayer(ecisLayer);
  if (pclLayer && map.hasLayer(pclLayer)) map.removeLayer(pclLayer);
  emoLayer = null;
  ecisLayer = null;
  pclLayer = null;

  // Limpiar conjuntos de nombres de IPS
  emoIPSNames.clear();
  ecisIPSNames.clear();
  pclIPSNames.clear();

  if (muniFeatures.length > 0) {
    const selectedEtc = selectEtc?.value || '__ETC_ALL__';
    const etcSeen = new Set();

    const _features = (selectedEtc === '__ETC_ALL__')
      ? muniFeatures
      : muniFeatures.filter(f => String(f.properties?.[ETC_FIELD] ?? 'Sin_ETC') === selectedEtc);

    muniLayer = L.geoJSON({ type: 'FeatureCollection', features: _features }, {
      style: muniStyle,
      onEachFeature: (feature, layer) => {
        const etcVal = String(feature.properties?.[ETC_FIELD] ?? 'Sin_ETC');
        const color = getETCColor(etcVal);
        layer.setStyle({ fillColor: color, color: color });
        etcSeen.add(etcVal);

        const nomMun = feature.properties.MpNombre
          || feature.properties.MPIO_CNMBR
          || feature.properties.NOMBRE
          || 'Municipio';
        layer.bindTooltip(String(nomMun), { sticky: true });

        layer.on('click', (e) => {
          const b = e.target.getBounds();
          if (b.isValid()) {
            map.flyToBounds(b, { padding: [25, 25], maxZoom: Math.max(MAX_ZOOM_ON_FOCUS, 11) });
          }
        });
      }
    }).addTo(map);

    // Crear capas de IPS si están activadas
    const createIPSLayer = (ipsType, checked, ipsNamesSet) => {
      if (!checked) return null;
      const filteredFeatures = muniFeatures.filter(feat => {
        const mpCodigo = normalize(String(feat.properties.MpCodigo ?? ''));
        const ipsName = ipsData.get(mpCodigo)?.[ipsType];
        if (ipsName !== null) {
          ipsNamesSet.add(ipsName); // Agregar nombre de IPS al conjunto
          return true;
        }
        return false;
      });
      if (filteredFeatures.length === 0) return null;
      return L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures }, {
        style: (feature) => {
          const mpCodigo = normalize(String(feature.properties.MpCodigo ?? ''));
          const ipsName = ipsData.get(mpCodigo)?.[ipsType] || 'Desconocido';
          const color = getIPSColor(ipsName, ipsType);
          return {
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.5
          };
        },
        onEachFeature: (feature, layer) => {
          const mpCodigo = normalize(String(feature.properties.MpCodigo ?? ''));
          const ipsName = ipsData.get(mpCodigo)?.[ipsType] || 'Desconocido';
          const nomMun = feature.properties.MpNombre || feature.properties.MPIO_CNMBR || feature.properties.NOMBRE || 'Municipio';
          layer.bindTooltip(`${nomMun} (${ipsType}: ${ipsName})`, { sticky: true });
          layer.on('click', (e) => {
            const b = e.target.getBounds();
            if (b.isValid()) {
              map.flyToBounds(b, { padding: [25, 25], maxZoom: Math.max(MAX_ZOOM_ON_FOCUS, 11) });
            }
          });
        }
      }).addTo(map);
    };

    emoLayer = createIPSLayer('EMO', toggleEMO?.checked, emoIPSNames);
    ecisLayer = createIPSLayer('ECIS', toggleECIS?.checked, ecisIPSNames);
    pclLayer = createIPSLayer('PCL', togglePCL?.checked, pclIPSNames);

    // Ajustar límites del mapa para incluir todas las capas visibles
    const bounds = L.latLngBounds();
    if (muniLayer && map.hasLayer(muniLayer)) bounds.extend(muniLayer.getBounds());
    if (emoLayer) bounds.extend(emoLayer.getBounds());
    if (ecisLayer) bounds.extend(ecisLayer.getBounds());
    if (pclLayer) bounds.extend(pclLayer.getBounds());
    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [25, 25], maxZoom: MAX_ZOOM_ON_FOCUS });
    } else if (dptoLayer) {
      map.flyToBounds(dptoLayer.getBounds(), { padding: [25, 25], maxZoom: MAX_ZOOM_ON_FOCUS });
    }

    resetEtcSelect([...etcSeen]);
    if (selectEtc && !(etcSeen.has(selectEtc.value))) selectEtc.value = '__ETC_ALL__';
    const legendEtcs = (selectedEtc === '__ETC_ALL__') ? [...etcSeen] : [selectedEtc];
    renderLegend(legendEtcs);
  } else {
    console.warn('No se encontraron municipios para la clave:', key);
    if (dptoLayer) {
      map.flyToBounds(dptoLayer.getBounds(), { padding: [25, 25], maxZoom: MAX_ZOOM_ON_FOCUS });
    }
    resetEtcSelect([]);
    renderLegend([]);
  }
}

function showOnlyDepartamentos() {
  // Limpiar capas de IPS
  if (emoLayer && map.hasLayer(emoLayer)) map.removeLayer(emoLayer);
  if (ecisLayer && map.hasLayer(ecisLayer)) map.removeLayer(ecisLayer);
  if (pclLayer && map.hasLayer(pclLayer)) map.removeLayer(pclLayer);
  emoLayer = null;
  ecisLayer = null;
  pclLayer = null;

  // Limpiar conjuntos de nombres de IPS
  emoIPSNames.clear();
  ecisIPSNames.clear();
  pclIPSNames.clear();

  if (muniLayer && map.hasLayer(muniLayer)) {
    map.removeLayer(muniLayer);
  }
  if (!deptLayer) return;
  deptLayer.eachLayer(l => deptLayer.resetStyle(l));
  if (allDeptBounds.isValid()) {
    map.flyToBounds(allDeptBounds, { padding: [20, 20] });
  }
  if (selectEtc) selectEtc.value = '__ETC_ALL__';
  renderLegend([]);
}