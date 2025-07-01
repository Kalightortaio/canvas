const SHEET_JSON_URL = "https://script.google.com/macros/s/AKfycbwEaB3UL9chsH4ZgyTBbNxYsZniRZ4M111-wMMql4pzTdxCkIG-DD06HSY6QsaHpRKTZQ/exec";

const board = document.getElementById("board");
const view = document.getElementById("view");
const zoomDiv = document.getElementById("zoom");
const camDiv = document.getElementById("camera");
const boardCtx = board.getContext("2d", { willReadFrequently: true });
const viewCtx = view.getContext("2d");
const brush = document.getElementById('brush-cursor');
const picker = document.getElementById('color-picker');
const drawBtn = document.getElementById('draw-btn');
const drawImgHand = document.getElementById('draw-img-hand');
const drawImgBrush = document.getElementById('draw-img-brush');
const loadingScreen = document.getElementById('loading');

const BOARD_SIZE = 1000;
const MIN_SCALE = 1, MID_SCALE = 40, MAX_SCALE = 80;
const PENDING = new Map();

let mode = "pan";
let dataRows = [];
let scale = 1.25, panX = 0, panY = 0;
let dragging = false, startX, startY, startPanX, startPanY;
board.width = board.height = view.width = view.height = BOARD_SIZE;
board.addEventListener("contextmenu", e => e.preventDefault());
view.addEventListener("contextmenu", e => e.preventDefault());

let currentColorKey = 'A';
const colorMap = {
    A: "#FFFFFF", //White
    B: "#FCF404", //Yellow
    C: "#FF6404", //Orange
    D: "#DC0808", //Red
    E: "#F00884", //Pink
    F: "#4800A4", //Purple
    G: "#0000D4", //Blue
    H: "#00ACE8", //Light Blue
    I: "#20B814", //Lime Green
    J: "#006410", //Dark Green
    K: "#582C04", //Brown
    L: "#907038", //Light Brown
    M: "#C0C0C0", //Light Grey
    N: "#808080", //Grey
    O: "#404040", //Dark Grey
    P: "#000000", //Black
};

async function loadData() {
    const resp = await fetch(SHEET_JSON_URL + "?secret_tunnel");
    dataRows = await resp.json();
}

async function uploadData() {
    if (PENDING.size === 0) return;
    const snapshot = flushPending(true);
    try {
        const resp = await fetch(SHEET_JSON_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(
                snapshot.map(({ x, y, code }) => ({ x, y, code }))
            )
        });
        if ((await resp.text()) === 'OK') {
            snapshot.forEach(({ key, code }) => {
                if (PENDING.get(key) === code) PENDING.delete(key);
            });
            await loadData();
            drawBoardFromRLE(dataRows);
            PENDING.forEach((code, key) => {
                const [x, y] = key.split(',').map(Number);
                boardCtx.fillStyle = colorMap[code];
                boardCtx.fillRect(x, y, 1, 1);
            });
        }
    } catch (err) {
        console.error('upload error:', err);
    }
}

function drawBoardFromRLE(rleRows) {
    for (let cellY = 0; cellY < rleRows.length; cellY++) {
        for (let cellX = 0; cellX < rleRows[cellY].length; cellX++) {
            const cellData = decompressCell(rleRows[cellY][cellX]);
            drawCell(boardCtx, cellData, cellX, cellY);
        }
    }
}

function decompressLine(rle) {
    const out = [];
    const re = /(\d+)?([A-Z])/g;
    let m;
    while ((m = re.exec(rle))) {
        const n = m[1] ? +m[1] : 1;
        out.push(m[2].repeat(n));
    }
    return out.join('');
  }

function decompressCell(cellStr) {
    const rows = [];
    cellStr.split('Z').filter(Boolean).forEach(seg => {
        const m = seg.match(/^(.+?)(\d*)$/);
        const rle = m[1], rep = m[2] ? +m[2] : 1;
        const line = decompressLine(rle).split('');
        for (let i = 0; i < rep; i++) rows.push([...line]);
    });
    return rows;
  }

function drawCell(context, cellData, cellX, cellY) {
    for (let y = 0; y < cellData.length; y++) {
        for (let x = 0; x < cellData[y].length; x++) {
            const char = cellData[y][x];
            const color = colorMap[char] || "#000000";
            context.fillStyle = color;
            context.fillRect((cellX * 100 + x), (cellY * 100 + y), 1, 1);
        }
    }
}

function flushPending(includeKey = false) {
    const edits = Array.from(PENDING, ([key, code]) => {
        const [x, y] = key.split(',').map(Number);
        return includeKey ? { x, y, code, key } : { x, y, code };
    });
    return edits;
}

function applyZoom() {
    zoomDiv.style.transform = `scale(${scale})`;
    board.style.width = board.style.height = BOARD_SIZE * scale + "px";
    updateBrushAppearance();
}

function applyPan() {
    camDiv.style.transform = `translate(${-panX}px, ${-panY}px)`;
    board.style.left = -panX * scale + "px";
    board.style.top = -panY * scale + "px";
}

view.addEventListener("wheel", e => {
    e.preventDefault();

    const dir = Math.sign(e.deltaY);
    const next = Math.max(MIN_SCALE,
        Math.min(MAX_SCALE, scale * (dir > 0 ? 0.9 : 1.1)));
    if (next === scale) return;

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const bx = panX + cx / scale;
    const by = panY + cy / scale;

    scale = next;
    panX = bx - cx / scale;
    panY = by - cy / scale;

    if (mode === 'draw' && scale < MID_SCALE) {
        mode = 'pan';
        view.style.cursor = 'grab';
        picker.style.visibility = 'hidden';
        drawImgHand.style.display = 'block';
        drawImgBrush.style.display = 'none';
        drawBtn.style.backgroundColor = colorMap['A'];
        updateBrushAppearance();
    }

    applyZoom();
    applyPan();
}, { passive: false });

function paintPixel(evt) {
    const rect = view.getBoundingClientRect();
    const screenX = evt.clientX - rect.left;
    const screenY = evt.clientY - rect.top;

    const tileX = Math.floor(screenX / scale);
    const tileY = Math.floor(screenY / scale);

    if (tileX < 0 || tileY < 0 || tileX >= BOARD_SIZE || tileY >= BOARD_SIZE)
        return;

    boardCtx.fillStyle = colorMap[currentColorKey] || "#000000";
    boardCtx.fillRect(tileX, tileY, 1, 1);
    PENDING.set(`${tileX},${tileY}`, currentColorKey);
}

function initColorPicker() {
    Object.entries(colorMap).forEach(([key, hex]) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.dataset.colorKey = key;
        swatch.addEventListener('click', () => {
            currentColorKey = swatch.dataset.colorKey;
            drawBtn.style.backgroundColor = hex;
            if (['F', 'G', 'J', 'K', 'O', 'P'].includes(currentColorKey)) {
                drawImgBrush.style.filter = "grayscale(1) invert(1)";
            } else {
                drawImgBrush.style.filter = "grayscale(0) invert(0)";
            }
            updateBrushAppearance();
        });
        picker.appendChild(swatch);
    });
}

function updateBrushAppearance() {
    if (mode === "draw") {
        const px = Math.max(1, Math.round(scale));
        brush.dataset.size = px;
        brush.style.width = `${px}px`;
        brush.style.height = `${px}px`;
        brush.style.display = 'block';
    } else {
        brush.style.display = 'none';
    }
}

function centreViewport() {
    const centreTile = BOARD_SIZE / 2;
    panX = centreTile - window.innerWidth / 2 / scale;
    panY = centreTile - window.innerHeight / 2 / scale;
}

function zoomTo(targetScale, pxPerSecond = 60) {
    const startScale = scale;
    if (Math.abs(targetScale - startScale) < 0.001) return;
    const duration = Math.abs(targetScale - startScale) / pxPerSecond * 1000;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const anchorX = panX + cx / startScale;
    const anchorY = panY + cy / startScale;

    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);

    requestAnimationFrame(function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        scale = startScale + (targetScale - startScale) * ease(t);

        panX = anchorX - cx / scale;
        panY = anchorY - cy / scale;

        applyZoom();
        applyPan();

        if (t < 1) requestAnimationFrame(step);
        else updateBrushAppearance();
    });
}

function imageSmoothing(ctx) {
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
}

function fade(element) {
    var op = 1;
    var timer = setInterval(function () {
        if (op <= 0.05) {
            clearInterval(timer);
            element.style.display = 'none';
        }
        element.style.opacity = op;
        element.style.filter = 'alpha(opacity=' + op * 100 + ")";
        op -= op * 0.05;
    }, 50);
}

view.addEventListener("pointerdown", e => {
    e.preventDefault();
    view.setPointerCapture(e.pointerId);
    dragging = true;
    if (mode === "pan") {
        view.style.cursor = "grabbing";
        startX = e.clientX; startY = e.clientY;
        startPanX = panX; startPanY = panY;
    } else {
        paintPixel(e);
    }
}, { passive: false });

window.addEventListener("pointermove", e => {
    if (!dragging) return;
    if (mode === "pan") {
        panX = startPanX + (startX - e.clientX) / scale;
        panY = startPanY + (startY - e.clientY) / scale;
        applyPan();
    } else if (mode === "draw") {
        const size = Number(brush.dataset.size) || 1;
        brush.style.left = `${e.clientX - size / 2}px`;
        brush.style.top = `${e.clientY - size / 2}px`;
        if (dragging) {
            paintPixel(e);
        }
    }
}, { passive: false });

window.addEventListener("pointerup", e => {
    view.releasePointerCapture(e.pointerId);
    dragging = false;
    if (mode === "pan") view.style.cursor = "grab";
    if (mode === "draw") uploadData();
}, { passive: false });

drawBtn.addEventListener('click', () => {
    const enteringDraw = mode === "pan";
    mode = enteringDraw ? "draw" : "pan";
    if (scale < MID_SCALE) zoomTo(MID_SCALE); 
    view.style.cursor = mode === "pan" ? "grab" : "none";
    picker.style.visibility = mode === "pan" ? "hidden" : "visible";
    drawImgHand.style.display = mode === "pan" ? "block" : "none";
    drawImgBrush.style.display = mode === "pan" ? "none" : "block";
    drawBtn.style.backgroundColor = mode === "pan" ? colorMap['A'] : colorMap[currentColorKey];
    updateBrushAppearance();
});

document.addEventListener("DOMContentLoaded", async () => {
    imageSmoothing(boardCtx);
    imageSmoothing(viewCtx);
    await loadData();
    drawBoardFromRLE(dataRows);
    centreViewport();
    applyZoom(); applyPan();
    initColorPicker();
    fade(loadingScreen);
});

/* Retired functions
const SHEET_HTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRnt7kqPpOJP81IAW14QSKX7LlFPP_AN8H-eXwzhPz0YaA7yDKAatdyGN50kcNB9d96QLup8ar8cm9t/pubhtml?gid=0&single=true&widget=false&chrome=false"

async function loadData() {
    const html = await fetch(SHEET_HTML_URL).then(r => r.text());
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const rows = temp.querySelectorAll("table.waffle tbody tr");
    dataRows = Array.from(rows).map(row => {
        const cells = row.querySelectorAll("td");
        return Array.from(cells).map(cell => cell.textContent.trim());
    })
}

function boardToRLE() {
    const rleRows = [];
    for (let cellY = 0; cellY < 10; cellY++) {
        const row = [];
        for (let cellX = 0; cellX < 10; cellX++) {
            let out = '';
            let prevRLE = null, rep = 0;
            for (let y = 0; y < 100; y++) {
                const codes = [];
                for (let x = 0; x < 100; x++) {
                    const { data: [r, g, b] } = boardCtx.getImageData(cellX * 100 + x,
                        cellY * 100 + y, 1, 1);
                    const hex = rgbToHex(r, g, b);
                    codes.push(Object.entries(colorMap).find(([, c]) => c === hex)?.[0] ?? 'A');
                }
                const rle = charsToRLE(codes);
                if (rle === prevRLE) {
                    rep++;
                } else {
                    if (prevRLE !== null) out += prevRLE + (rep > 1 ? rep : '') + 'Z';
                    prevRLE = rle;
                    rep = 1;
                }
            }
            out += prevRLE + (rep > 1 ? rep : '') + 'Z';
            row.push(out);
        }
        rleRows.push(row);
    }
    return rleRows;
}

function charsToRLE(chars) {
    let res = '', cur = chars[0], len = 1;
    const flush = () => res += len < 3 ? cur.repeat(len) : len + cur;
    for (let i = 1; i < chars.length; i++)
        if (chars[i] === cur) len++; else { flush(); cur = chars[i]; len = 1; }
    flush();
    return res;
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}*/