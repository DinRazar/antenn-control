// Загрузка спутников с сервера
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

// Обновление выпадающего списка
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
        App.selectedSatellite = null;
        return;
    }
    App.selectedSatellite = App.satellites.find(s => s.id === id);
    if (App.selectedSatellite) {
        document.getElementById('satPos').textContent = App.selectedSatellite.position + '°' + (App.selectedSatellite.position >= 0 ? ' E' : ' W');
        document.getElementById('satFreq').textContent = App.selectedSatellite.frequency + ' МГц';
        document.getElementById('satPol').textContent = App.selectedSatellite.polarization === 0 ? 'Горизонтальная' : 'Вертикальная';
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
            App.satellites.push(newSat);
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
    if (!App.selectedSatellite) {
        alert('Выберите спутник');
        return;
    }

    const sat = App.selectedSatellite;
    const cmd = 'cmd,sat,' + sat.name + ',' + sat.frequency.toFixed(2) + ',0,0,' + sat.position.toFixed(2) + ',' + sat.polarization + ',5.00,';
    sendCommand(cmd);
    showStatus('Наведение на спутник ' + sat.name + ' (' + sat.position + '°' + (sat.position >= 0 ? 'E' : 'W') + ')');
}