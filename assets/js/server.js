const SHEET_HTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRnt7kqPpOJP81IAW14QSKX7LlFPP_AN8H-eXwzhPz0YaA7yDKAatdyGN50kcNB9d96QLup8ar8cm9t/pubhtml?gid=0&single=true&widget=false&chrome=false"

let dataRows = [];

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

const colorMap = {
    A: "#ff0000",
    B: "#ffffff",
    C: "#0000ff",
};

function decompressLine(rle) {
    const result = [];
    const regex = /(\d+)([A-Z])/g;
    let match;
    while ((match = regex.exec(rle)) !== null) {
        const [, count, char] = match;
        result.push(char.repeat(Number(count)));
    }
    return result.join('');
}

function decompressCell(cellString) {
    const match = cellString.match(/^(.+?)(\d+)Z$/);
    if (!match) {
        console.error("Invalid cell string:", cellString);
        return [];
    }
    const [, rleLine, repeatStr] = match;
    const repeat = parseInt(repeatStr);
    const line = decompressLine(rleLine).split('');
    const lines = [];
    for (let i = 0; i < repeat; i++) {
        lines.push([...line]);
    }
    return lines;
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

const BOARD_SIZE = 1000;

const board = document.getElementById("board");
const view = document.getElementById("view");
const zoomDiv = document.getElementById("zoom");
const camDiv = document.getElementById("camera");
const boardCtx = board.getContext("2d");
const viewCtx = view.getContext("2d");

board.width = board.height = view.width = view.height = BOARD_SIZE;

function imageSmoothing(ctx) {
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
}

let scale = 1.25, panX = 0, panY = 0;
const MIN_SCALE = 1.25, MAX_SCALE = 4;
let dragging = false, sx, sy, spx, spy;

function applyZoom() {
    zoomDiv.style.transform = `scale(${scale})`;
    board.style.width = board.style.height = BOARD_SIZE * scale + "px";
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

    applyZoom();
    applyPan();
}, { passive: false });

function centreViewport() {
    const centreTile = BOARD_SIZE / 2;
    panX = centreTile - window.innerWidth / 2 / scale;
    panY = centreTile - window.innerHeight / 2 / scale;
}

let mode = "pan";
const BLACK = "#000000";

function paintPixel(evt) {
    const rect = view.getBoundingClientRect();
    const screenX = evt.clientX - rect.left;
    const screenY = evt.clientY - rect.top;

    const tileX = Math.floor(screenX / scale);
    const tileY = Math.floor(screenY / scale);

    if (tileX < 0 || tileY < 0 || tileX >= BOARD_SIZE || tileY >= BOARD_SIZE)
        return;

    boardCtx.fillStyle = BLACK;
    boardCtx.fillRect(tileX, tileY, 1, 1);
}

document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() !== "a") return;

    mode = mode === "pan" ? "draw" : "pan";
    view.style.cursor = mode === "pan" ? "grab" : "crosshair";
    console.log("Mode:", mode);
});

view.addEventListener("mousedown", e => {
    dragging = true;
    if (mode === "pan") {
        view.style.cursor = "grabbing";
        startX = e.clientX; startY = e.clientY;
        startPanX = panX; startPanY = panY;
    } else {
        paintPixel(e);
    }
});

window.addEventListener("mousemove", e => {
    if (!dragging) return;

    if (mode === "pan") {
        panX = startPanX + (startX - e.clientX) / scale;
        panY = startPanY + (startY - e.clientY) / scale;
        applyPan();
    } else {
        paintPixel(e);
    }
});

window.addEventListener("mouseup", () => {
    dragging = false;
    if (mode === "pan") view.style.cursor = "grab";
});

document.addEventListener("DOMContentLoaded", async () => {
    imageSmoothing(boardCtx);
    imageSmoothing(viewCtx);
    await loadData();
    for (let y = 0; y < dataRows.length; y++) {
        for (let x = 0; x < dataRows[y].length; x++) {
            drawCell(boardCtx, decompressCell(dataRows[y][x]), x, y);
        }
    }
    centreViewport();
    applyZoom(); applyPan();
});