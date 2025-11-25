/* ============================================================
   NoWords CharaTool
   script.js — 完成版（ver 1.0）
   機能：スライス / プレビュー / ズーム / ドラッグ /
        パレット / 配置グリッド / 微調整 / 行列調整 /
        右クリック削除 / PNG保存 / 設定保存
============================================================ */

/* =========================
   グリッド基本設定
========================= */
let gridCols = 9;
let gridRows = 6;
let cellW = 64;
let cellH = 64;

const gridCanvas = document.getElementById("grid-canvas");
const ctx = gridCanvas.getContext("2d");

let grid = [];
let selectedCell = null;

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
   グリッド描画
========================= */
function drawGrid() {
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = grid[r][c];
      if (cell && cell.img) {
        ctx.drawImage(
          cell.img,
          c * cellW + cell.offsetX,
          r * cellH + cell.offsetY,
          cellW,
          cellH
        );
      }
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

  if (selectedCell) {
    highlightSelected(selectedCell.row, selectedCell.col);
  }
}

/* =========================
   グリッドクリックで選択
========================= */
gridCanvas.addEventListener("click", (e) => {
  const rect = gridCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);

  if (row < 0 || row >= gridRows) return;
  if (col < 0 || col >= gridCols) return;

  selectedCell = { row, col };
  document.getElementById("selected-pos").textContent = `(${row}, ${col})`;

  const cell = grid[row][col];
  if (cell) {
    document.getElementById("offset-x").value = cell.offsetX;
    document.getElementById("offset-y").value = cell.offsetY;
  } else {
    document.getElementById("offset-x").value = 0;
    document.getElementById("offset-y").value = 0;
  }

  drawGrid();
});

/* =========================
   右クリック削除
========================= */
gridCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const rect = gridCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);

  if (row < 0 || row >= gridRows) return;
  if (col < 0 || col >= gridCols) return;

  grid[row][col] = null;
  selectedCell = null;
  document.getElementById("selected-pos").textContent = "なし";
  drawGrid();
});

/* =========================
   ドラッグ＆ドロップ配置
========================= */
gridCanvas.addEventListener("dragover", (e) => e.preventDefault());

gridCanvas.addEventListener("drop", (e) => {
  e.preventDefault();
  const rect = gridCanvas.getBoundingClientRect();

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);

  if (row < 0 || row >= gridRows) return;
  if (col < 0 || col >= gridCols) return;

  const imgSrc = e.dataTransfer.getData("imgSrc");
  if (!imgSrc) return;

  const img = new Image();
  img.src = imgSrc;

  grid[row][col] = { img, offsetX: 0, offsetY: 0 };

  selectedCell = { row, col };
  document.getElementById("selected-pos").textContent = `(${row}, ${col})`;

  drawGrid();
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
  if (!selectedCell) return;

  const { row, col } = selectedCell;
  const cell = grid[row][col];
  if (!cell) return;

  cell.offsetX = parseInt(document.getElementById("offset-x").value);
  cell.offsetY = parseInt(document.getElementById("offset-y").value);

  drawGrid();
}

document.getElementById("offset-x").addEventListener("input", updateSelectedOffsets);
document.getElementById("offset-y").addEventListener("input", updateSelectedOffsets);

document.querySelectorAll("#offset-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    const cell = grid[row][col];
    if (!cell) return;

    const move = btn.dataset.move;
    if (move === "up") cell.offsetY -= 1;
    if (move === "down") cell.offsetY += 1;
    if (move === "left") cell.offsetX -= 1;
    if (move === "right") cell.offsetX += 1;

    document.getElementById("offset-x").value = cell.offsetX;
    document.getElementById("offset-y").value = cell.offsetY;

    drawGrid();
  });
});

document.getElementById("offset-reset").addEventListener("click", () => {
  if (!selectedCell) return;
  const { row, col } = selectedCell;
  const cell = grid[row][col];
  if (!cell) return;

  cell.offsetX = 0;
  cell.offsetY = 0;
  document.getElementById("offset-x").value = 0;
  document.getElementById("offset-y").value = 0;

  drawGrid();
});

/* =========================
   行・列の一括調整
========================= */
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
});

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
      if (cell && cell.img) {
        outCtx.drawImage(
          cell.img,
          c * cellW + cell.offsetX,
          r * cellH + cell.offsetY,
          cellW,
          cellH
        );
      }
    }
  }

  const dataURL = outCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "NoWordsChara.png";
  a.click();
});

/* =============================================================
   スライス機能（プレビュー・ズーム・ドラッグ・分割）
============================================================= */
let sliceSourceImage = null;

const slicePrevCanvas = document.getElementById("slice-preview-canvas");
const slicePrevCtx = slicePrevCanvas.getContext("2d");

let slicePrevScale = 2.0;
const slicePrevScaleMin = 0.5;
const slicePrevScaleMax = 8.0;

let slicePrevOffsetX = 0;
let slicePrevOffsetY = 0;

let draggingPreview = false;
let dragStartX = 0;
let dragStartY = 0;

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

      slicePrevCanvas.width = 300;
      slicePrevCanvas.height = 300;

      slicePrevOffsetX = 0;
      slicePrevOffsetY = 0;

      drawSlicePreview();
    };
    sliceSourceImage.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

/* --------------------
   プレビュー描画
-------------------- */
function drawSlicePreview() {
  if (!sliceSourceImage) return;

  slicePrevCtx.clearRect(0, 0, slicePrevCanvas.width, slicePrevCanvas.height);

  slicePrevCtx.drawImage(
    sliceSourceImage,
    slicePrevOffsetX,
    slicePrevOffsetY,
    sliceSourceImage.width * slicePrevScale,
    sliceSourceImage.height * slicePrevScale
  );

  const sw = parseInt(document.getElementById("slice-w").value);
  const sh = parseInt(document.getElementById("slice-h").value);
  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);

  slicePrevCtx.strokeStyle = "rgba(255,255,255,0.3)";
  slicePrevCtx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slicePrevCtx.strokeRect(
        slicePrevOffsetX + c * sw * slicePrevScale,
        slicePrevOffsetY + r * sh * slicePrevScale,
        sw * slicePrevScale,
        sh * slicePrevScale
      );
    }
  }
}

/* --------------------
   プレビュードラッグ移動
-------------------- */
slicePrevCanvas.addEventListener("mousedown", (e) => {
  draggingPreview = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
});

slicePrevCanvas.addEventListener("mousemove", (e) => {
  if (!draggingPreview) return;

  const dx = (e.clientX - dragStartX);
  const dy = (e.clientY - dragStartY);

  slicePrevOffsetX += dx;
  slicePrevOffsetY += dy;

  dragStartX = e.clientX;
  dragStartY = e.clientY;

  document.getElementById("slice-offx").value = Math.round(slicePrevOffsetX / slicePrevScale);
  document.getElementById("slice-offy").value = Math.round(slicePrevOffsetY / slicePrevScale);

  drawSlicePreview();
});

slicePrevCanvas.addEventListener("mouseup", () => draggingPreview = false);
slicePrevCanvas.addEventListener("mouseleave", () => draggingPreview = false);

/* --------------------
   プレビューズーム（ホイール）
-------------------- */
slicePrevCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const oldScale = slicePrevScale;

  if (e.deltaY < 0) slicePrevScale = Math.min(slicePrevScale + 0.2, slicePrevScaleMax);
  else slicePrevScale = Math.max(slicePrevScale - 0.2, slicePrevScaleMin);

  const rect = slicePrevCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomFactor = slicePrevScale / oldScale;

  slicePrevOffsetX = mouseX - (mouseX - slicePrevOffsetX) * zoomFactor;
  slicePrevOffsetY = mouseY - (mouseY - slicePrevOffsetY) * zoomFactor;

  drawSlicePreview();
});

/* --------------------
   スライス実行
-------------------- */
document.getElementById("slice-run").addEventListener("click", () => {
  if (!sliceSourceImage) {
    alert("画像が読み込まれていません");
    return;
  }

  const sw = parseInt(document.getElementById("slice-w").value);
  const sh = parseInt(document.getElementById("slice-h").value);
  const cols = parseInt(document.getElementById("slice-cols").value);
  const rows = parseInt(document.getElementById("slice-rows").value);

  const ox = parseInt(document.getElementById("slice-offx").value);
  const oy = parseInt(document.getElementById("slice-offy").value);

  const sliceList = document.getElementById("slice-list");
  sliceList.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {

      const sx = (ox + c * sw);
      const sy = (oy + r * sh);

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx2 = canvas.getContext("2d");

      ctx2.drawImage(
        sliceSourceImage,
        sx, sy, sw, sh,
        0, 0, sw, sh
      );

      canvas.draggable = true;
      canvas.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("imgSrc", canvas.toDataURL("image/png"));
      });

      sliceList.appendChild(canvas);
    }
  }

  saveSliceSettings();
  console.log("スライス完了");
});

/* --------------------
   スライス設定保存
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

loadSliceSettings();

/* =========================
   初期起動
========================= */
resetGrid();
resizeCanvas();
drawGrid();
