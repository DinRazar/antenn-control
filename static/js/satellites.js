// --- Спутники (существующие функции) ---

async function loadSatellites() {
    try {
        const response = await fetch('/api/satellites');
        App.satellites = await response.json();
        updateSatelliteSelect();
        updateRefSatelliteSelects(); // для референсного режима
    } catch (e) {
        console.warn('Error loading satellites:', e);
        App.satellites = [];
    }
}

function updateSatelliteSelect() {
    const select = document.getElementById('satelliteSelect');
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Выберите --</option>';
    App.satellites.forEach(sat => {
        const option = document.createElement('option');
        option.value = sat.id;
        option.textContent = sat.name + ' (' + sat.position + '°' + (sat.position >= 0 ? 'E' : 'W') + ')';
        select.appendChild(option);
    });
    if (currentValue) select.value = currentValue;
}

// Для референсного режима обновляем только селект референсного спутника
function updateRefSatelliteSelects() {
    const refSelect = document.getElementById('refSatelliteSelect');
    const refVal = refSelect.value;
    refSelect.innerHTML = '<option value="">-- Выберите --</option>';
    App.satellites.forEach(sat => {
        const opt1 = document.createElement('option');
        opt1.value = sat.id;
        opt1.textContent = sat.name + ' (' + sat.position + '°' + (sat.position >= 0 ? 'E' : 'W') + ')';
        refSelect.appendChild(opt1);
    });
    if (refVal) refSelect.value = refVal;
    selectRefSatellite();
}

function selectSatellite() {
    const select = document.getElementById('satelliteSelect');
    const id = parseInt(select.value);
    if (!id) {
        document.getElementById('satPos').textContent = '--';
        document.getElementById('satFreq').textContent = '--';
        document.getElementById('satPol').textContent = '--';
        App.selectedSatellite = null;
        return;
    }
    App.selectedSatellite = App.satellites.find(s => s.id === id);
    if (App.selectedSatellite) {
        const pos = App.selectedSatellite.position;
        document.getElementById('satPos').textContent = pos + '°' + (pos >= 0 ? ' E' : ' W');
        document.getElementById('satFreq').textContent = App.selectedSatellite.frequency + ' МГц';
        document.getElementById('satPol').textContent = App.selectedSatellite.polarization === 0 ? 'Горизонтальная' : 'Вертикальная';
    }
}

function selectRefSatellite() {
    const select = document.getElementById('refSatelliteSelect');
    const id = parseInt(select.value);
    const sat = App.satellites.find(s => s.id === id);
    if (sat) {
        document.getElementById('refSatPos').textContent = sat.position + '°' + (sat.position >= 0 ? ' E' : ' W');
        document.getElementById('refSatFreq').textContent = sat.frequency + ' МГц';
        document.getElementById('refSatPol').textContent = sat.polarization === 0 ? 'Горизонтальная' : 'Вертикальная';
    } else {
        document.getElementById('refSatPos').textContent = '--';
        document.getElementById('refSatFreq').textContent = '--';
        document.getElementById('refSatPol').textContent = '--';
    }
}

// --- Модальное окно (без изменений) ---

function showAddSatellite() {
    document.getElementById('satModal').style.display = 'block';
    document.getElementById('satName').value = '';
    document.getElementById('satPosition').value = '';
    document.getElementById('satFrequency').value = '';
    document.getElementById('satPolarization').value = '1';
}

function closeModal() {
    document.getElementById('satModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('satModal');
    if (event.target === modal) modal.style.display = 'none';
};

async function saveSatellite() {
    const name = document.getElementById('satName').value.trim();
    const position = parseFloat(document.getElementById('satPosition').value);
    const frequency = parseFloat(document.getElementById('satFrequency').value);
    const polarization = parseInt(document.getElementById('satPolarization').value);
    
    if (!name) { alert('Введите название'); return; }
    if (isNaN(position) || position < -180 || position > 180) {
        alert('Введите корректную позицию (-180..180)');
        return;
    }
    if (isNaN(frequency)) { alert('Введите корректную частоту'); return; }
    if (polarization !== 0 && polarization !== 1) { alert('Выберите поляризацию'); return; }
    
    try {
        const response = await fetch('/api/satellites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, position, frequency, polarization })
        });
        
        if (response.ok) {
            const newSat = await response.json();
            App.satellites.push(newSat);
            updateSatelliteSelect();
            updateRefSatelliteSelects();
            closeModal();
            document.getElementById('satelliteSelect').value = newSat.id;
            selectSatellite();
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (e) {
        alert('Ошибка при сохранении: ' + e.message);
    }
}

function pointToSatellite() {
    if (!App.selectedSatellite) {
        alert('Выберите спутник');
        return;
    }
    const sat = App.selectedSatellite;
    const cmd = 'cmd,sat,' + sat.name + ',' + sat.frequency.toFixed(2) + ',0,0,' + sat.position.toFixed(2) + ',' + sat.polarization + ',5.00,';
    sendCommand(cmd);
}

// --- НОВЫЕ ФУНКЦИИ ДЛЯ АВТОМАТИЧЕСКОГО РЕФЕРЕНСНОГО НАВЕДЕНИЯ ---

// Расчёт теоретических углов по формулам из form.jpg
function calculateAngles(satLongitude, placeLon, placeLat) {
    // Переводим всё в радианы
    const delta = (satLongitude - placeLon) * Math.PI / 180;
    const latRad = placeLat * Math.PI / 180;
    const cosDelta = Math.cos(delta);
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);

    // Угол места
    const numerator = cosDelta * cosLat - 0.151;
    const denominator = Math.sqrt(1 - cosDelta * cosDelta * cosLat * cosLat);
    let elRad = Math.atan2(numerator, denominator);
    let elDeg = elRad * 180 / Math.PI;

    // Азимут
    let azRad = Math.PI - Math.atan2(Math.tan(delta), sinLat);
    let azDeg = azRad * 180 / Math.PI;
    if (azDeg < 0) azDeg += 360;
    if (azDeg >= 360) azDeg -= 360;

    // Поляризация (скос конвертера)
    let polRad = Math.atan2(Math.sin(delta), Math.tan(latRad));
    let polDeg = polRad * 180 / Math.PI;

    return { az: azDeg, el: elDeg, pol: polDeg };
}

// Вспомогательная функция для задержки
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ожидание одного из кодов статуса
async function waitForStatus(targetCodes, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const resp = await fetch('/api/telemetry');
        const data = await resp.json();
        const code = data.status_code;
        if (targetCodes.includes(code)) {
            return true;
        }
        await sleep(500);
    }
    return false;
}

// Основная функция референсного наведения
async function performReferencePointing() {
    // 1. Проверка референсного спутника
    const refSelect = document.getElementById('refSatelliteSelect');
    const refId = parseInt(refSelect.value);
    if (!refId) {
        alert('Выберите референсный спутник');
        return;
    }
    const refSat = App.satellites.find(s => s.id === refId);
    if (!refSat) {
        alert('Референсный спутник не найден');
        return;
    }

    // 2. Проверка координат места
    if (App.placeLon === null || App.placeLat === null) {
        alert('Координаты места не загружены. Проверьте параметры.');
        return;
    }

    // 3. Получить параметры целевого спутника (вручную)
    const targetPos = parseFloat(document.getElementById('targetPosition').value);
    const targetPol = parseInt(document.getElementById('targetPolarization').value);
    if (isNaN(targetPos) || targetPos < -180 || targetPos > 180) {
        alert('Введите корректную позицию целевого спутника (-180..180)');
        return;
    }
    if (targetPol !== 0 && targetPol !== 1) {
        alert('Выберите поляризацию');
        return;
    }

    // 4. Наведение на референсный спутник
    const cmdRef = `cmd,sat,${refSat.name},${refSat.frequency.toFixed(2)},0,0,${refSat.position.toFixed(2)},${refSat.polarization},5.00,`;
    sendCommand(cmdRef);

    // 5. Ожидание успешного захвата (коды 51 или 83)
    const ok = await waitForStatus([51, 83]);
    if (!ok) {
        alert('Не удалось навестись на референсный спутник (таймаут)');
        return;
    }

    // 6. Получить актуальные фактические углы
    await sleep(500);
    await fetchTelemetry(); // принудительно обновить телеметрию
    const factAz = App.currentAz;
    const factEl = App.currentEl;
    const factPol = App.currentPol;
    if (isNaN(factAz) || isNaN(factEl) || isNaN(factPol)) {
        alert('Не удалось получить текущие углы антенны');
        return;
    }

    // 7. Вычислить теоретические углы для референсного
    const theorRef = calculateAngles(refSat.position, App.placeLon, App.placeLat);

    // 8. Поправки = факт - теория
    const deltaAz = factAz - theorRef.az;
    const deltaEl = factEl - theorRef.el;
    const deltaPol = factPol - theorRef.pol;
    App.refCorrections = { deltaAz, deltaEl, deltaPol };
    updateCorrectionsDisplay();

    // 9. Наведение на целевой с поправками
    const theorTarget = calculateAngles(targetPos, App.placeLon, App.placeLat);
    const corrAz = theorTarget.az + deltaAz;
    const corrEl = theorTarget.el + deltaEl;
    const corrPol = theorTarget.pol + deltaPol;

    const cmdTarget = `cmd,dir,${corrAz.toFixed(2)},${corrEl.toFixed(2)},${corrPol.toFixed(2)},`;
    sendCommand(cmdTarget);
    alert(`Наведение на целевой спутник отправлено:\nАЗ = ${corrAz.toFixed(2)}°\nЭЛ = ${corrEl.toFixed(2)}°\nПОЛ = ${corrPol.toFixed(2)}°`);
}

// Обновить отображение поправок
function updateCorrectionsDisplay() {
    const deltaAzSpan = document.getElementById('deltaAz');
    const deltaElSpan = document.getElementById('deltaEl');
    const deltaPolSpan = document.getElementById('deltaPol');
    if (App.refCorrections) {
        deltaAzSpan.textContent = App.refCorrections.deltaAz.toFixed(2) + '°';
        deltaElSpan.textContent = App.refCorrections.deltaEl.toFixed(2) + '°';
        deltaPolSpan.textContent = App.refCorrections.deltaPol.toFixed(2) + '°';
    } else {
        deltaAzSpan.textContent = 'не задана';
        deltaElSpan.textContent = 'не задана';
        deltaPolSpan.textContent = 'не задана';
    }
}

// Сбросить поправки
function resetCorrections() {
    App.refCorrections = null;
    updateCorrectionsDisplay();
    alert('Поправки сброшены.');
}