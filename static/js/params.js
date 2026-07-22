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
            App.searchAz = parseFloat(data.search_az) || 0;
            App.searchEl = parseFloat(data.search_el) || 0;
            drawAzimuth(App.currentAz);
            drawElevation(App.currentEl);
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
            App.searchAz = params.search_az;
            App.searchEl = params.search_el;
            drawAzimuth(App.currentAz);
            drawElevation(App.currentEl);
            return true;
        } else {
            alert('Ошибка сохранения');
            return false;
        }
    } catch (e) {
        alert('Ошибка: ' + e.message);
        return false;
    }
}

async function loadLockThreshold() {
    try {
        const resp = await fetch('/api/lock_threshold');
        if (resp.ok) {
            const data = await resp.json();
            App.lockThreshold = data.value;
            document.getElementById('lockThresholdDisplay').textContent = App.lockThreshold.toFixed(2);
            document.getElementById('lockThresholdInput').value = App.lockThreshold.toFixed(2);
        }
    } catch (e) {
        console.warn('Error loading lock threshold:', e);
    }
}

async function setLockThreshold() {
    const input = document.getElementById('lockThresholdInput');
    const value = parseFloat(input.value);
    if (isNaN(value)) {
        alert('Введите корректное число');
        return;
    }
    try {
        const resp = await fetch('/api/lock_threshold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        if (resp.ok) {
            App.lockThreshold = value;
            document.getElementById('lockThresholdDisplay').textContent = value.toFixed(2);
        } else {
            alert('Ошибка при установке порога');
        }
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
}

// Функция загрузки координат места
async function loadPlaceParams() {
    try {
        const resp = await fetch('/api/place_params');
        if (resp.ok) {
            const data = await resp.json();
            document.getElementById('place_lon').value = data.lon;
            document.getElementById('place_lat').value = data.lat;
        }
    } catch (e) {
        console.warn('Error loading place params:', e);
    }
}

// ИСПРАВЛЕННАЯ функция сохранения координат
async function savePlaceParams() {
    const lon = parseFloat(document.getElementById('place_lon').value);
    const lat = parseFloat(document.getElementById('place_lat').value);
    if (isNaN(lon) || isNaN(lat)) {
        alert('Введите корректные значения широты и долготы');
        return;
    }
    try {
        // 1. Отправляем координаты
        const resp = await fetch('/api/place_params', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lon, lat })
        });
        if (resp.ok) {
            // 2. После успешной установки координат принудительно отправляем параметры антенны,
            // чтобы антенна перезаписала диапазоны поиска (они могли сброситься или не обновиться)
            const antSuccess = await saveAntennaParams();
            if (antSuccess) {
                alert('Координаты и параметры поиска обновлены');
            } else {
                alert('Координаты установлены, но параметры поиска не обновлены');
            }
        } else {
            alert('Ошибка при установке координат');
        }
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
}