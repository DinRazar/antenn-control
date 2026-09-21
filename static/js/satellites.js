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

function calculateAngles(satLongitude, placeLon, placeLat) {
    const delta = (satLongitude - placeLon) * Math.PI / 180;
    const latRad = placeLat * Math.PI / 180;
    const cosDelta = Math.cos(delta);
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);

    const numerator = cosDelta * cosLat - 0.151;
    const denominator = Math.sqrt(1 - cosDelta * cosDelta * cosLat * cosLat);
    let elRad = Math.atan2(numerator, denominator);
    let elDeg = elRad * 180 / Math.PI;

    let azRad = Math.PI - Math.atan2(Math.tan(delta), sinLat);
    let azDeg = azRad * 180 / Math.PI;
    if (azDeg < 0) azDeg += 360;
    if (azDeg >= 360) azDeg -= 360;

    let polRad = Math.atan2(Math.sin(delta), Math.tan(latRad));
    let polDeg = polRad * 180 / Math.PI;

    return { az: azDeg, el: elDeg, pol: polDeg };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- UI-помощники для панели статуса ---

function setRefStatus(text) {
    const el = document.getElementById('refStatusDisplay');
    if (el) el.textContent = text;
}

function addStatusLog(line) {
    const el = document.getElementById('refStatusLog');
    if (!el) return;
    const t = new Date().toLocaleTimeString();
    el.innerHTML += `<div>[${t}] ${line}</div>`;
    el.scrollTop = el.scrollHeight;
}

function clearStatusLog() {
    const el = document.getElementById('refStatusLog');
    if (el) el.innerHTML = '';
    const btn = document.getElementById('skipWaitBtn');
    if (btn) btn.style.display = 'none';
}

// --- Пропуск ожидания ---
let skipWaitFlag = false;
function skipReferenceWait() {
    skipWaitFlag = true;
    addStatusLog('>>> Пользователь пропустил ожидание');
}

// --- Ожидание завершения наведения ---
async function waitForPointingComplete(timeoutMs = 180000) {
    const doneCodes = [51, 81, 83];         // Наведение/Сопровождение — успех
    const failCodes = [18, 34, 50, 68];     // Ошибки
    const startTime = Date.now();
    const seen = new Set();
    let lastCode = null;

    const skipBtn = document.getElementById('skipWaitBtn');
    if (skipBtn) skipBtn.style.display = 'none';
    setTimeout(() => {
        if (skipBtn && skipBtn.style.display === 'none') {
            skipBtn.style.display = 'inline-block';
        }
    }, 15000);

    while (Date.now() - startTime < timeoutMs) {
        if (skipWaitFlag) {
            skipWaitFlag = false;
            return { success: false, skipped: true, reason: 'skipped by user', seen: Array.from(seen) };
        }

        let data;
        try {
            const resp = await fetch('/api/telemetry');
            data = await resp.json();
        } catch (e) {
            await sleep(300);
            continue;
        }

        const code = data.status_code;
        const text = data.status || '';

        if (code !== null && code !== undefined && code !== lastCode) {
            lastCode = code;
            if (!seen.has(code)) {
                seen.add(code);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                addStatusLog(`t=${elapsed}s → ${code} (${text})`);
                console.log(`[RefPointing] t=${elapsed}s status=${code} (${text})`);
            }
        }

        if (code !== null && code !== undefined) {
            setRefStatus(`Статус: ${code} — ${text}`);
        }

        if (doneCodes.includes(code)) {
            return { success: true, code, text, seen: Array.from(seen) };
        }
        if (failCodes.includes(code)) {
            return { success: false, code, text, reason: `ошибка (статус ${code} — ${text})`, seen: Array.from(seen) };
        }

        await sleep(300);
    }

    return { success: false, reason: 'таймаут', seen: Array.from(seen) };
}

// --- Основная функция референсного наведения ---
async function performReferencePointing() {
    skipWaitFlag = false;
    clearStatusLog();

    const refSelect = document.getElementById('refSatelliteSelect');
    const refId = parseInt(refSelect.value);
    if (!refId) { alert('Выберите референсный спутник'); return; }
    const refSat = App.satellites.find(s => s.id === refId);
    if (!refSat) { alert('Референсный спутник не найден'); return; }

    if (App.placeLon === null || App.placeLat === null) {
        alert('Координаты места не загружены. Проверьте параметры.');
        return;
    }

    const targetPos = parseFloat(document.getElementById('targetPosition').value);
    const targetPol = parseInt(document.getElementById('targetPolarization').value);
    if (isNaN(targetPos) || targetPos < -180 || targetPos > 180) {
        alert('Введите корректную позицию целевого спутника (-180..180)');
        return;
    }
    if (targetPol !== 0 && targetPol !== 1) { alert('Выберите поляризацию'); return; }

    // Логируем стартовый статус
    try {
        const r = await fetch('/api/telemetry');
        const d = await r.json();
        addStatusLog(`Стартовый статус: ${d.status_code} (${d.status || '--'})`);
    } catch (e) { /* ignore */ }

    // --- ШАГ 1: cmd,sat — записать параметры спутника ---
    const cmdRef = `cmd,sat,${refSat.name},${refSat.frequency.toFixed(2)},0,0,${refSat.position.toFixed(2)},${refSat.polarization},5.00,`;
    addStatusLog(`1) Отправлено: cmd,sat (${refSat.name}, ${refSat.position}°)`);
    setRefStatus('1/3: Запись параметров референсного...');
    sendCommand(cmdRef);

    // Небольшая пауза, чтобы антенна успела принять параметры
    await sleep(1500);

    // --- ШАГ 2: cmd,search — запустить наведение ---
    addStatusLog('2) Отправлено: cmd,search');
    setRefStatus('2/3: Запуск поиска на референсный...');
    sendCommand('cmd,search,');

    // --- ШАГ 3: ждём завершения наведения ---
    setRefStatus('3/3: Ожидание наведения...');
    const result = await waitForPointingComplete(180000);

    if (!result.success && !result.skipped) {
        const history = (result.seen || []).join(' → ');
        alert(`Не удалось навестись на референсный спутник.\nПричина: ${result.reason}\n\nВиденные статусы:\n${history}`);
        setRefStatus(`Ошибка: ${result.reason}`);
        return;
    }

    if (result.skipped) {
        addStatusLog('Ожидание пропущено пользователем — продолжаем с текущими углами');
    } else {
        addStatusLog(`✓ Наведение завершено (статус ${result.code} — ${result.text})`);
    }

    // Пауза и обновление телеметрии
    await sleep(800);
    await fetchTelemetry();

    const factAz = App.currentAz;
    const factEl = App.currentEl;
    const factPol = App.currentPol;
    if (isNaN(factAz) || isNaN(factEl) || isNaN(factPol)) {
        alert('Не удалось получить текущие углы антенны');
        return;
    }

    addStatusLog(`Факт: AZ=${factAz.toFixed(2)} EL=${factEl.toFixed(2)} POL=${factPol.toFixed(2)}`);

    const theorRef = calculateAngles(refSat.position, App.placeLon, App.placeLat);
    addStatusLog(`Теория (ref): AZ=${theorRef.az.toFixed(2)} EL=${theorRef.el.toFixed(2)} POL=${theorRef.pol.toFixed(2)}`);

    const deltaAz = factAz - theorRef.az;
    const deltaEl = factEl - theorRef.el;
    const deltaPol = factPol - theorRef.pol;
    App.refCorrections = { deltaAz, deltaEl, deltaPol };
    updateCorrectionsDisplay();
    addStatusLog(`Поправки: ΔAZ=${deltaAz.toFixed(2)} ΔEL=${deltaEl.toFixed(2)} ΔPOL=${deltaPol.toFixed(2)}`);

    // --- ШАГ 4: наводимся на целевой с поправками через cmd,dir ---
    const theorTarget = calculateAngles(targetPos, App.placeLon, App.placeLat);
    const corrAz = theorTarget.az + deltaAz;
    const corrEl = theorTarget.el + deltaEl;
    const corrPol = theorTarget.pol + deltaPol;

    addStatusLog(`4) Отправка cmd,dir: AZ=${corrAz.toFixed(2)} EL=${corrEl.toFixed(2)} POL=${corrPol.toFixed(2)}`);
    const cmdTarget = `cmd,dir,${corrAz.toFixed(2)},${corrEl.toFixed(2)},${corrPol.toFixed(2)},`;
    sendCommand(cmdTarget);

    setRefStatus(`✓ Целевой: AZ=${corrAz.toFixed(2)}° EL=${corrEl.toFixed(2)}° POL=${corrPol.toFixed(2)}°`);
    addStatusLog('✓ Команда на целевой отправлена');
}

function updateCorrectionsDisplay() {
    const deltaAzSpan = document.getElementById('deltaAz');
    const deltaElSpan = document.getElementById('deltaEl');
    const deltaPolSpan = document.getElementById('deltaPol');
    if (!deltaAzSpan || !deltaElSpan || !deltaPolSpan) return;
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

function resetCorrections() {
    App.refCorrections = null;
    updateCorrectionsDisplay();
    alert('Поправки сброшены.');
}