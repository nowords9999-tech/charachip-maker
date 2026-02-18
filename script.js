/* ============================================================
   NoWords CharaTool
   script.js — 完成版（ver 1.1）
   機能：スライス / プレビュー / ラインスライス（上下左右）
        ズーム（％） / ドラッグ / パレット
        配置グリッド / 微調整 / 行列調整 / 右クリック削除
        PNG保存 / 設定保存
============================================================ */
/* =========================
   DOM取得ヘルパ
========================= */
function $id(id) {
  return document.getElementById(id);
}
function onId(id, ev, fn, options) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`[CharaTool] Missing element: #${id} (skip ${ev})`);
    return null;
  }
  el.addEventListener(ev, fn, options);
  return el;
}

/* =========================
   グリッド基本設定
========================= */
let gridCols = 9;
let gridRows = 6;
let cellW = 64;
let cellH = 64;
let current_gw = 0;
let current_gh = 0;
let partialSrcX = 0;  // 元画像の残り部分の開始X
let partialSrcY = 0;  // 元画像の残り部分の開始Y
let transparentPickMode = false;
let pickedColor = null; // {r,g,b}



const gridCanvas = document.getElementById("grid-canvas");
const ctx = gridCanvas.getContext("2d");

let grid = [];
let selectedCell = null;

/* =========================
   複数選択（Ctrl+Click）
========================= */
let selectedCells = new Set(); // key = "r,c"

function cellKey(r, c) { return `${r},${c}`; }

function parseCellKey(key) {
  const [r, c] = key.split(",").map(n => parseInt(n, 10));
  return { row: r, col: c };
}

function clearSelection() {
  selectedCells.clear();
  selectedCell = null;
  const el = document.getElementById("selected-pos");
  if (el) el.textContent = "なし";
}

function setSingleSelection(row, col) {
  selectedCells.clear();
  selectedCells.add(cellKey(row, col));
  selectedCell = { row, col };
  updateSelectedPosLabel();
}

function toggleSelection(row, col) {
  const key = cellKey(row, col);
  if (selectedCells.has(key)) {
    selectedCells.delete(key);
    // primary が外れたら別のを primary にする
    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
      const first = selectedCells.values().next().value;
      selectedCell = first ? parseCellKey(first) : null;
    }
  } else {
    selectedCells.add(key);
    selectedCell = { row, col }; // 最後に触ったのを primary に
  }
  updateSelectedPosLabel();
}

function getSelectedList() {
  return Array.from(selectedCells).map(parseCellKey);
}

function updateSelectedPosLabel() {
  const el = document.getElementById("selected-pos");
  if (!el) return;

  const n = selectedCells.size;
  if (n === 0) {
    el.textContent = "なし";
    return;
  }

  if (selectedCell) {
    el.textContent = `(${selectedCell.row}, ${selectedCell.col}) +${n - 1}`;
  } else {
    el.textContent = `${n}個選択`;
  }
}

/* =========================
   グリッドJSON保存／読込（localStorage）
========================= */
const GRID_STATE_STORAGE_KEY = "NoWordsCharaTool.gridState.v1";

let _gridSaveTimer = null;
function requestGridAutoSave(reason = "") {
  // 連打対策（オフセットやトリムのinputで連続発火するため）
  if (_gridSaveTimer) clearTimeout(_gridSaveTimer);
  _gridSaveTimer = setTimeout(() => {
    saveGridStateToLocalStorage(reason);
  }, 200);
}

function setGridSaveStatus(text) {
  const el = document.getElementById("grid-save-status");
  if (!el) return;
  el.textContent = text;
  // ちょいフェード（任意）
  setTimeout(() => {
    if (el.textContent === text) el.textContent = "";
  }, 1500);
}

function serializeGridState() {
  // 画像は dataURL（img.src）として保持する
  const cells = grid.map(row =>
    row.map(cell => {
      if (!cell || !cell.img) return null;
      return {
        imgSrc: cell.img.src || null,
        offsetX: cell.offsetX || 0,
        offsetY: cell.offsetY || 0,
        trimLeft: cell.trimLeft || 0,
        trimTop: cell.trimTop || 0,
        trimRight: cell.trimRight || 0,
        trimBottom: cell.trimBottom || 0,
        flipX: !!cell.flipX
      };
    })
  );

  return {
    version: 1,
    gridCols,
    gridRows,
    cellW,
    cellH,
    cells
  };
}

function saveGridStateToLocalStorage(reason = "") {
  try {
    const state = serializeGridState();
    localStorage.setItem(GRID_STATE_STORAGE_KEY, JSON.stringify(state));
    setGridSaveStatus(reason ? `保存: ${reason}` : "保存しました");
  } catch (e) {
    console.error("Grid save failed:", e);
    alert("保存に失敗しました（容量不足の可能性）");
  }
}

function applyGridSettingsFromState(state) {
  gridCols = state.gridCols;
  gridRows = state.gridRows;
  cellW = state.cellW;
  cellH = state.cellH;

  // UI入力欄も合わせる
  const colsEl = document.getElementById("grid-cols");
  const rowsEl = document.getElementById("grid-rows");
  const cwEl = document.getElementById("cell-width");
  const chEl = document.getElementById("cell-height");

  if (colsEl) colsEl.value = String(gridCols);
  if (rowsEl) rowsEl.value = String(gridRows);
  if (cwEl) cwEl.value = String(cellW);
  if (chEl) chEl.value = String(cellH);
}


/* =========================
   プリセットUI：イベント登録
========================= */
document.addEventListener("DOMContentLoaded", () => {
  const nameEl = document.getElementById("preset-name");
  const selEl = document.getElementById("preset-select");
  const saveBtn = document.getElementById("preset-save");
  const loadBtn = document.getElementById("preset-load");
  const delBtn  = document.getElementById("preset-delete");

  // 初期：一覧更新
  refreshPresetSelectUI();

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const name = normalizePresetName(nameEl ? nameEl.value : "");
      if (!name) {
        alert("プリセット名を入力してください");
        return;
      }

      const map = loadPresetsMap();
      map[name] = collectToolSettings(); // ←入力欄優先版 collectToolSettings が前提
      map[name].savedAt = new Date().toISOString();

      if (savePresetsMap(map)) {
        // ついでに「最後に使った設定」も更新しておくと便利
        try { localStorage.setItem(TOOL_SETTINGS_KEY, JSON.stringify(map[name])); } catch(e){}
        refreshPresetSelectUI();
        if (selEl) selEl.value = name;
        setPresetStatus(`保存しました: ${name}`);
      }
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      const name = selEl ? selEl.value : "";
      if (!name) {
        alert("プリセットを選択してください");
        return;
      }

      const map = loadPresetsMap();
      const data = map[name];
      if (!data) {
        alert("プリセットが見つかりません");
        refreshPresetSelectUI();
        return;
      }

      applyToolSettings(data);

      // 最後に使った設定としても保存
      try { localStorage.setItem(TOOL_SETTINGS_KEY, JSON.stringify(data)); } catch(e){}

      setPresetStatus(`読込しました: ${name}`);
    });
  }

  if (delBtn) {
    delBtn.addEventListener("click", () => {
      const name = selEl ? selEl.value : "";
      if (!name) {
        alert("削除するプリセットを選択してください");
        return;
      }

      const map = loadPresetsMap();
      if (!map[name]) {
        refreshPresetSelectUI();
        return;
      }

      delete map[name];
      if (savePresetsMap(map)) {
        refreshPresetSelectUI();
        if (selEl) selEl.value = "";
        setPresetStatus(`削除しました: ${name}`);
      }
    });
  }
});




/* =========================
   グリッド初期化
========================= */
function resetGrid() {
  grid = [];
  for (let r = 0; r < gridRows; r++) {
    const row = [];
    for (let c = 0; c < gridCols; c++) {
      row.push(null);
    }
    grid.push(row);
  }
}

function resizeCanvas() {
  gridCanvas.width = gridCols * cellW;
  gridCanvas.height = gridRows * cellH;
}

function highlightSelected(r, c) {
  ctx.strokeStyle = "rgba(255,255,0,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
  ctx.lineWidth = 1;
}



/* =========================
   グリッド描画（比率維持フィット）
========================= */
function drawGrid() {
  const realW = gridCols * cellW;
  const realH = gridRows * cellH;

  const container = document.getElementById("grid-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const scale = Math.min(cw / realW, ch / realH);

  gridCanvas.width = cw;
  gridCanvas.height = ch;

  ctx.clearRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(
    (cw - realW * scale) / 2,
    (ch - realH * scale) / 2
  );
  ctx.scale(scale, scale);

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = grid[r][c];
if (cell && cell.img) {
  const origW = cell.img.width;
  const origH = cell.img.height;

  const sx = cell.trimLeft;
  const sy = cell.trimTop;
  const sw = origW - cell.trimLeft - cell.trimRight;
  const sh = origH - cell.trimTop - cell.trimBottom;

  const origCenterX = origW / 2;
  const origCenterY = origH / 2;

  const trimmedCenterX = cell.trimLeft + sw / 2;
  const trimmedCenterY = cell.trimTop + sh / 2;

  const dx = trimmedCenterX - origCenterX;
  const dy = trimmedCenterY - origCenterY;

  const drawX = c * cellW + cell.offsetX + (cellW - sw) / 2 - dx;
  const drawY = r * cellH + cell.offsetY + (cellH - sh) / 2 - dy;

  ctx.save();

  if (cell.flipX) {
    // 左右反転用オフセット調整
    ctx.scale(-1, 1);
    ctx.drawImage(
      cell.img,
      sx, sy, sw, sh,
      -(drawX + sw), // ←左反転用の描画位置
      drawY,
      sw, sh
    );
  } else {
    ctx.drawImage(
      cell.img,
      sx, sy, sw, sh,
      drawX,
      drawY,
      sw, sh
    );
  }

  ctx.restore();
}




    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

// --- 選択ハイライト（複数） ---
if (selectedCells && selectedCells.size > 0) {
  ctx.lineWidth = 2;

  // まず全選択を薄い黄色
  ctx.strokeStyle = "rgba(255,255,0,0.55)";
  for (const key of selectedCells) {
    const { row, col } = parseCellKey(key);
    ctx.strokeRect(col * cellW + 1, row * cellH + 1, cellW - 2, cellH - 2);
  }

  // primary（最後に触ったセル）は濃い黄色
  if (selectedCell) {
    ctx.strokeStyle = "rgba(255,255,0,0.95)";
    ctx.strokeRect(
      selectedCell.col * cellW + 1,
      selectedCell.row * cellH + 1,
      cellW - 2,
      cellH - 2
    );
  }

  ctx.lineWidth = 1;
}


  ctx.restore();
}

//左右反転
document.getElementById("flip-horizontal").addEventListener("click", () => {
  if (!selectedCells || selectedCells.size === 0) return;

  for (const { row, col } of getSelectedList()) {
    const cell = grid[row][col];
    if (!cell) continue;
    cell.flipX = !cell.flipX;
  }

  drawGrid();
});

/* =========================
   設定（スライス＋グリッド）保存／読込  v1
   - 未定義変数(sliceCols等)を使わない
========================= */
const TOOL_SETTINGS_KEY = "NoWordsCharaTool.settings.v1";

function collectToolSettings() {
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };

  return {
    version: 1,

    // --- グリッド設定：入力欄の値を優先して保存 ---
    grid: {
      cols:  num("grid-cols",   gridCols),
      rows:  num("grid-rows",   gridRows),
      cellW: num("cell-width",  cellW),
      cellH: num("cell-height", cellH),
    },

    // --- スライス設定：入力欄＋プレビュー状態を保存 ---
    slice: {
      w:    num("slice-w",   null),
      h:    num("slice-h",   null),
      cols: num("slice-cols", null),
      rows: num("slice-rows", null),

      prevScale:   slicePrevScale,
      prevOffsetX: slicePrevOffsetX,
      prevOffsetY: slicePrevOffsetY,

      lineMode: sliceLineMode,
      partialLineIndex: partialLineIndex
    }
  };
}


function applyToolSettings(s) {
  if (!s || s.version !== 1) return;

  // ---- グリッド設定 ----
  if (s.grid) {
    gridCols = Number(s.grid.cols) || gridCols;
    gridRows = Number(s.grid.rows) || gridRows;
    cellW = Number(s.grid.cellW) || cellW;
    cellH = Number(s.grid.cellH) || cellH;

    if ($id("grid-cols")) $id("grid-cols").value = String(gridCols);
    if ($id("grid-rows")) $id("grid-rows").value = String(gridRows);
    if ($id("cell-width")) $id("cell-width").value = String(cellW);
    if ($id("cell-height")) $id("cell-height").value = String(cellH);

    // 設定だけ復元なので中身はリセット推奨
    resetGrid();
    resizeCanvas();
    drawGrid();
  }

  // ---- スライス設定 ----
  if (s.slice) {
    if ($id("slice-w") && s.slice.w != null) $id("slice-w").value = String(s.slice.w);
    if ($id("slice-h") && s.slice.h != null) $id("slice-h").value = String(s.slice.h);
    if ($id("slice-cols") && s.slice.cols != null) $id("slice-cols").value = String(s.slice.cols);
    if ($id("slice-rows") && s.slice.rows != null) $id("slice-rows").value = String(s.slice.rows);

    slicePrevScale = Number(s.slice.prevScale) || slicePrevScale;
    slicePrevOffsetX = Number(s.slice.prevOffsetX) || slicePrevOffsetX;
    slicePrevOffsetY = Number(s.slice.prevOffsetY) || slicePrevOffsetY;

    if (typeof s.slice.lineMode !== "undefined") sliceLineMode = s.slice.lineMode;
    if (typeof s.slice.partialLineIndex !== "undefined") partialLineIndex = s.slice.partialLineIndex;

    // UIのズーム％表示も合わせる（存在すれば）
    if ($id("slice-scale")) $id("slice-scale").value = String(Math.round(slicePrevScale * 100));

    drawSlicePreview();
    if (typeof updatePartialPreview === "function") updatePartialPreview();
  }
}

function saveToolSettings(reason = "") {
  try {
    localStorage.setItem(TOOL_SETTINGS_KEY, JSON.stringify(collectToolSettings()));
    // console.log("settings saved:", reason);
  } catch (e) {
    console.error("settings save failed:", e);
  }
}

function loadToolSettings() {
  const raw = localStorage.getItem(TOOL_SETTINGS_KEY);
  if (!raw) return false;
  try {
    applyToolSettings(JSON.parse(raw));
    return true;
  } catch (e) {
    console.error("settings load failed:", e);
    return false;
  }
}

/* =========================
   プリセット（複数）保存／読込
========================= */
const TOOL_PRESETS_KEY = "NoWordsCharaTool.presets.v1";

function loadPresetsMap() {
  try {
    const raw = localStorage.getItem(TOOL_PRESETS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === "object") ? obj : {};
  } catch (e) {
    console.error("presets load failed:", e);
    return {};
  }
}

function savePresetsMap(map) {
  try {
    localStorage.setItem(TOOL_PRESETS_KEY, JSON.stringify(map));
    return true;
  } catch (e) {
    console.error("presets save failed:", e);
    alert("プリセット保存に失敗しました（容量不足の可能性）");
    return false;
  }
}

function normalizePresetName(name) {
  return String(name || "").trim();
}

function refreshPresetSelectUI() {
  const sel = document.getElementById("preset-select");
  if (!sel) return;

  const map = loadPresetsMap();
  const names = Object.keys(map).sort((a,b)=>a.localeCompare(b, "ja"));

  const current = sel.value;

  sel.innerHTML = `<option value="">（プリセットを選択）</option>`;
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  }

  // できれば選択保持
  if (names.includes(current)) sel.value = current;
}

function setPresetStatus(text) {
  const el = document.getElementById("grid-save-status");
  if (!el) return;
  el.textContent = text;
  setTimeout(() => {
    if (el.textContent === text) el.textContent = "";
  }, 1500);
}


/* =========================
   グリッドクリックで選択（Ctrlで複数）
========================= */
gridCanvas.addEventListener("click", (e) => {
  const rect = gridCanvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;

  // --- drawGrid() と完全同じ計算 ---
  const realW = gridCols * cellW;
  const realH = gridRows * cellH;

  const container = document.getElementById("grid-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const scale = Math.min(cw / realW, ch / realH);

  const offsetX = (cw - realW * scale) / 2;
  const offsetY = (ch - realH * scale) / 2;

  // --- 逆変換 ---
  const x = (rawX - offsetX) / scale;
  const y = (rawY - offsetY) / scale;

  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);

  if (row < 0 || row >= gridRows) return;
  if (col < 0 || col >= gridCols) return;

  // Ctrl押し＝トグル、通常＝単一選択
  if (e.ctrlKey) toggleSelection(row, col);
  else setSingleSelection(row, col);

  // UI欄（primary の値を表示）
  const cell = selectedCell ? grid[selectedCell.row][selectedCell.col] : null;
  document.getElementById("offset-x").value = cell ? cell.offsetX : 0;
  document.getElementById("offset-y").value = cell ? cell.offsetY : 0;

  drawGrid();
});


/* =========================
   右クリック削除（スケール表示対応）
========================= */
gridCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const rect = gridCanvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;

  // drawGrid() と同じ計算
  const realW = gridCols * cellW;
  const realH = gridRows * cellH;

  const container = document.getElementById("grid-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const scale = Math.min(cw / realW, ch / realH);
  const offsetX = (cw - realW * scale) / 2;
  const offsetY = (ch - realH * scale) / 2;

  // 逆変換（スケール解除）
  const x = (rawX - offsetX) / scale;
  const y = (rawY - offsetY) / scale;

  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);

  if (row < 0 || row >= gridRows) return;
  if (col < 0 || col >= gridCols) return;

grid[row][col] = null;

// 選択からも外す
const k = cellKey(row, col);
if (selectedCells.has(k)) {
  selectedCells.delete(k);
  if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
    const first = selectedCells.values().next().value;
    selectedCell = first ? parseCellKey(first) : null;
  }
  updateSelectedPosLabel();
  if (!selectedCell) document.getElementById("selected-pos").textContent = "なし";
}


  drawGrid();
});


/* =========================
   ドラッグ＆ドロップで配置
========================= */
gridCanvas.addEventListener("dragover", (e) => e.preventDefault());

gridCanvas.addEventListener("drop", (e) => {
  e.preventDefault();

  const rect = gridCanvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;

  // drawGrid() と同じ計算
  const realW = gridCols * cellW;
  const realH = gridRows * cellH;

  const container = document.getElementById("grid-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const scale = Math.min(cw / realW, ch / realH);
  const offsetX = (cw - realW * scale) / 2;
  const offsetY = (ch - realH * scale) / 2;

  // 逆変換（スケール解除）
  const x = (rawX - offsetX) / scale;
  const y = (rawY - offsetY) / scale;

  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);

  if (row < 0 || row >= gridRows) return;
  if (col < 0 || col >= gridCols) return;

  const imgSrc = e.dataTransfer.getData("imgSrc");
  if (!imgSrc) return;

  const img = new Image();
  img.onload = () => {
    grid[row][col] = { img, offsetX: 0, offsetY: 0 };
    selectedCell = { row, col };
    document.getElementById("selected-pos").textContent = `(${row}, ${col})`;
    drawGrid();
    
    grid[row][col] = {
  img,
  offsetX: 0,
  offsetY: 0,
  trimLeft: 0,
  trimTop: 0,
  trimRight: 0,
  trimBottom: 0,
   flipX: false 
};

  };

  img.src = imgSrc;
});


/* =========================
   グリッド設定更新
========================= */
document.getElementById("grid-apply").addEventListener("click", () => {
  gridCols = parseInt(document.getElementById("grid-cols").value);
  gridRows = parseInt(document.getElementById("grid-rows").value);
  cellW = parseInt(document.getElementById("cell-width").value);
  cellH = parseInt(document.getElementById("cell-height").value);

  resetGrid();
  resizeCanvas();
  drawGrid();

  selectedCell = null;
  document.getElementById("selected-pos").textContent = "なし";
});

/* =========================
   個別オフセット調整
========================= */
function updateSelectedOffsets() {
  if (!selectedCells || selectedCells.size === 0) return;

  const ox = parseInt(document.getElementById("offset-x").value);
  const oy = parseInt(document.getElementById("offset-y").value);

  for (const { row, col } of getSelectedList()) {
    const cell = grid[row][col];
    if (!cell) continue;
    cell.offsetX = ox;
    cell.offsetY = oy;
  }

  drawGrid();
}


document.getElementById("offset-x").addEventListener("input", updateSelectedOffsets);
document.getElementById("offset-y").addEventListener("input", updateSelectedOffsets);

//トリミング
function updateTrim() {
  if (!selectedCells || selectedCells.size === 0) return;

  const l = parseInt(document.getElementById("trim-left").value);
  const t = parseInt(document.getElementById("trim-top").value);
  const r = parseInt(document.getElementById("trim-right").value);
  const b = parseInt(document.getElementById("trim-bottom").value);

  for (const { row, col } of getSelectedList()) {
    const cell = grid[row][col];
    if (!cell) continue;
    cell.trimLeft = l;
    cell.trimTop = t;
    cell.trimRight = r;
    cell.trimBottom = b;
  }

  drawGrid();
}


["trim-left","trim-top","trim-right","trim-bottom"].forEach(id=>{
  document.getElementById(id).addEventListener("input", updateTrim);
});

document.getElementById("trim-reset").addEventListener("click", () => {
  if (!selectedCells || selectedCells.size === 0) return;

  for (const { row, col } of getSelectedList()) {
    const cell = grid[row][col];
    if (!cell) continue;
    cell.trimLeft = cell.trimTop = cell.trimRight = cell.trimBottom = 0;
  }

  // UIも0に（代表）
  document.getElementById("trim-left").value = 0;
  document.getElementById("trim-top").value = 0;
  document.getElementById("trim-right").value = 0;
  document.getElementById("trim-bottom").value = 0;

  drawGrid();
});



document.querySelectorAll("#offset-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!selectedCells || selectedCells.size === 0) return;

    const move = btn.dataset.move;

    for (const { row, col } of getSelectedList()) {
      const cell = grid[row][col];
      if (!cell) continue;

      if (move === "up") cell.offsetY -= 1;
      if (move === "down") cell.offsetY += 1;
      if (move === "left") cell.offsetX -= 1;
      if (move === "right") cell.offsetX += 1;
    }

    // primary の値をUIに反映
    if (selectedCell) {
      const p = grid[selectedCell.row][selectedCell.col];
      document.getElementById("offset-x").value = p ? p.offsetX : 0;
      document.getElementById("offset-y").value = p ? p.offsetY : 0;
    }

    drawGrid();
  });
});

document.getElementById("offset-reset").addEventListener("click", () => {
  if (!selectedCells || selectedCells.size === 0) return;

  for (const { row, col } of getSelectedList()) {
    const cell = grid[row][col];
    if (!cell) continue;
    cell.offsetX = 0;
    cell.offsetY = 0;
  }

  if (selectedCell) {
    document.getElementById("offset-x").value = 0;
    document.getElementById("offset-y").value = 0;
  }

  drawGrid();
});


/* =========================
   行・列の一括調整
========================= 
document.getElementById("row-up").addEventListener("click", () => {
  let r = parseInt(document.getElementById("row-target").value);
  if (r < 0 || r >= gridRows) return;
  for (let c = 0; c < gridCols; c++) {
    if (grid[r][c]) grid[r][c].offsetY -= 1;
  }
  drawGrid();
});

document.getElementById("row-down").addEventListener("click", () => {
  let r = parseInt(document.getElementById("row-target").value);
  if (r < 0 || r >= gridRows) return;
  for (let c = 0; c < gridCols; c++) {
    if (grid[r][c]) grid[r][c].offsetY += 1;
  }
  drawGrid();
});

document.getElementById("col-left").addEventListener("click", () => {
  let target = parseInt(document.getElementById("col-target").value);
  if (target < 0 || target >= gridCols) return;
  for (let r = 0; r < gridRows; r++) {
    if (grid[r][target]) grid[r][target].offsetX -= 1;
  }
  drawGrid();
});

document.getElementById("col-right").addEventListener("click", () => {
  let target = parseInt(document.getElementById("col-target").value);
  if (target < 0 || target >= gridCols) return;
  for (let r = 0; r < gridRows; r++) {
    if (grid[r][target]) grid[r][target].offsetX += 1;
  }
  drawGrid();
});*/

/* =========================
   PNG保存
========================= */
document.getElementById("save-png").addEventListener("click", () => {
  const outCanvas = document.createElement("canvas");
  outCanvas.width = gridCols * cellW;
  outCanvas.height = gridRows * cellH;
  const outCtx = outCanvas.getContext("2d");

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = grid[r][c];
      if (!cell || !cell.img) continue;

      const img = cell.img;
      const origW = img.width;
      const origH = img.height;

      // --- トリム後 ---
      const sx = cell.trimLeft;
      const sy = cell.trimTop;
      const sw = origW - cell.trimLeft - cell.trimRight;
      const sh = origH - cell.trimTop - cell.trimBottom;

      // --- 元画像中心 ---
      const origCenterX = origW / 2;
      const origCenterY = origH / 2;

      // --- トリム後中心 ---
      const trimmedCenterX = cell.trimLeft + sw / 2;
      const trimmedCenterY = cell.trimTop + sh / 2;

      // --- 中心ズレ ---
      const dx = trimmedCenterX - origCenterX;
      const dy = trimmedCenterY - origCenterY;

      // --- 描画位置（画面と同じ） ---
      const drawX = c * cellW + cell.offsetX + (cellW - sw) / 2 - dx;
      const drawY = r * cellH + cell.offsetY + (cellH - sh) / 2 - dy;

      // ===== ▼ ここが修正ポイント：左右反転対応！ =====
      if (cell.flipX) {
        outCtx.save();
        outCtx.scale(-1, 1); // 左右だけ反転

        // 左右反転時は X を “-(drawX + sw)” にする
        outCtx.drawImage(
          img,
          sx, sy, sw, sh,
          -(drawX + sw), // ← ここが超重要！
          drawY,
          sw, sh
        );

        outCtx.restore();
      } else {
        outCtx.drawImage(
          img,
          sx, sy, sw, sh,
          drawX,
          drawY,
          sw, sh
        );
      }
      // ===== ▲ 反転対応ここまで =====
    }
  }

  const dataURL = outCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "NoWordsChara.png";
  a.click();
});



/* =============================================================
   スライス機能（ズーム％・ドラッグ・ラインスライス対応）
============================================================= */

let sliceSourceImage = null;

const slicePrevCanvas = document.getElementById("slice-preview-canvas");
const slicePrevCtx = slicePrevCanvas.getContext("2d");

let slicePrevScale = 2.0;
let slicePrevScaleMin = 0.3; // 最小1%
let slicePrevScaleMax = 8.0;

let slicePrevOffsetX = 0;
let slicePrevOffsetY = 0;

let draggingPreview = false;
let dragStartX = 0;
let dragStartY = 0;

/* ========== ラインスライス用変数 ========== */
let sliceLineMode = null;    // "top" or "left" or null
let sliceLineProgress = 0;   // 既存
let partialLineIndex = 0;    // ★ 追加：何コマ目から残りを表示するか



/* --------------------
   ファイル読込
-------------------- */
document.getElementById("slice-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

const reader = new FileReader();
reader.onload = function (ev) {
  sliceSourceImage = new Image();
  sliceSourceImage.onload = () => {

slicePrevCanvas.width = 500;
slicePrevCanvas.height = 500;

slicePrevOffsetX = 0;
slicePrevOffsetY = 0;

// ① まずスライスプレビューを描画（絶対最初）
drawSlicePreview();

// ② そのあと部分スライスプレビューを初期化
slicePartialCanvas.width = 500;
slicePartialCanvas.height = 500;
slicePartialCtx.clearRect(0, 0, 500, 500);



// ③ ラインスライス中なら部分プレビュー更新
if (sliceLineMode) updatePartialPreview();


    // スライス全体プレビューを描画
    drawSlicePreview();

    // ラインスライスモード中なら部分プレビューも更新
    if (sliceLineMode) updatePartialPreview();
  };

  sliceSourceImage.src = ev.target.result;
};

  reader.readAsDataURL(file);
});
/* --------------------
   プレビュー描画（ズーム + 暗幕 + ガイド線）
-------------------- */
function drawSlicePreview() {
  if (!sliceSourceImage) return;

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  slicePrevCtx.clearRect(0, 0, cw, ch);

  // ==== 元画像を描画（ズーム＋ドラッグ）====
  slicePrevCtx.drawImage(
    sliceSourceImage,
    slicePrevOffsetX,
    slicePrevOffsetY,
    sliceSourceImage.width * slicePrevScale,
    sliceSourceImage.height * slicePrevScale
  );

  // ====== ガイド線の比率維持描画 ======
  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw = parseInt(document.getElementById("slice-w").value);
  const sh = parseInt(document.getElementById("slice-h").value);

  const gridRatio = (sw * cols) / (sh * rows);

  let gw, gh;
  if (cw / ch > gridRatio) {
    gh = ch;
    gw = gh * gridRatio;
  } else {
    gw = cw;
    gh = gw / gridRatio;
  }

  const gx = (cw - gw) / 2;
  const gy = (ch - gh) / 2;

  const cellW = gw / cols;
  const cellH = gh / rows;

  slicePrevCtx.strokeStyle = "rgba(0,255,0,0.6)";
  slicePrevCtx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slicePrevCtx.strokeRect(
        gx + c * cellW,
        gy + r * cellH,
        cellW,
        cellH
      );
    }
  }



// ================================
// ★ ラインスライス時：対象行/列だけ画像を残す
// ================================
if (sliceLineMode) {
  slicePrevCtx.save();

  // ==== クリッピング領域を設定 ====
  slicePrevCtx.beginPath();

  if (sliceLineMode === "top") {
    // 上1行の範囲だけクリップ
    slicePrevCtx.rect(gx, gy, gw, cellH);

  } else if (sliceLineMode === "left") {
    // 左1列の範囲だけクリップ
    slicePrevCtx.rect(gx, gy, cellW, gh);
  }

  slicePrevCtx.clip();

  // ==== 対象範囲だけ元画像を描画（ズーム＋ドラッグ反映） ====
  slicePrevCtx.drawImage(
    sliceSourceImage,
    slicePrevOffsetX,
    slicePrevOffsetY,
    sliceSourceImage.width * slicePrevScale,
    sliceSourceImage.height * slicePrevScale
  );

  // ==== 該当部分だけガイド線を描画 ====
  slicePrevCtx.strokeStyle = "rgba(255,255,0,0.9)";
  slicePrevCtx.lineWidth = 2;

  if (sliceLineMode === "top") {
    for (let c = 0; c < cols; c++) {
      slicePrevCtx.strokeRect(
        gx + c * cellW,
        gy,
        cellW,
        cellH
      );
    }
  }

  if (sliceLineMode === "left") {
    for (let r = 0; r < rows; r++) {
      slicePrevCtx.strokeRect(
        gx,
        gy + r * cellH,
        cellW,
        cellH
      );
    }
  }

  slicePrevCtx.restore();

  // ★ 通常描画はここで止める（対象部分だけ残す）
  return;
}

}

/* =========================
   透明色ピック＆適用（イベントは一度だけ登録）
========================= */
(function setupTransparentColorPickerOnce() {
  const pickBtn = document.getElementById("pick-transparent-color");
  const applyBtn = document.getElementById("apply-transparent-color");
  const msg = document.getElementById("transparent-msg");
  const preview = document.getElementById("picked-color-preview");

  if (!pickBtn || !applyBtn || !slicePrevCanvas) return;

  pickBtn.addEventListener("click", () => {
    transparentPickMode = true;
    if (msg) msg.textContent = "スライスプレビューをクリックして色を選択してください。";
  });

  slicePrevCanvas.addEventListener("click", (e) => {
    if (!transparentPickMode) return;

    const rect = slicePrevCanvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);

    const pixel = slicePrevCtx.getImageData(x, y, 1, 1).data;
    pickedColor = { r: pixel[0], g: pixel[1], b: pixel[2] };

    if (preview) {
      preview.style.background = `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})`;
    }
    if (msg) msg.textContent = "色を選択しました。";

    transparentPickMode = false;
  });

  applyBtn.addEventListener("click", () => {
    if (!pickedColor || !sliceSourceImage) {
      alert("透明化したい色を選んでください。");
      return;
    }

    const tmp = document.createElement("canvas");
    tmp.width = sliceSourceImage.width;
    tmp.height = sliceSourceImage.height;

    const tctx = tmp.getContext("2d");
    tctx.drawImage(sliceSourceImage, 0, 0);

    const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
    const data = imgData.data;

    const threshold = 10; // 必要なら調整

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (Math.abs(r - pickedColor.r) < threshold &&
          Math.abs(g - pickedColor.g) < threshold &&
          Math.abs(b - pickedColor.b) < threshold) {
        data[i + 3] = 0;
      }
    }

    tctx.putImageData(imgData, 0, 0);

    const newImg = new Image();
    newImg.onload = () => {
      sliceSourceImage = newImg;
      drawSlicePreview();
      updatePartialPreview();
    };
    newImg.src = tmp.toDataURL();
  });
})();


const slicePartialCanvas = document.getElementById("slice-partial-canvas");
const slicePartialCtx = slicePartialCanvas.getContext("2d");
// r=0 の上一行 or c=0 の左一列を抜き出す
function updatePartialPreview() {
  if (!sliceLineMode || !sliceSourceImage) return;

  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw   = parseInt(document.getElementById("slice-w").value);
  const sh   = parseInt(document.getElementById("slice-h").value);

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  // ==== スライスプレビューのガイド線を復元 ====
  const gridRatio = (sw * cols) / (sh * rows);
  let gw, gh;
  if (cw / ch > gridRatio) {
    gh = ch;
    gw = gh * gridRatio;
  } else {
    gw = cw;
    gh = gw / gridRatio;
  }

  const gx = (cw - gw) / 2;
  const gy = (ch - gh) / 2;

  const cellW0 = gw / cols;
  const cellH0 = gh / rows;

  // ==== ★ 残り部分の開始位置（スライスプレビュー基準） ====
  let remStartX_A, remStartY_A, remW, remH;

  if (sliceLineMode === "top") {
    remStartX_A = gx + cellW0 * partialLineIndex;
    remStartY_A = gy;
    remW = gw - cellW0 * partialLineIndex;
    remH = cellH0;
  } else {
    remStartX_A = gx;
    remStartY_A = gy + cellH0 * partialLineIndex;
    remW = cellW0;
    remH = gh - cellH0 * partialLineIndex;
  }

  // ==== 元画像上の座標に変換 ====
  const srcX = (remStartX_A - slicePrevOffsetX) / slicePrevScale;
  const srcY = (remStartY_A - slicePrevOffsetY) / slicePrevScale;
  const srcW = remW / slicePrevScale;
  const srcH = remH / slicePrevScale;

  // ==== 部分スライスキャンバス初期化 ====
  const pw = slicePartialCanvas.width;
  const ph = slicePartialCanvas.height;

  slicePartialCtx.clearRect(0, 0, pw, ph);


  // ==== 部分スライス描画 ====
  slicePartialCtx.save();
  slicePartialCtx.scale(slicePrevScale, slicePrevScale);

  slicePartialCtx.drawImage(
    sliceSourceImage,
    srcX, srcY, srcW, srcH,
    partialOffsetX / slicePrevScale,
    partialOffsetY / slicePrevScale,
    srcW,
    srcH
  );

  slicePartialCtx.restore();


// ==== ガイド線：左上 1マスだけ ====
slicePartialCtx.strokeStyle = "yellow";
slicePartialCtx.lineWidth = 2;
slicePartialCtx.strokeRect(0, 0, cellW0, cellH0);

  // ★ 部分プレビューが今どの元画像座標を映しているか記録する
// ★ 部分プレビュー左上が元画像のどこを指すか
partialBaseSrcX = srcX - (partialOffsetX / slicePrevScale);
partialBaseSrcY = srcY - (partialOffsetY / slicePrevScale);


}




document.getElementById("slice-cut-one-partial")
    .addEventListener("click", () => {
        cutFromPartialCanvas();
    });


// ★ 部分スライスプレビューの左上ガイド線どおりに1コマ切る
// r=0 の上一行 or c=0 の左一列を、部分スライスプレビューから1コマずつ切る
// ★ 1回目の元画像上の起点
let firstSrcX = null;
let firstSrcY = null;

function cutFromPartialCanvas() {
  if (!sliceSourceImage || !sliceLineMode) return;

  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw   = parseInt(document.getElementById("slice-w").value);
  const sh   = parseInt(document.getElementById("slice-h").value);

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  // ---- スライスプレビューのガイド線計算（1～すべて同じ） ----
  const gridRatio = (sw * cols) / (sh * rows);
  let gw, gh;
  if (cw / ch > gridRatio) {
    gh = ch;
    gw = gh * gridRatio;
  } else {
    gw = cw;
    gh = gw / gridRatio;
  }

  const cellW0 = gw / cols;      // スライスプレビュー上の表示幅
  const cellH0 = gh / rows;

  const cellSrcW = cellW0 / slicePrevScale;  // ★元画像での1コマ幅
  const cellSrcH = cellH0 / slicePrevScale;  // ★元画像での1コマ高さ

  // ---- 最初の一回は「実際に正しく逆算して基準点を記録」 ----
  if (partialLineIndex === 0) {

    const gx = (cw - gw) / 2;
    const gy = (ch - gh) / 2;

    // 1回目のガイド線は必ず「c=0, r=0」
    const guideX_A = gx;
    const guideY_A = gy;

    // 元画像座標へ逆変換（これが絶対基準点）
    firstSrcX = (guideX_A - slicePrevOffsetX) / slicePrevScale;
    firstSrcY = (guideY_A - slicePrevOffsetY) / slicePrevScale;
  }

  // ---- ここからは「積み上げ方式」でズレゼロ ----
  let srcX, srcY;

  if (sliceLineMode === "top") {
    // 横方向に順番に切る
    srcX = firstSrcX 
         + cellSrcW * partialLineIndex 
         - (partialOffsetX / slicePrevScale);  // 部分プレビューのドラッグ考慮

    srcY = firstSrcY 
         - (partialOffsetY / slicePrevScale);

  } else {
    // 縦方向に順番に切る
    srcX = firstSrcX 
         - (partialOffsetX / slicePrevScale);

    srcY = firstSrcY
         + cellSrcH * partialLineIndex
         - (partialOffsetY / slicePrevScale);
  }

  // ---- 出力キャンバス ----
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx2 = out.getContext("2d");

  ctx2.clearRect(0, 0, sw, sh);

  ctx2.drawImage(
    sliceSourceImage,
    srcX, srcY,
    cellSrcW, cellSrcH,
    0, 0, sw, sh
  );

  out.style.border = "1px solid #0f0";
  out.style.background = "#111";
  out.draggable = true;
  out.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("imgSrc", out.toDataURL("image/png"));
  });

  document.getElementById("slice-list").appendChild(out);


  // 残りを再描画
  updatePartialPreview();
}







function advancePartialGuide() {
  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw   = parseInt(document.getElementById("slice-w").value);
  const sh   = parseInt(document.getElementById("slice-h").value);

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  // ガイド線サイズ計算
  const gridRatio = (sw * cols) / (sh * rows);
  let gw, gh;
  if (cw / ch > gridRatio) {
    gh = ch;
    gw = gh * gridRatio;
  } else {
    gw = cw;
    gh = gw / gridRatio;
  }

  const cellW = gw / cols;
  const cellH = gh / rows;



  // 反映
  drawSlicePreview();
  updatePartialPreview();
}



/* --------------------
   プレビュー：ドラッグ移動
-------------------- */
slicePrevCanvas.addEventListener("mousedown", (e) => {
  draggingPreview = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
});

slicePrevCanvas.addEventListener("mousemove", (e) => {
  if (!draggingPreview) return;

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  slicePrevOffsetX += dx;
  slicePrevOffsetY += dy;

  dragStartX = e.clientX;
  dragStartY = e.clientY;

  drawSlicePreview();
});

slicePrevCanvas.addEventListener("mouseup", () => draggingPreview = false);
slicePrevCanvas.addEventListener("mouseleave", () => draggingPreview = false);

/* --------------------
   プレビュー：ホイールズーム
-------------------- */
slicePrevCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const oldScale = slicePrevScale;

  if (e.deltaY < 0)
    slicePrevScale = Math.min(slicePrevScale + 0.2, slicePrevScaleMax);
  else
    slicePrevScale = Math.max(slicePrevScale - 0.2, slicePrevScaleMin);

  const rect = slicePrevCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomFactor = slicePrevScale / oldScale;

  slicePrevOffsetX = mouseX - (mouseX - slicePrevOffsetX) * zoomFactor;
  slicePrevOffsetY = mouseY - (mouseY - slicePrevOffsetY) * zoomFactor;

  document.getElementById("slice-scale").value = Math.round(slicePrevScale * 100);

  drawSlicePreview();
});

/* --------------------
   ズーム％ 手入力適用
-------------------- */
document.getElementById("slice-scale-apply").addEventListener("click", () => {
  let percent = parseInt(document.getElementById("slice-scale").value);
  if (isNaN(percent)) return;

  percent = Math.max(1, Math.min(800, percent)); // 1〜800%
  slicePrevScale = percent / 100;

  drawSlicePreview();
});

/* ============================================================
   ラインスライス機能（上一行 / 左一列）
============================================================ */

/* --------------------
   ラインスライス開始
-------------------- */
document.getElementById("slice-top-row-mode").addEventListener("click", () => {
  sliceLineMode = "top";
  partialLineIndex = 0;

  partialSrcX = 0;
  partialSrcY = 0;

  updatePartialPreview();
});


document.getElementById("slice-left-col-mode").addEventListener("click", () => {
  sliceLineMode = "left";
  partialLineIndex = 0;

  partialSrcX = 0;
  partialSrcY = 0;

  updatePartialPreview();
});



/* --------------------
   1コマだけ切る（部分スライスから）
-------------------- */
document.getElementById("slice-cut-one")
  .addEventListener("click", () => {
    cutOneFromPreview();
});


function cutOneFromPreview() {
  if (!sliceSourceImage) return;

  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw   = parseInt(document.getElementById("slice-w").value);
  const sh   = parseInt(document.getElementById("slice-h").value);

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  // ==== ガイド線と同じ計算 ==========
  const gridRatio = (sw * cols) / (sh * rows);
  let gw, gh;
  if (cw / ch > gridRatio) {
    gh = ch;
    gw = gh * gridRatio;
  } else {
    gw = cw;
    gh = gw / gridRatio;
  }

  const gx = (cw - gw) / 2;
  const gy = (ch - gh) / 2;

  // 1コマ目（左上）
  const cellW = gw / cols;
  const cellH = gh / rows;

  const px = gx;        // 左上コマのガイド線 X
  const py = gy;        // 左上コマのガイド線 Y

  // === 元画像座標へ変換 ===
  const srcX = (px - slicePrevOffsetX) / slicePrevScale;
  const srcY = (py - slicePrevOffsetY) / slicePrevScale;
  const srcW = cellW / slicePrevScale;
  const srcH = cellH / slicePrevScale;

  // === 出力 ===
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx2 = out.getContext("2d");

  ctx2.drawImage(
    sliceSourceImage,
    srcX, srcY, srcW, srcH,
    0, 0, sw, sh
  );

  // パレットに追加（ドラッグ可能に）
  out.style.border = "1px solid #0f0";
  out.style.background = "#111";
  out.draggable = true;
  out.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("imgSrc", out.toDataURL("image/png"));
  });

  document.getElementById("slice-list").appendChild(out);
}

/* --------------------
   ラインスライス本体
-------------------- */
function cutOneLineSlice() {
  if (!sliceLineMode || !sliceSourceImage) return;

  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw   = parseInt(document.getElementById("slice-w").value);
  const sh   = parseInt(document.getElementById("slice-h").value);

  const gw = current_gw;
  const gh = current_gh;

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  const gx = (cw - gw) / 2;
  const gy = (ch - gh) / 2;

  let index = sliceLineProgress;

  let guideX_A, guideY_A, srcW, srcH;

  if (sliceLineMode === "top") {
    if (index >= cols) return finishLineSlice();
    guideX_A = gx + index * (gw / cols);
    guideY_A = gy;
    srcW = (gw / cols) / slicePrevScale;
    srcH = (gh / rows) / slicePrevScale;  // 1行分
  }

  if (sliceLineMode === "left") {
    if (index >= rows) return finishLineSlice();
    guideX_A = gx;
    guideY_A = gy + index * (gh / rows);
    srcW = (gw / cols) / slicePrevScale;
    srcH = (gh / rows) / slicePrevScale;
  }

  const srcX = (guideX_A - slicePrevOffsetX) / slicePrevScale;
  const srcY = (guideY_A - slicePrevOffsetY) / slicePrevScale;

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx2 = out.getContext("2d");

  ctx2.drawImage(
    sliceSourceImage,
    srcX, srcY, srcW, srcH,
    0, 0, sw, sh
  );

  document.getElementById("slice-list").appendChild(out);

  sliceLineProgress++;
}


/* ============================================================
   部分スライスプレビュー：ドラッグ移動（独立版）
   - partialOffsetX / partialOffsetY にオフセットを記録
   - updatePartialPreview() がこのオフセットを利用して描画
============================================================ */

let partialOffsetX = 0;
let partialOffsetY = 0;

let partialDragging = false;
let partialDragStartX = 0;
let partialDragStartY = 0;

// -------------- マウス押下 ----------------
slicePartialCanvas.addEventListener("mousedown", (e) => {
  partialDragging = true;
  partialDragStartX = e.clientX;
  partialDragStartY = e.clientY;
});

// -------------- マウス移動 ----------------
slicePartialCanvas.addEventListener("mousemove", (e) => {
  if (!partialDragging) return;

  const dx = e.clientX - partialDragStartX;
  const dy = e.clientY - partialDragStartY;

  partialOffsetX += dx;
  partialOffsetY += dy;

  partialDragStartX = e.clientX;
  partialDragStartY = e.clientY;

  // ★ 再描画（updatePartialPreview が必須）
  if (typeof updatePartialPreview === "function") {
    updatePartialPreview();
  }
});

// -------------- マウス離脱・離す ----------------
slicePartialCanvas.addEventListener("mouseup", () => {
  partialDragging = false;
});
slicePartialCanvas.addEventListener("mouseleave", () => {
  partialDragging = false;
});


/* --------------------
   ラインスライス終了処理
-------------------- */
function finishLineSlice() {
  sliceLineMode = null;
  sliceLineProgress = 0;
  drawSlicePreview();
}

/* ============================================================
   通常スライス（全体）
============================================================ */
document.getElementById("slice-run").addEventListener("click", () => {
  if (!sliceSourceImage) {
    alert("画像が読み込まれていません");
    return;
  }

  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);
  const sw = parseInt(document.getElementById("slice-w").value);
  const sh = parseInt(document.getElementById("slice-h").value);

  const sliceList = document.getElementById("slice-list");
  sliceList.innerHTML = "";

  const cw = slicePrevCanvas.width;
  const ch = slicePrevCanvas.height;

  const gridRatio = (sw * cols) / (sh * rows);

  let gw, gh;
  if (cw / ch > gridRatio) {
    gh = ch;
    gw = gh * gridRatio;
  } else {
    gw = cw;
    gh = gw / gridRatio;
  }

  const gx = (cw - gw) / 2;
  const gy = (ch - gh) / 2;

  const cellW = gw / cols;
  const cellH = gh / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = gx + c * cellW;
      const py = gy + r * cellH;

      const srcX = (px - slicePrevOffsetX) / slicePrevScale;
      const srcY = (py - slicePrevOffsetY) / slicePrevScale;
      const srcW = cellW / slicePrevScale;
      const srcH = cellH / slicePrevScale;

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;

      const ctx2 = canvas.getContext("2d");
      ctx2.drawImage(
        sliceSourceImage,
        srcX, srcY, srcW, srcH,
        0, 0, sw, sh
      );

      canvas.style.border = "1px solid #0f0";
      canvas.style.background = "#111";
      canvas.draggable = true;
      canvas.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("imgSrc", canvas.toDataURL("image/png"));
      });

      sliceList.appendChild(canvas);
    }
  }
});

/* --------------------
   設定保存
-------------------- */
function saveSliceSettings() {
  const data = {
    w: document.getElementById("slice-w").value,
    h: document.getElementById("slice-h").value,
    cols: document.getElementById("slice-cols").value,
    rows: document.getElementById("slice-rows").value,
    offx: document.getElementById("slice-offx").value,
    offy: document.getElementById("slice-offy").value
  };
  localStorage.setItem("NoWordsSliceSettings", JSON.stringify(data));
}

function loadSliceSettings() {
  const raw = localStorage.getItem("NoWordsSliceSettings");
  if (!raw) return;

  try {
    const d = JSON.parse(raw);
    document.getElementById("slice-w").value = d.w;
    document.getElementById("slice-h").value = d.h;
    document.getElementById("slice-cols").value = d.cols;
    document.getElementById("slice-rows").value = d.rows;
    document.getElementById("slice-offx").value = d.offx;
    document.getElementById("slice-offy").value = d.offy;
  } catch (e) {}
}

document.getElementById("banner-upload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = () => {
      const box = document.getElementById("banner-box");
      box.innerHTML = ""; // テキスト削除

      // 画像要素を枠にピッタリ収める
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.objectFit = "contain";

      box.appendChild(img);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});


loadSliceSettings();

/* =========================
   初期起動
========================= */
resetGrid();
resizeCanvas();
drawGrid();
loadToolSettings();
drawSlicePreview();
