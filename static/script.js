let azimuthCanvas, elevationCanvas;
let azCtx, elCtx;
let currentAz = 0, currentEl = 0;
let prevEl = 0;
let elDisplayMode = 'normal'; // 'normal', 'deploying', 'stowing'

document.addEventListener('DOMContentLoaded', () => {
    azimuthCanvas = document.getElementById('azimuthCanvas');
    elevationCanvas = document.getElementById('elevationCanvas');
    azCtx = azimuthCanvas.getContext('2d');
    elCtx = elevationCanvas.getContext('2d');
    drawAzimuth(0);
    drawElevation(0);
});

async function fetchTelemetry() {
    try {
        const response = await fetch('/api/telemetry');
        const data = await response.json();
        
        const curAz = parseFloat(data.cur_az) || 0;
        const tarAz = parseFloat(data.tar_az) || 0;
        let curEl = parseFloat(data.cur_el) || 0;
        const tarEl = parseFloat(data.tar_el) || 0;
        const curPol = parseFloat(data.cur_pol) || 0;
        const tarPol = parseFloat(data.tar_pol) || 0;
        
        // Определяем направление движения по углу места
        const elDiff = curEl - prevEl;
        const statusText = data.status || '';
        const statusCode = data.status_code;
        
        // Логика отображения угла места
        let displayEl, displayElText;
        let elDisplayValue = curEl;
        
        // Проверяем статус из телеметрии
        const isDeploying = statusText.includes('Развёртывание') || statusCode === 17 || statusCode === 19;
        const isStowing = statusText.includes('Складывание') || statusCode === 33 || statusCode === 35;
        
        if (curEl < 0 && isDeploying) {
            // Разворачивается
            displayElText = 'Идёт развёртывание';
            elDisplayMode = 'deploying';
            displayEl = '--';
            elDisplayValue = curEl;
        } else if (curEl < 0 && isStowing) {
            // Складывается
            displayElText = 'Идёт складывание';
            elDisplayMode = 'stowing';
            displayEl = '--';
            elDisplayValue = curEl;
        } else if (curEl < 0 && elDiff < 0) {
            // Движется вниз (складывается)
            displayElText = 'Идёт складывание';
            elDisplayMode = 'stowing';
            displayEl = '--';
            elDisplayValue = curEl;
        } else if (curEl < 0 && elDiff > 0) {
            // Движется вверх (разворачивается)
            displayElText = 'Идёт развёртывание';
            elDisplayMode = 'deploying';
            displayEl = '--';
            elDisplayValue = curEl;
        } else if (curEl < 0) {
            // Если непонятно, но всё ещё отрицательное
            displayElText = 'Позиционирование';
            elDisplayMode = 'deploying';
            displayEl = '--';
            elDisplayValue = curEl;
        } else {
            // Нормальный режим (угол >= 0)
            displayEl = curEl.toFixed(1) + '°';
            displayElText = curEl.toFixed(1) + '°';
            elDisplayMode = 'normal';
            elDisplayValue = curEl;
        }
        
        // Обновляем DOM с учётом логики
        document.getElementById('cur_az').innerHTML = curAz.toFixed(1) + '°';
        document.getElementById('tar_az').innerText = tarAz.toFixed(1);
        
        // Угол места - специальная обработка
        const elElement = document.getElementById('cur_el');
        if (curEl < 0 && (isDeploying || isStowing || elDiff !== 0)) {
            elElement.innerHTML = displayElText;
            elElement.style.fontSize = '18px';
            elElement.style.color = '#f39c12';
        } else if (curEl >= 0) {
            elElement.innerHTML = displayElText;
            elElement.style.fontSize = '28px';
            elElement.style.color = '#2c3e50';
        } else {
            elElement.innerHTML = '--°';
            elElement.style.fontSize = '28px';
            elElement.style.color = '#2c3e50';
        }
        
        document.getElementById('tar_el').innerText = tarEl.toFixed(1);
        document.getElementById('cur_pol').innerHTML = curPol.toFixed(1) + '°';
        document.getElementById('tar_pol').innerText = tarPol.toFixed(1);
        document.getElementById('agc').innerHTML = (data.agc || '--') + ' В';
        
        const statusDisplay = data.status || '--';
        document.getElementById('status').innerText = statusDisplay;
        if (data.status_code !== null && data.status_code !== undefined) {
            document.getElementById('status_code').innerText = 'Код: ' + data.status_code;
        }
        
        document.getElementById('gps').innerText = data.gps || '--';
        document.getElementById('lon').innerText = data.lon || '--';
        document.getElementById('lat').innerText = data.lat || '--';
        
        // Для визуализации используем реальное значение (может быть отрицательным)
        currentAz = curAz;
        currentEl = Math.max(0, curEl); // Но рисуем только от 0 и выше
        drawAzimuth(curAz);
        drawElevation(Math.max(0, curEl));
        document.getElementById('azimuthValue').innerText = curAz.toFixed(1) + '°';
        
        // Для elevation value показываем текст статуса если отрицательное
        const elVizValue = document.getElementById('elevationValue');
        if (curEl < 0 && (isDeploying || isStowing || elDiff !== 0)) {
            elVizValue.innerText = displayElText;
            elVizValue.style.fontSize = '14px';
            elVizValue.style.color = '#f39c12';
        } else {
            elVizValue.innerText = Math.max(0, curEl).toFixed(1) + '°';
            elVizValue.style.fontSize = '18px';
            elVizValue.style.color = '#2c3e50';
        }
        
        // Сохраняем предыдущее значение для определения направления
        prevEl = curEl;
        
    } catch (err) {
        console.warn("Telemetry fetch error:", err);
    }
}

// Простой рисунок азимута (вид сверху)
function drawAzimuth(angle) {
    const ctx = azCtx;
    const w = azimuthCanvas.width;
    const h = azimuthCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 25;
    
    ctx.clearRect(0, 0, w, h);
    
    // Круг
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Метки через 30 градусов
    for (let i = 0; i < 12; i++) {
        const deg = i * 30;
        const rad = (deg - 90) * Math.PI / 180;
        const len = i % 3 === 0 ? 15 : 8;
        ctx.strokeStyle = i % 3 === 0 ? '#7f8c8d' : '#bdc3c7';
        ctx.lineWidth = i % 3 === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * (radius - len), cy + Math.sin(rad) * (radius - len));
        ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
        ctx.stroke();
    }
    
    // Подписи N, E, S, W
    const dirs = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 4; i++) {
        const rad = (i * 90 - 90) * Math.PI / 180;
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dirs[i], cx + Math.cos(rad) * (radius - 25), cy + Math.sin(rad) * (radius - 25));
    }
    
    // Стрелка
    const rad = (angle - 90) * Math.PI / 180;
    const len = radius - 12;
    const head = 10;
    
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
    ctx.stroke();
    
    // Наконечник
    const tipX = cx + Math.cos(rad) * len;
    const tipY = cy + Math.sin(rad) * len;
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(rad - 0.5) * head, tipY - Math.sin(rad - 0.5) * head);
    ctx.lineTo(tipX - Math.cos(rad + 0.5) * head, tipY - Math.sin(rad + 0.5) * head);
    ctx.closePath();
    ctx.fill();
    
    // Центр
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
}

// Простой рисунок угла места (вид сбоку) - всегда рисует от 0 до 90
function drawElevation(angle) {
    const ctx = elCtx;
    const w = elevationCanvas.width;
    const h = elevationCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 20;
    const radius = Math.min(w, h) / 2 - 30;
    
    ctx.clearRect(0, 0, w, h);
    
    // Ограничиваем угол для отображения (0-90)
    const displayAngle = Math.max(0, Math.min(90, angle));
    
    // Полукруг
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI, 0);
    ctx.stroke();
    
    // Горизонталь
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Метки через 15 градусов
    for (let i = 0; i <= 6; i++) {
        const deg = i * 15;
        const rad = (180 - deg) * Math.PI / 180;
        ctx.strokeStyle = i % 2 === 0 ? '#7f8c8d' : '#bdc3c7';
        ctx.lineWidth = i % 2 === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * (radius - 10), cy - Math.sin(rad) * (radius - 10));
        ctx.lineTo(cx + Math.cos(rad) * radius, cy - Math.sin(rad) * radius);
        ctx.stroke();
    }
    
    // Подписи 0, 45, 90
    const labels = [[0, 0], [45, 45], [90, 90]];
    for (let i = 0; i < labels.length; i++) {
        const deg = labels[i][1];
        const rad = (180 - deg) * Math.PI / 180;
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const off = deg === 0 ? 8 : 0;
        ctx.fillText(labels[i][0] + '°', cx + Math.cos(rad) * (radius - 25), cy - Math.sin(rad) * (radius - 25) + off);
    }
    
    // Антенна (используем displayAngle)
    const rad = (180 - displayAngle) * Math.PI / 180;
    const len = radius - 5;
    
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len);
    ctx.stroke();
    
    // Основание
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(cx - 12, cy + 2, 24, 12);
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 12, cy + 2, 24, 12);
    
    // Точка на конце
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Центр
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
}

setInterval(fetchTelemetry, 333);
fetchTelemetry();

async function sendCommand(payload) {
    const statusDiv = document.getElementById('cmdStatus');
    try {
        const resp = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
        const result = await resp.json();
        statusDiv.innerText = '✓ ' + payload;
        statusDiv.style.color = '#27ae60';
        setTimeout(() => {
            if (statusDiv.innerText.includes('✓')) statusDiv.innerText = '';
        }, 3000);
    } catch (err) {
        statusDiv.innerText = '✗ ' + err.message;
        statusDiv.style.color = '#e74c3c';
    }
}

function manualSpeed() {
    let speed = prompt("Скорость (0.00..6.00)", "3.00");
    if (speed) sendCommand('cmd,manual,1,' + speed + ',');
}

function manualPosition() {
    let az = prompt("Азимут", "180.00");
    let el = prompt("Угол места", "21.50");
    let pol = prompt("Поляризация", "-90.00");
    if (az && el && pol) sendCommand('cmd,dir,' + az + ',' + el + ',' + pol + ',');
}

function setPosition() {
    let az = document.getElementById('az').value;
    let el = document.getElementById('el').value;
    let pol = document.getElementById('pol').value;
    if (az && el && pol) sendCommand('cmd,dir,' + az + ',' + el + ',' + pol + ',');
    else alert("Заполните все поля");
}

function setSpeed() {
    let speed = document.getElementById('speed').value;
    let adj = document.getElementById('adj').value;
    sendCommand('cmd,manual,' + adj + ',' + speed + ',');
}