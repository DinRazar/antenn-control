// Используют App.azCtx, App.elCtx, App.currentAz, App.currentEl, 
// App.targetAz, App.targetEl, App.searchAz, App.searchEl, App.showSearchRange

function drawAzimuth(angle) {
    const ctx = App.azCtx;
    const canvas = App.azimuthCanvas;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 25;
    
    ctx.clearRect(0, 0, w, h);
    
    // Диапазон поиска
    if (App.showSearchRange && App.searchAz > 0 && App.targetAz >= 0) {
        const half = App.searchAz / 2;
        let startAngle = App.targetAz - half;
        let endAngle = App.targetAz + half;
        let startRad = (startAngle - 90) * Math.PI / 180;
        let endRad = (endAngle - 90) * Math.PI / 180;
        if (endRad < startRad) endRad += 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startRad, endRad);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    // Базовый круг
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Метки
    for (let i = 0; i < 12; i++) {
        const deg = i * 30;
        const rad = (deg - 90) * Math.PI / 180;
        const len = i % 3 === 0 ? 15 : 8;
        ctx.strokeStyle = i % 3 === 0 ? '#999' : '#d0d0d0';
        ctx.lineWidth = i % 3 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * (radius - len), cy + Math.sin(rad) * (radius - len));
        ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
        ctx.stroke();
    }
    
    // Стороны света
    const dirs = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 4; i++) {
        const rad = (i * 90 - 90) * Math.PI / 180;
        ctx.fillStyle = '#999';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dirs[i], cx + Math.cos(rad) * (radius - 25), cy + Math.sin(rad) * (radius - 25));
    }
    
    // Целевая стрелка
    if (App.targetAz >= 0) {
        const rad = (App.targetAz - 90) * Math.PI / 180;
        const len = radius - 12;
        const head = 8;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        const tipX = cx + Math.cos(rad) * len;
        const tipY = cy + Math.sin(rad) * len;
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(rad - 0.5) * head, tipY - Math.sin(rad - 0.5) * head);
        ctx.lineTo(tipX - Math.cos(rad + 0.5) * head, tipY - Math.sin(rad + 0.5) * head);
        ctx.closePath();
        ctx.fill();
    }
    
    // Текущая стрелка
    const rad = (angle - 90) * Math.PI / 180;
    const len = radius - 12;
    const head = 10;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
    ctx.stroke();
    const tipX = cx + Math.cos(rad) * len;
    const tipY = cy + Math.sin(rad) * len;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(rad - 0.5) * head, tipY - Math.sin(rad - 0.5) * head);
    ctx.lineTo(tipX - Math.cos(rad + 0.5) * head, tipY - Math.sin(rad + 0.5) * head);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawElevation(angle) {
    const ctx = App.elCtx;
    const canvas = App.elevationCanvas;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2 + 20;
    const radius = Math.min(w, h) / 2 - 30;
    
    ctx.clearRect(0, 0, w, h);
    
    // Диапазон поиска
    if (App.showSearchRange && App.searchEl > 0 && App.targetEl >= 0) {
        let low = App.targetEl - App.searchEl;
        let high = App.targetEl + App.searchEl;
        low = Math.max(0, low);
        high = Math.min(90, high);
        if (low < high) {
            const startRad = Math.PI + (low * Math.PI / 180);
            const endRad = Math.PI + (high * Math.PI / 180);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startRad, endRad, false);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    
    // Полукруг
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI, 0);
    ctx.stroke();
    
    // Горизонтальная линия
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Метки
    for (let i = 0; i <= 6; i++) {
        const deg = i * 15;
        const rad = (180 - deg) * Math.PI / 180;
        ctx.strokeStyle = i % 2 === 0 ? '#999' : '#d0d0d0';
        ctx.lineWidth = i % 2 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * (radius - 10), cy - Math.sin(rad) * (radius - 10));
        ctx.lineTo(cx + Math.cos(rad) * radius, cy - Math.sin(rad) * radius);
        ctx.stroke();
    }
    
    const labels = [[0, 0], [45, 45], [90, 90]];
    for (let i = 0; i < labels.length; i++) {
        const deg = labels[i][1];
        const rad = (180 - deg) * Math.PI / 180;
        ctx.fillStyle = '#999';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const off = deg === 0 ? 8 : 0;
        ctx.fillText(labels[i][0] + '°', cx + Math.cos(rad) * (radius - 25), cy - Math.sin(rad) * (radius - 25) + off);
    }
    
    // Целевая точка
    if (App.targetEl >= 0) {
        const displayAngle = Math.max(0, Math.min(90, App.targetEl));
        const rad = (180 - displayAngle) * Math.PI / 180;
        const len = radius - 8;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        const tipX = cx + Math.cos(rad) * len;
        const tipY = cy - Math.sin(rad) * len;
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // Текущая антенна
    const displayAngle = Math.max(0, Math.min(90, angle));
    const rad = (180 - displayAngle) * Math.PI / 180;
    const len = radius - 5;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 10, cy + 2, 20, 10);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(cx - 10, cy + 2, 20, 10);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
}