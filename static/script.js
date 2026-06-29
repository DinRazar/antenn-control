let azimuthCanvas, elevationCanvas;
let azCtx, elCtx;
let currentAz = 0, currentEl = 0;
let prevEl = 0;
let satellites = [];
let selectedSatellite = null;

// Параметры антенны (окно поиска)
let searchAz = 0;    // полный азимут поиска (делится на 2)
let searchEl = 0;    // полный угол места поиска (без деления)

// Целевые значения
let targetAz = 0;
let targetEl = 0;

// Флаг, показывать ли диапазоны поиска (только при автоматическом наведении)
let showSearchRange = false;

// Загрузка спутников с сервера
async function loadSatellites() {
    try {
        const response = await fetch('/api/satellites');
        satellites = await response.json();
        updateSatelliteSelect();
    } catch (e) {
        console.warn('Error loading satellites:', e);
        satellites = [];
    }
}

// Обновление выпадающего списка
function updateSatelliteSelect() {
    const select = document.getElementById('satelliteSelect');
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Выберите --</option>';
    satellites.forEach(sat => {
        const option = document.createElement('option');
        option.value = sat.id;
        option.textContent = sat.name + ' (' + sat.position + '°' + (sat.position >= 0 ? 'E' : 'W') + ')';
        select.appendChild(option);
    });
    if (currentValue) {
        select.value = currentValue;
    }
}

// Выбор спутника
function selectSatellite() {
    const select = document.getElementById('satelliteSelect');
    const id = parseInt(select.value);
    if (!id) {
        document.getElementById('satPos').textContent = '--';
        document.getElementById('satFreq').textContent = '--';
        document.getElementById('satPol').textContent = '--';
        selectedSatellite = null;
        return;
    }
    selectedSatellite = satellites.find(s => s.id === id);
    if (selectedSatellite) {
        document.getElementById('satPos').textContent = selectedSatellite.position + '°' + (selectedSatellite.position >= 0 ? ' E' : ' W');
        document.getElementById('satFreq').textContent = selectedSatellite.frequency + ' МГц';
        document.getElementById('satPol').textContent = selectedSatellite.polarization === 0 ? 'Горизонтальная' : 'Вертикальная';
    }
}

// Показать модальное окно
function showAddSatellite() {
    document.getElementById('satModal').style.display = 'block';
    document.getElementById('satName').value = '';
    document.getElementById('satPosition').value = '';
    document.getElementById('satFrequency').value = '';
    document.getElementById('satPolarization').value = '1';
}

// Закрыть модальное окно
function closeModal() {
    document.getElementById('satModal').style.display = 'none';
}

// Закрытие по клику вне модального окна
window.onclick = function(event) {
    const modal = document.getElementById('satModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Сохранение спутника на сервере
async function saveSatellite() {
    const name = document.getElementById('satName').value.trim();
    const position = parseFloat(document.getElementById('satPosition').value);
    const frequency = parseFloat(document.getElementById('satFrequency').value);
    const polarization = parseInt(document.getElementById('satPolarization').value);
    
    if (!name) {
        alert('Введите название спутника');
        return;
    }
    if (isNaN(position) || position < -180 || position > 180) {
        alert('Введите корректную позицию (-180..180)');
        return;
    }
    if (isNaN(frequency)) {
        alert('Введите корректную частоту');
        return;
    }
    if (polarization !== 0 && polarization !== 1) {
        alert('Выберите поляризацию');
        return;
    }
    
    try {
        const response = await fetch('/api/satellites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                position: position,
                frequency: frequency,
                polarization: polarization
            })
        });
        
        if (response.ok) {
            const newSat = await response.json();
            satellites.push(newSat);
            updateSatelliteSelect();
            closeModal();
            document.getElementById('satelliteSelect').value = newSat.id;
            selectSatellite();
            showStatus('Спутник "' + name + '" добавлен');
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (e) {
        alert('Ошибка при сохранении: ' + e.message);
    }
}

// Наведение на спутник
function pointToSatellite() {
    if (!selectedSatellite) {
        alert('Выберите спутник');
        return;
    }
    
    const sat = selectedSatellite;
    const cmd = 'cmd,sat,' + sat.name + ',' + sat.frequency.toFixed(2) + ',0,0,' + sat.position.toFixed(2) + ',' + sat.polarization + ',5.00,';
    sendCommand(cmd);
    showStatus('Наведение на спутник ' + sat.name + ' (' + sat.position + '°' + (sat.position >= 0 ? 'E' : 'W') + ')');
}

// Показать статус
function showStatus(msg) {
    const statusDiv = document.getElementById('cmdStatus');
    statusDiv.innerText = '✓ ' + msg;
    statusDiv.style.color = '#27ae60';
    setTimeout(() => {
        if (statusDiv.innerText.includes('✓')) statusDiv.innerText = '';
    }, 5000);
}

// --- Параметры антенны ---
async function loadAntennaParams() {
    try {
        const resp = await fetch('/api/antenna_params');
        if (resp.ok) {
            const data = await resp.json();
            document.getElementById('search_az').value = data.search_az;
            document.getElementById('cal_el').value = data.cal_el;
            document.getElementById('cal_pol').value = data.cal_pol;
            document.getElementById('cal_az').value = data.cal_az;
            document.getElementById('search_el').value = data.search_el;
            document.getElementById('search_step').value = data.search_step;
            // Сохраняем для визуализации
            searchAz = parseFloat(data.search_az) || 0;
            searchEl = parseFloat(data.search_el) || 0;
            // Перерисовываем
            drawAzimuth(currentAz);
            drawElevation(Math.max(0, currentEl));
        }
    } catch (e) {
        console.warn('Error loading antenna params:', e);
    }
}

async function saveAntennaParams() {
    const params = {
        search_az: parseFloat(document.getElementById('search_az').value),
        cal_el: parseFloat(document.getElementById('cal_el').value),
        cal_pol: parseFloat(document.getElementById('cal_pol').value),
        cal_az: parseFloat(document.getElementById('cal_az').value),
        search_el: parseFloat(document.getElementById('search_el').value),
        search_step: parseFloat(document.getElementById('search_step').value)
    };
    for (let key in params) {
        if (isNaN(params[key])) {
            alert('Все поля должны быть числами');
            return;
        }
    }
    try {
        const resp = await fetch('/api/antenna_params', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        if (resp.ok) {
            // Обновляем локальные переменные
            searchAz = params.search_az;
            searchEl = params.search_el;
            // Перерисовываем
            drawAzimuth(currentAz);
            drawElevation(Math.max(0, currentEl));
            const statusDiv = document.getElementById('paramsStatus');
            statusDiv.innerText = '✓ Параметры сохранены';
            statusDiv.style.color = '#27ae60';
            setTimeout(() => {
                if (statusDiv.innerText.includes('✓')) statusDiv.innerText = '';
            }, 5000);
        } else {
            alert('Ошибка сохранения');
        }
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
}

// --- Остальные функции ---
document.addEventListener('DOMContentLoaded', () => {
    azimuthCanvas = document.getElementById('azimuthCanvas');
    elevationCanvas = document.getElementById('elevationCanvas');
    azCtx = azimuthCanvas.getContext('2d');
    elCtx = elevationCanvas.getContext('2d');
    drawAzimuth(0);
    drawElevation(0);
    loadSatellites();
    loadAntennaParams();
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
        
        // Сохраняем целевые значения для визуализации
        targetAz = tarAz;
        targetEl = tarEl;
        
        // Определяем, нужно ли показывать диапазоны поиска (автоматическое наведение)
        const statusCode = data.status_code;
        const statusText = data.status || '';
        // Коды автоматического наведения: 49-52 (наведение), 81-84 (сопровождение)
        // Также если статус содержит "Наведение" или "Сопровождение"
        const autoCodes = [49, 50, 51, 52, 81, 82, 83, 84];
        const isAuto = autoCodes.includes(statusCode) || 
                       statusText.includes('Наведение') || 
                       statusText.includes('Сопровождение');
        showSearchRange = isAuto;
        
        const elDiff = curEl - prevEl;
        const isDeploying = statusText.includes('Развёртывание') || statusCode === 17 || statusCode === 19;
        const isStowing = statusText.includes('Складывание') || statusCode === 33 || statusCode === 35;
        
        let displayEl, displayElText;
        if (curEl < 0 && (isDeploying || isStowing || elDiff !== 0)) {
            if (isDeploying || elDiff > 0) {
                displayElText = 'Идёт развёртывание';
            } else if (isStowing || elDiff < 0) {
                displayElText = 'Идёт складывание';
            } else {
                displayElText = 'Позиционирование';
            }
            displayEl = '--';
        } else if (curEl >= 0) {
            displayEl = curEl.toFixed(1) + '°';
            displayElText = curEl.toFixed(1) + '°';
        } else {
            displayEl = '--°';
            displayElText = '--°';
        }
        
        document.getElementById('cur_az').innerHTML = curAz.toFixed(1) + '°';
        document.getElementById('tar_az').innerText = tarAz.toFixed(1);
        
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
        
        currentAz = curAz;
        currentEl = Math.max(0, curEl);
        // Перерисовываем с учетом флага showSearchRange
        drawAzimuth(curAz);
        drawElevation(Math.max(0, curEl));
        document.getElementById('azimuthValue').innerText = curAz.toFixed(1) + '°';
        
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
        
        prevEl = curEl;
        
    } catch (err) {
        console.warn("Telemetry fetch error:", err);
    }
}

// Функции рисования с добавлением диапазона поиска и цели
function drawAzimuth(angle) {
    const ctx = azCtx;
    const w = azimuthCanvas.width;
    const h = azimuthCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 25;
    
    ctx.clearRect(0, 0, w, h);
    
    // ---- Рисуем диапазон поиска (сектор) только если нужно ----
    if (showSearchRange && searchAz > 0 && targetAz >= 0) {
        const half = searchAz / 2;
        let startAngle = targetAz - half;
        let endAngle = targetAz + half;
        // Нормализуем углы в радианы (от -90° для начала отсчета на компасе)
        let startRad = (startAngle - 90) * Math.PI / 180;
        let endRad = (endAngle - 90) * Math.PI / 180;
        // Чтобы дуга была от меньшего к большему по часовой стрелке
        if (endRad < startRad) endRad += 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startRad, endRad);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    
    // ---- Рисуем базовый круг и метки ----
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    
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
    
    const dirs = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 4; i++) {
        const rad = (i * 90 - 90) * Math.PI / 180;
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dirs[i], cx + Math.cos(rad) * (radius - 25), cy + Math.sin(rad) * (radius - 25));
    }
    
    // ---- Рисуем целевую стрелку (пунктир) ----
    if (targetAz >= 0) {
        const rad = (targetAz - 90) * Math.PI / 180;
        const len = radius - 12;
        const head = 8;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        // Наконечник
        const tipX = cx + Math.cos(rad) * len;
        const tipY = cy + Math.sin(rad) * len;
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(rad - 0.5) * head, tipY - Math.sin(rad - 0.5) * head);
        ctx.lineTo(tipX - Math.cos(rad + 0.5) * head, tipY - Math.sin(rad + 0.5) * head);
        ctx.closePath();
        ctx.fill();
    }
    
    // ---- Рисуем текущую стрелку (синяя) ----
    const rad = (angle - 90) * Math.PI / 180;
    const len = radius - 12;
    const head = 10;
    
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
    ctx.stroke();
    
    const tipX = cx + Math.cos(rad) * len;
    const tipY = cy + Math.sin(rad) * len;
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(rad - 0.5) * head, tipY - Math.sin(rad - 0.5) * head);
    ctx.lineTo(tipX - Math.cos(rad + 0.5) * head, tipY - Math.sin(rad + 0.5) * head);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawElevation(angle) {
    const ctx = elCtx;
    const w = elevationCanvas.width;
    const h = elevationCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 20;
    const radius = Math.min(w, h) / 2 - 30;
    
    ctx.clearRect(0, 0, w, h);
    
    // ---- Рисуем диапазон поиска по углу места (сектор) только если нужно ----
    if (showSearchRange && searchEl > 0 && targetEl >= 0) {
        // Диапазон от targetEl - searchEl до targetEl + searchEl
        let low = targetEl - searchEl;
        let high = targetEl + searchEl;
        // Ограничим 0-90
        low = Math.max(0, low);
        high = Math.min(90, high);
        if (low < high) {
            // Преобразуем углы в радианы для дуги
            // В нашей системе 0° — слева, 90° — сверху, угол растёт против часовой
            // Для рисования сектора от low до high используем дугу против часовой стрелки (counterclockwise = false)
            // от угла (180 - low) до (180 - high)
            const startRad = Math.PI + (low * Math.PI / 180);
            const endRad = Math.PI + (high * Math.PI / 180);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startRad, endRad, false); // против часовой
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
    
    // ---- Рисуем полукруг и метки ----
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI, 0);
    ctx.stroke();
    
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    
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
    
    // ---- Рисуем целевую стрелку (пунктир) ----
    if (targetEl >= 0) {
        const displayAngle = Math.max(0, Math.min(90, targetEl));
        const rad = (180 - displayAngle) * Math.PI / 180;
        const len = radius - 8;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        // Наконечник - кружок
        const tipX = cx + Math.cos(rad) * len;
        const tipY = cy - Math.sin(rad) * len;
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // ---- Рисуем текущую антенну (синяя) ----
    const displayAngle = Math.max(0, Math.min(90, angle));
    const rad = (180 - displayAngle) * Math.PI / 180;
    const len = radius - 5;
    
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len);
    ctx.stroke();
    
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(cx - 12, cy + 2, 24, 12);
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 12, cy + 2, 24, 12);
    
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(rad) * len, cy - Math.sin(rad) * len, 3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
}

setInterval(fetchTelemetry, 333);
fetchTelemetry();

// Отправка команды
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