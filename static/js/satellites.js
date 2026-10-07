// --- Загрузка спутников ---

async function loadSatellites() {
    try {
        const response = await fetch('/api/satellites');
        App.satellites = await response.json();
        updateSatelliteSelect();
    } catch (e) {
        console.warn('Error loading satellites:', e);
        App.satellites = [];
    }
}

function updateSatelliteSelect() {
    const select = document.getElementById('satelliteSelect');
    if (!select) return;
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

// --- Модальное окно ---

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

// --- Утилиты ---

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

// --- Состояние поиска ---
let pointingInProgress = false;
let stopRequested = false;

// --- UI-помощники ---

function setAutoStatus(text) {
    const block = document.getElementById('autoStatusBlock');
    const disp = document.getElementById('autoStatusDisplay');
    if (block && disp) {
        block.style.display = 'block';
        disp.textContent = text;
    }
}

// --- Ожидание завершения наведения ---
async function waitForPointingComplete() {
    // Успех: 51 (наведение выполнено), 81 (сопровождение), 83 (сопровождение выполнено)
    // Провал: 18, 34, 50, 68
    const doneCodes = [51, 81, 83];
    const failCodes = [18, 34, 50, 68];
    const startTime = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 минут
    let lastCode = null;

    while (Date.now() - startTime < TIMEOUT_MS) {
        if (stopRequested) {
            return { success: false, stopped: true, reason: 'прервано пользователем' };
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

        if (code !== lastCode) {
            lastCode = code;
            setAutoStatus(`Статус: ${code} — ${text}`);
        }

        if (doneCodes.includes(code)) {
            return { success: true, code, text };
        }
        if (failCodes.includes(code)) {
            return { success: false, code, text, reason: `ошибка (статус ${code} — ${text})` };
        }

        await sleep(300);
    }

    return { success: false, reason: 'таймаут ожидания' };
}

// --- Выбрать спутник (только cmd,sat, без наведения) ---
async function pointToSatellite() {
    if (!App.selectedSatellite) {
        alert('Выберите спутник');
        return;
    }

    const sat = App.selectedSatellite;
    App.committedSatellite = sat;   // ← ЗАПОМИНАЕМ, что именно ушло в cmd,sat

    setAutoStatus(`Отправка параметров спутника ${sat.name}...`);

    const cmdSat = `cmd,sat,${sat.name},${sat.frequency.toFixed(2)},0,0,${sat.position.toFixed(2)},${sat.polarization},5.00,`;
    sendCommand(cmdSat);

    await sleep(800);

    setAutoStatus(`✓ Спутник ${sat.name} (${sat.position}°) выбран. Нажмите "Поиск" для наведения.`);
}

// --- Поиск (cmd,search + ожидание + расчёт поправок) ---
async function startSearch() {
    if (pointingInProgress) {
        alert('Поиск уже выполняется. Дождитесь завершения или нажмите "Стоп".');
        return;
    }

    if (!App.committedSatellite) {
        alert('Сначала выберите спутник и нажмите "Выбрать".');
        return;
    }
    pointingInProgress = true;
    stopRequested = false;

    setAutoStatus('Запуск поиска...');
    sendCommand('cmd,search,');

    setAutoStatus('Ожидание наведения...');
    const result = await waitForPointingComplete();

    if (result.stopped) {
        setAutoStatus('Поиск прерван пользователем. Поправки не сохранены.');
        pointingInProgress = false;
        return;
    }

    if (!result.success) {
        setAutoStatus(`✗ ${result.reason}`);
        alert(`Автонаведение не удалось.\nПричина: ${result.reason}\n\nПоправки не сохранены.`);
        pointingInProgress = false;
        return;
    }

    // Успех — считаем поправки
    setAutoStatus('✓ Наведение завершено, расчёт поправок...');
    await sleep(800);
    await fetchTelemetry();

    const factAz = App.currentAz;
    const factEl = App.currentEl;
    const factPol = App.currentPol;

    if (isNaN(factAz) || isNaN(factEl) || isNaN(factPol)) {
        setAutoStatus('✗ Не удалось прочитать фактические углы');
        alert('Не удалось получить текущие углы антенны');
        pointingInProgress = false;
        return;
    }

    if (App.placeLon === null || App.placeLat === null) {
        setAutoStatus('✗ Координаты места не загружены');
        alert('Координаты места не загружены. Проверьте параметры.');
        pointingInProgress = false;
        return;
    }

    const sat = App.committedSatellite;
    if (!sat) {
        setAutoStatus('✗ Сначала нажмите "Выбрать"');
        alert('Сначала нажмите "Выбрать", чтобы отправить параметры спутника.');
        pointingInProgress = false;
        return;
    }

    // T_ref — теория референса по формуле
    const T_ref = calculateAngles(sat.position, App.placeLon, App.placeLat);
    // A_ref — факт, куда встала антенна
    const A_ref = { az: factAz, el: factEl, pol: factPol };

    App.refTheor = T_ref;
    App.refActual = A_ref;
    App.referenceSatellite = sat;

    // Внутренняя механическая ошибка (нужна для расчёта целевого)
    App.refCorrections = {
        deltaAz:  A_ref.az  - T_ref.az,
        deltaEl:  A_ref.el  - T_ref.el,
        deltaPol: A_ref.pol - T_ref.pol
    };

    updateCorrectionsDisplay();
    updateRefModeButton();

    setAutoStatus(`✓ Поправки сохранены: ΔАЗ=${App.refCorrections.deltaAz.toFixed(2)}° ΔЭЛ=${App.refCorrections.deltaEl.toFixed(2)}° ΔПОЛ=${App.refCorrections.deltaPol.toFixed(2)}°`);

    alert(`✓ Наведение успешно!\n\nПоправки (по ${sat.name}):\nΔАЗ = ${App.refCorrections.deltaAz.toFixed(2)}°\nΔЭЛ = ${App.refCorrections.deltaEl.toFixed(2)}°\nΔПОЛ = ${App.refCorrections.deltaPol.toFixed(2)}°\n\nРеференсный режим разблокирован.`);

    pointingInProgress = false;
}

// --- Стоп ---
async function stopSearch() {
    stopRequested = true;
    sendCommand('cmd,stop,');
    setAutoStatus('Отправлен Стоп.');
}

// --- Наведение с поправкой (референсный режим) ---
async function pointWithCorrection() {
    if (!App.refTheor || !App.refActual || !App.referenceSatellite) {
        alert('Поправки не заданы. Сначала выполните автонаведение.');
        return;
    }
    if (App.placeLon === null || App.placeLat === null) {
        alert('Координаты места не загружены.');
        return;
    }

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

    const T_ref    = App.refTheor;
    const A_ref    = App.refActual;
    const T_target = calculateAngles(targetPos, App.placeLon, App.placeLat);

    // ТВОЯ поправка = T_ref − T_target
    const corr = {
        az:  T_ref.az  - T_target.az,
        el:  T_ref.el  - T_target.el,
        pol: T_ref.pol - T_target.pol
    };

    // Итог = A_ref − поправка
    const corrAz  = A_ref.az  - corr.az;
    const corrEl  = A_ref.el  - corr.el;
    const corrPol = A_ref.pol - corr.pol;

    // Отправляем cmd,sat для целевого (чтобы антенна знала H/V)
    const freq = App.referenceSatellite.frequency || 11701.50;
    setAutoStatus('Отправка параметров целевого спутника...');
    sendCommand(`cmd,sat,Target,${freq.toFixed(2)},0,0,${targetPos.toFixed(2)},${targetPol},5.00,`);

    await sleep(1500);

    setAutoStatus('Наведение на целевой...');
    sendCommand(`cmd,dir,${corrAz.toFixed(2)},${corrEl.toFixed(2)},${corrPol.toFixed(2)},`);

    alert(
        `Референс ${App.referenceSatellite.position}°E:\n` +
        `  теория:  AZ=${T_ref.az.toFixed(2)}°  EL=${T_ref.el.toFixed(2)}°  POL=${T_ref.pol.toFixed(2)}°\n` +
        `  факт:    AZ=${A_ref.az.toFixed(2)}°  EL=${A_ref.el.toFixed(2)}°  POL=${A_ref.pol.toFixed(2)}°\n\n` +
        `Целевой ${targetPos}°E (теория):\n` +
        `  AZ=${T_target.az.toFixed(2)}°  EL=${T_target.el.toFixed(2)}°  POL=${T_target.pol.toFixed(2)}°\n\n` +
        `Поправка (T_ref − T_target):\n` +
        `  ΔAZ=${corr.az.toFixed(2)}°  ΔEL=${corr.el.toFixed(2)}°  ΔPOL=${corr.pol.toFixed(2)}°\n\n` +
        `ОТПРАВЛЕНО (A_ref − поправка):\n` +
        `  AZ  = ${corrAz.toFixed(2)}°\n` +
        `  EL  = ${corrEl.toFixed(2)}°\n` +
        `  POL = ${corrPol.toFixed(2)}°`
    );
}

// --- Обновление UI поправок и кнопки ---

function updateCorrectionsDisplay() {
    const deltaAzSpan = document.getElementById('deltaAz');
    const deltaElSpan = document.getElementById('deltaEl');
    const deltaPolSpan = document.getElementById('deltaPol');
    const srcInfo = document.getElementById('refSourceInfo');

    if (!deltaAzSpan || !deltaElSpan || !deltaPolSpan) return;

    if (App.refCorrections) {
        deltaAzSpan.textContent = App.refCorrections.deltaAz.toFixed(2) + '°';
        deltaElSpan.textContent = App.refCorrections.deltaEl.toFixed(2) + '°';
        deltaPolSpan.textContent = App.refCorrections.deltaPol.toFixed(2) + '°';
        if (srcInfo && App.referenceSatellite) {
            srcInfo.textContent = `${App.referenceSatellite.name} (${App.referenceSatellite.position}°)`;
        }
    } else {
        deltaAzSpan.textContent = '—';
        deltaElSpan.textContent = '—';
        deltaPolSpan.textContent = '—';
        if (srcInfo) srcInfo.textContent = '—';
    }
}

function updateRefModeButton() {
    const btn = document.getElementById('refModeBtn');
    if (!btn) return;
    if (App.refCorrections) {
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.textContent = 'Референсный';
        btn.title = 'Референсный режим доступен';
    } else {
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        btn.textContent = 'Референсный 🔒';
        btn.title = 'Сначала выполните автонаведение';
    }
}

function resetCorrections() {
    App.refCorrections = null;
    App.referenceSatellite = null;
    App.refTheor = null;
    App.refActual = null;
    updateCorrectionsDisplay();
    updateRefModeButton();

    if (App.mode === 'reference') {
        const autoBtn = document.querySelector('#modeToggle .btn[data-mode="auto"]');
        if (autoBtn) autoBtn.click();
    }
}