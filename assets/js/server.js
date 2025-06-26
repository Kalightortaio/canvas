const SHEET_HTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRnt7kqPpOJP81IAW14QSKX7LlFPP_AN8H-eXwzhPz0YaA7yDKAatdyGN50kcNB9d96QLup8ar8cm9t/pubhtml?gid=0&single=true&widget=false&chrome=false"

let dataRows = [];
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

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
        lines.push([...line]); // clone the row
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

document.addEventListener("DOMContentLoaded", async () => {
    canvas.height = canvas.width = 1000;
    await loadData();
    for (let y = 0; y < dataRows.length; y++) {
        for (let x = 0; x < dataRows[y].length; x++) {
            drawCell(ctx, decompressCell(dataRows[y][x]), x, y);
        }
    }
});

window.addEventListener("load", () => {
    setTimeout(() => {
        const scrollX = Math.round(3500 - (window.innerWidth - 1000) / 2);
        const scrollY = Math.round(3500 - (window.innerHeight - 1000) / 2);
        window.scrollTo({ top: scrollY, left: scrollX, behavior: "auto"});
    }, 0);
});